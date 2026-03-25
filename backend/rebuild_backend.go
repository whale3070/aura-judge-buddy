package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sashabaranov/go-openai"
	"gopkg.in/yaml.v3"
)

type SubmissionForm struct {
	RoundID      string `json:"round_id,omitempty"`
	Track        string `json:"track,omitempty"`
	ProjectTitle string `json:"project_title"`
	OneLiner     string `json:"one_liner,omitempty"`
	Problem      string `json:"problem,omitempty"`
	Solution     string `json:"solution,omitempty"`
	GithubURL    string `json:"github_url,omitempty"`
	DemoURL      string `json:"demo_url,omitempty"`
	DocsText     string `json:"docs_text,omitempty"`
	WhyThisChain string `json:"why_this_chain,omitempty"`
}

type StoredFile struct {
	Name string `json:"name"`
	Size int64  `json:"size,omitempty"`
}

type SubmissionRecord struct {
	ID        string         `json:"id"`
	RoundID   string         `json:"round_id,omitempty"`
	CreatedAt time.Time      `json:"created_at"`
	Form      SubmissionForm `json:"form"`
	Files     []StoredFile   `json:"files,omitempty"`
	GithubUsername          string   `json:"github_username,omitempty"`
	GithubAccountCreatedAt  string   `json:"github_account_created_at,omitempty"`
	GithubAccountYears      float64  `json:"github_account_years,omitempty"`
	GithubEnrichError       string   `json:"github_enrich_error,omitempty"`
	GithubEnrichStatus      string   `json:"github_enrich_status,omitempty"`
	GithubRepoIsFork        bool     `json:"github_repo_is_fork,omitempty"`
	GithubRepoOwnerType     string   `json:"github_repo_owner_type,omitempty"`
	GithubOriginalityStatus string   `json:"github_originality_status,omitempty"` // low_risk|medium_risk|high_risk
	GithubOriginalityReasons []string `json:"github_originality_reasons,omitempty"`
	GithubOriginalityScore  int      `json:"github_originality_score,omitempty"`
	GithubEnrichedAt        *time.Time `json:"github_enriched_at,omitempty"`
}

type SubmissionSummary struct {
	ID           string    `json:"id"`
	RoundID      string    `json:"round_id,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	ProjectTitle string    `json:"project_title"`
	OneLiner     string    `json:"one_liner"`
	GithubURL    string    `json:"github_url"`
	DemoURL      string    `json:"demo_url"`
	WhyThisChain string    `json:"why_this_chain"`
	MDFiles      []string  `json:"md_files"`
	GithubUsername           string   `json:"github_username,omitempty"`
	GithubAccountCreatedAt   string   `json:"github_account_created_at,omitempty"`
	GithubAccountYears       *float64 `json:"github_account_years,omitempty"`
	GithubEnrichError        string   `json:"github_enrich_error,omitempty"`
	GithubEnrichStatus       string   `json:"github_enrich_status,omitempty"`
	GithubRepoIsFork         bool     `json:"github_repo_is_fork,omitempty"`
	GithubRepoOwnerType      string   `json:"github_repo_owner_type,omitempty"`
	GithubOriginalityStatus  string   `json:"github_originality_status,omitempty"`
	GithubOriginalityReasons []string `json:"github_originality_reasons,omitempty"`
	GithubOriginalityScore   int      `json:"github_originality_score,omitempty"`
}

type AuditReport struct {
	ModelName           string    `json:"model_name"`
	Content             string    `json:"content"`
	Score               float64   `json:"score,omitempty"`
	Error               string    `json:"error,omitempty"`
	ScoreConflict       bool      `json:"score_conflict,omitempty"`
	ScoreConflictValues []float64 `json:"score_conflict_values,omitempty"`
}

type SavedResult struct {
	FileName               string        `json:"file_name"`
	AvgScore               float64       `json:"avg_score"`
	LetterGrade            string        `json:"letter_grade,omitempty"`
	Timestamp              string        `json:"timestamp"`
	Reports                []AuditReport `json:"reports"`
	RoundID                string        `json:"round_id,omitempty"`
	RuleVersionID          string        `json:"rule_version_id,omitempty"`
	RuleSHA256             string        `json:"rule_sha256,omitempty"`
	SearchQuery            string        `json:"search_query,omitempty"`
	CompetitorResultsCount int           `json:"competitor_results_count,omitempty"`
	GithubURL              string        `json:"github_url,omitempty"`
	ScoreConflict          bool          `json:"score_conflict,omitempty"`
}

type ruleMeta struct {
	ID         string `json:"id"`
	FileName   string `json:"file_name"`
	Name       string `json:"name,omitempty"`
	Version    string `json:"version,omitempty"`
	UploadedAt string `json:"uploaded_at"`
	UploadedBy string `json:"uploaded_by,omitempty"`
	SHA256     string `json:"sha256"`
	IsActive   bool   `json:"is_active"`
	IsOrphan   bool   `json:"is_orphan,omitempty"`
}

type ruleSetYAML struct {
	Name       string `yaml:"name"`
	Version    string `yaml:"version"`
	Dimensions []struct {
		Key    string `yaml:"key"`
		Name   string `yaml:"name"`
		Weight int    `yaml:"weight"`
	} `yaml:"dimensions"`
	GradingBands []struct {
		Grade string `yaml:"grade"`
		Min   int    `yaml:"min"`
		Max   int    `yaml:"max"`
	} `yaml:"gradingBands"`
}

type ruleIndex struct {
	ActiveID string     `json:"active_id"`
	Versions []ruleMeta `json:"versions"`
}

// Support both legacy and current submission IDs:
// - legacy: "1774155961995848061"
// - current: "1774344590432576114_c1bf810cec73"
var submissionIDOK = regexp.MustCompile(`^(?:[0-9]+|[0-9]+_[a-zA-Z0-9]+)$`)

func submissionFolderIDOK(s string) bool {
	s = strings.TrimSpace(s)
	return s != "" && submissionIDOK.MatchString(s)
}

func isHTTPURL(raw string) bool {
	u, err := url.Parse(strings.TrimSpace(raw))
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

func readJSONFile[T any](path string, out *T) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, out)
}

func writeJSONFile(path string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func readmeFilesByPrefix(roundID, subID string) []string {
	dir := wordDirFor(roundID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	prefix := subID + "_"
	var out []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		n := e.Name()
		if strings.HasPrefix(n, prefix) && strings.HasSuffix(strings.ToLower(n), ".md") {
			out = append(out, n)
		}
	}
	sort.Strings(out)
	return out
}

func submissionSummaryFromMeta(metaPath, subID, roundID string, _ bool) (SubmissionSummary, error) {
	var rec SubmissionRecord
	if err := readJSONFile(metaPath, &rec); err != nil {
		return SubmissionSummary{}, err
	}
	if rec.ID == "" {
		rec.ID = subID
	}
	if rec.RoundID == "" {
		rec.RoundID = roundID
	}
	var years *float64
	if rec.GithubAccountYears > 0 {
		v := rec.GithubAccountYears
		years = &v
	}
	return SubmissionSummary{
		ID:           rec.ID,
		RoundID:      rec.RoundID,
		CreatedAt:    rec.CreatedAt,
		ProjectTitle: rec.Form.ProjectTitle,
		OneLiner:     rec.Form.OneLiner,
		GithubURL:    rec.Form.GithubURL,
		DemoURL:      rec.Form.DemoURL,
		WhyThisChain: rec.Form.WhyThisChain,
		MDFiles:      readmeFilesByPrefix(roundID, rec.ID),
		GithubUsername:           rec.GithubUsername,
		GithubAccountCreatedAt:   rec.GithubAccountCreatedAt,
		GithubAccountYears:       years,
		GithubEnrichError:        rec.GithubEnrichError,
		GithubEnrichStatus:       rec.GithubEnrichStatus,
		GithubRepoIsFork:         rec.GithubRepoIsFork,
		GithubRepoOwnerType:      rec.GithubRepoOwnerType,
		GithubOriginalityStatus:  rec.GithubOriginalityStatus,
		GithubOriginalityReasons: rec.GithubOriginalityReasons,
		GithubOriginalityScore:   rec.GithubOriginalityScore,
	}, nil
}

func submissionSummariesForRound(roundID string) ([]SubmissionSummary, error) {
	entries, err := os.ReadDir(submissionRoundDirFor(roundID))
	if err != nil {
		if os.IsNotExist(err) {
			return []SubmissionSummary{}, nil
		}
		return nil, err
	}
	var out []SubmissionSummary
	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		subID := e.Name()
		metaPath := filepath.Join(submissionRoundDirFor(roundID), subID, "submission.json")
		sum, err := submissionSummaryFromMeta(metaPath, subID, roundID, false)
		if err == nil {
			out = append(out, sum)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out, nil
}

type ghRepoResp struct {
	Fork  bool `json:"fork"`
	Owner struct {
		Login string `json:"login"`
		Type  string `json:"type"`
	} `json:"owner"`
}
type ghUserResp struct {
	Login     string `json:"login"`
	CreatedAt string `json:"created_at"`
}
type ghContributor struct {
	Login         string `json:"login"`
	Type          string `json:"type"`
	Contributions int    `json:"contributions"`
}

func classifyGithubErr(err error) string {
	msg := strings.ToLower(strings.TrimSpace(err.Error()))
	switch {
	case strings.Contains(msg, "403"):
		return "rate_limited"
	case strings.Contains(msg, "401"):
		return "unauthorized"
	case strings.Contains(msg, "404"):
		return "not_found"
	case strings.Contains(msg, "invalid"):
		return "invalid_url"
	case strings.Contains(msg, "timeout"), strings.Contains(msg, "dial"), strings.Contains(msg, "network"):
		return "network"
	default:
		return "unknown"
	}
}

func parseOwnerRepo(raw string) (owner, repo string, ok bool) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return "", "", false
	}
	if !strings.Contains(strings.ToLower(u.Host), "github.com") {
		return "", "", false
	}
	parts := strings.Split(strings.Trim(strings.TrimSpace(u.Path), "/"), "/")
	if len(parts) < 2 {
		return "", "", false
	}
	return parts[0], strings.TrimSuffix(parts[1], ".git"), true
}

func githubToken() string {
	for _, k := range []string{"GITHUB_TOKEN", "GH_TOKEN", "AURA_GITHUB_TOKEN"} {
		if v := strings.TrimSpace(os.Getenv(k)); v != "" {
			return v
		}
	}
	return ""
}

func githubGet(ctx context.Context, token, endpoint string, out any) error {
	req, _ := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	req.Header.Set("Accept", "application/vnd.github+json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("github HTTP %d: %s", res.StatusCode, strings.TrimSpace(string(body)))
	}
	return json.Unmarshal(body, out)
}

func trustedPrefixes() []string {
	raw := strings.TrimSpace(os.Getenv("AURA_ORIGINALITY_TRUSTED_LOGIN_PREFIXES"))
	if raw == "" {
		return []string{}
	}
	parts := strings.Split(raw, ",")
	var out []string
	for _, p := range parts {
		p = strings.TrimSpace(strings.ToLower(p))
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func hasTrustedPrefix(login string) bool {
	login = strings.ToLower(strings.TrimSpace(login))
	if login == "" {
		return false
	}
	for _, p := range trustedPrefixes() {
		if strings.HasPrefix(login, p) {
			return true
		}
	}
	return false
}

func evaluateOriginality(repoFork bool, ownerType, submitter string, cons []ghContributor) (status string, score int, reasons []string) {
	score = 100
	ownerType = strings.ToLower(strings.TrimSpace(ownerType))
	submitter = strings.ToLower(strings.TrimSpace(submitter))
	if ownerType == "organization" {
		return "low_risk", 100, []string{"Repository owner is organization; personal originality checks skipped"}
	}
	if hasTrustedPrefix(submitter) {
		return "low_risk", 100, []string{"Submitter matches trusted login prefix; auto-downgrade skipped"}
	}
	if repoFork {
		score -= 35
		reasons = append(reasons, "Repository is a fork; originality needs manual review")
	}
	total := 0
	subContrib := 0
	topLogin := ""
	topC := 0
	for _, c := range cons {
		login := strings.ToLower(strings.TrimSpace(c.Login))
		typ := strings.ToLower(strings.TrimSpace(c.Type))
		if hasTrustedPrefix(login) || typ == "bot" || strings.Contains(login, "[bot]") {
			continue
		}
		total += c.Contributions
		if login == submitter {
			subContrib += c.Contributions
		}
		if c.Contributions > topC {
			topC = c.Contributions
			topLogin = c.Login
		}
	}
	if total >= 10 && submitter != "" {
		if subContrib == 0 {
			score -= 45
			reasons = append(reasons, "Submitter not found in top contributors")
		} else {
			share := float64(subContrib) * 100.0 / float64(total)
			if share < 20 {
				score -= 35
				reasons = append(reasons, fmt.Sprintf("Submitter contribution share is low (%.1f%%)", share))
			}
		}
	}
	if topLogin != "" && submitter != "" && strings.ToLower(topLogin) != submitter && topC >= 20 {
		score -= 20
		reasons = append(reasons, fmt.Sprintf("Main contributor appears to be %s", topLogin))
	}
	if score < 0 {
		score = 0
	}
	switch {
	case score >= 70:
		status = "low_risk"
	case score >= 40:
		status = "medium_risk"
	default:
		status = "high_risk"
	}
	if len(reasons) == 0 {
		reasons = []string{"No major originality risk signals detected from repository metadata"}
	}
	return
}

func enrichSubmission(metaPath string, rec *SubmissionRecord) {
	token := githubToken()
	if token == "" || strings.TrimSpace(rec.Form.GithubURL) == "" {
		return
	}
	if rec.GithubEnrichedAt != nil && strings.TrimSpace(rec.GithubOriginalityStatus) != "" && strings.TrimSpace(rec.GithubRepoOwnerType) != "" {
		return
	}
	owner, repo, ok := parseOwnerRepo(rec.Form.GithubURL)
	if !ok {
		rec.GithubEnrichStatus = "invalid_url"
		rec.GithubEnrichError = "invalid github_url"
		rec.GithubOriginalityStatus = "medium_risk"
		rec.GithubOriginalityScore = 50
		rec.GithubOriginalityReasons = []string{"Invalid GitHub URL; originality cannot be assessed"}
		now := time.Now().UTC()
		rec.GithubEnrichedAt = &now
		_ = writeJSONFile(metaPath, rec)
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	var rr ghRepoResp
	if err := githubGet(ctx, token, fmt.Sprintf("https://api.github.com/repos/%s/%s", url.PathEscape(owner), url.PathEscape(repo)), &rr); err != nil {
		rec.GithubEnrichStatus = classifyGithubErr(err)
		rec.GithubEnrichError = err.Error()
		rec.GithubOriginalityStatus = "medium_risk"
		rec.GithubOriginalityScore = 50
		rec.GithubOriginalityReasons = []string{"GitHub repository metadata unavailable; originality requires manual review"}
		now := time.Now().UTC()
		rec.GithubEnrichedAt = &now
		_ = writeJSONFile(metaPath, rec)
		return
	}
	var ur ghUserResp
	if err := githubGet(ctx, token, fmt.Sprintf("https://api.github.com/users/%s", url.PathEscape(rr.Owner.Login)), &ur); err != nil {
		rec.GithubEnrichStatus = classifyGithubErr(err)
		rec.GithubEnrichError = err.Error()
		rec.GithubOriginalityStatus = "medium_risk"
		rec.GithubOriginalityScore = 50
		rec.GithubOriginalityReasons = []string{"GitHub user metadata unavailable; originality requires manual review"}
		now := time.Now().UTC()
		rec.GithubEnrichedAt = &now
		_ = writeJSONFile(metaPath, rec)
		return
	}
	rec.GithubUsername = ur.Login
	rec.GithubRepoIsFork = rr.Fork
	rec.GithubRepoOwnerType = strings.ToLower(strings.TrimSpace(rr.Owner.Type))
	rec.GithubAccountCreatedAt = ur.CreatedAt
	if t, err := time.Parse(time.RFC3339, ur.CreatedAt); err == nil {
		years := time.Since(t).Hours() / (365.25 * 24)
		rec.GithubAccountYears = float64(int(years*10+0.5)) / 10
	}
	var cons []ghContributor
	if err := githubGet(ctx, token, fmt.Sprintf("https://api.github.com/repos/%s/%s/contributors?per_page=100", url.PathEscape(owner), url.PathEscape(repo)), &cons); err == nil {
		st, sc, rs := evaluateOriginality(rr.Fork, rr.Owner.Type, rec.GithubUsername, cons)
		rec.GithubOriginalityStatus = st
		rec.GithubOriginalityScore = sc
		rec.GithubOriginalityReasons = rs
	} else {
		rec.GithubOriginalityStatus = "medium_risk"
		rec.GithubOriginalityScore = 50
		rec.GithubOriginalityReasons = []string{"Contributors data unavailable; originality requires manual review"}
	}
	rec.GithubEnrichStatus = "success"
	rec.GithubEnrichError = ""
	now := time.Now().UTC()
	rec.GithubEnrichedAt = &now
	_ = writeJSONFile(metaPath, rec)
}

func resultPath(roundID, fileName string) string {
	return filepath.Join(resultDirFor(roundID), fileName+".json")
}

func writeResult(roundID string, res *SavedResult) error {
	if err := os.MkdirAll(resultDirFor(roundID), 0755); err != nil {
		return err
	}
	p := resultPath(roundID, res.FileName)
	return writeJSONFile(p, res)
}

func loadRanking(roundID string) ([]SavedResult, error) {
	entries, err := os.ReadDir(resultDirFor(roundID))
	if err != nil {
		if os.IsNotExist(err) {
			return []SavedResult{}, nil
		}
		return nil, err
	}
	var out []SavedResult
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		var r SavedResult
		if err := readJSONFile(filepath.Join(resultDirFor(roundID), e.Name()), &r); err == nil && strings.TrimSpace(r.FileName) != "" {
			out = append(out, r)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].AvgScore > out[j].AvgScore })
	return out, nil
}

func postAudit(c *gin.Context) {
	var body struct {
		TargetFile     string   `json:"target_file"`
		CustomPrompt   string   `json:"custom_prompt"`
		SelectedModels []string `json:"selected_models"`
		OutputLang     string   `json:"output_lang"`
		RoundID        string   `json:"round_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	roundID, err := sanitizeRoundIDOrDefault(body.RoundID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid round_id"})
		return
	}
	fileName := filepath.Base(strings.TrimSpace(body.TargetFile))
	if fileName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "target_file required"})
		return
	}
	models := body.SelectedModels
	if len(models) == 0 {
		models = []string{"deepseek", "doubao"}
	}
	docPath, err := resolveWordDocumentPath(roundID, fileName)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "target_file not found in word directory"})
		return
	}
	doc, err := os.ReadFile(docPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read target file"})
		return
	}
	activeYAML, ruleID, _ := loadEffectiveRuleYAMLForRound(roundID)
	reports := make([]AuditReport, 0, len(models))
	total := 0.0
	okCount := 0
	anyScoreConflict := false
	var failReasons []string
	for _, m := range models {
		content, score, conflict, conflictValues, llmErr := runSingleModelAudit(strings.TrimSpace(strings.ToLower(m)), body.OutputLang, body.CustomPrompt, fileName, string(doc), activeYAML)
		rep := AuditReport{ModelName: m}
		if llmErr != nil {
			rep.Error = normalizeLLMErr(llmErr)
			rep.Content = ""
			failReasons = append(failReasons, fmt.Sprintf("%s: %s", m, rep.Error))
			reports = append(reports, rep)
			continue
		}
		rep.Content = content
		rep.Score = score
		rep.ScoreConflict = conflict
		rep.ScoreConflictValues = conflictValues
		if conflict {
			anyScoreConflict = true
		}
		total += score
		okCount++
		reports = append(reports, rep)
	}
	if okCount == 0 {
		errMsg := "all selected models failed"
		if len(failReasons) > 0 {
			errMsg = strings.Join(failReasons, " | ")
		}
		c.JSON(http.StatusBadGateway, gin.H{
			"error":   errMsg,
			"reports": reports,
		})
		return
	}
	avg := total / float64(okCount)
	res := &SavedResult{
		FileName:   fileName,
		AvgScore:   avg,
		LetterGrade: gradeFromBands(avg, activeYAML),
		Timestamp:  time.Now().UTC().Format(time.RFC3339),
		Reports:    reports,
		RoundID:    roundID,
		RuleVersionID: ruleID,
		RuleSHA256:    currentRuleSHA(roundID),
		ScoreConflict: anyScoreConflict,
	}
	if err := writeResult(roundID, res); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

func getRanking(c *gin.Context) {
	roundID, err := sanitizeRoundIDOrDefault(c.Query("round_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid round_id"})
		return
	}
	trackFilter := normalizeTrackID(c.Query("track"))
	if strings.TrimSpace(c.Query("track")) != "" && trackFilter == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid track"})
		return
	}
	rows, err := loadRanking(roundID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "load ranking failed"})
		return
	}
	activeYAML, _, _ := loadEffectiveRuleYAMLForRound(roundID)
	highTier := strings.ToUpper(strings.TrimSpace(os.Getenv("AURA_ORIGINALITY_DOWNGRADE_HIGH")))
	medTier := strings.ToUpper(strings.TrimSpace(os.Getenv("AURA_ORIGINALITY_DOWNGRADE_MEDIUM")))
	filtered := make([]SavedResult, 0, len(rows))
	for i := range rows {
		if strings.TrimSpace(rows[i].LetterGrade) == "" {
			rows[i].LetterGrade = gradeFromBands(rows[i].AvgScore, activeYAML)
		}
		subID := parseSubmissionIDFromStandardReadmeWordFile(rows[i].FileName)
		if !submissionFolderIDOK(subID) {
			if trackFilter == "" {
				filtered = append(filtered, rows[i])
			}
			continue
		}
		metaPath := filepath.Join(submissionRoundDirFor(roundID), subID, "submission.json")
		var rec SubmissionRecord
		if err := readJSONFile(metaPath, &rec); err != nil {
			if trackFilter == "" {
				filtered = append(filtered, rows[i])
			}
			continue
		}
		if trackFilter != "" {
			rowTrack := detectSubmissionTrack(&rec, roundID, subID)
			if rowTrack != trackFilter {
				continue
			}
		}
		target := ""
		if rec.GithubOriginalityStatus == "high_risk" {
			target = highTier
		}
		if rec.GithubOriginalityStatus == "medium_risk" {
			target = medTier
		}
		if hasTrustedPrefix(rec.GithubUsername) {
			target = ""
		}
		switch target {
		case "D":
			rows[i].AvgScore = 45
			rows[i].LetterGrade = "D"
		case "C":
			rows[i].AvgScore = 65
			rows[i].LetterGrade = "C"
		}
		filtered = append(filtered, rows[i])
	}
	sort.Slice(filtered, func(i, j int) bool { return filtered[i].AvgScore > filtered[j].AvgScore })
	c.JSON(http.StatusOK, filtered)
}

func normalizeTrackID(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	switch s {
	case "", "all":
		return ""
	case "agent_infra", "agent-infra", "agentinfrastructure", "infrastructure":
		return "agent_infra"
	case "user_facing", "user-facing", "userfacing":
		return "user_facing"
	default:
		return ""
	}
}

func detectSubmissionTrack(rec *SubmissionRecord, roundID, subID string) string {
	if rec != nil {
		t := normalizeTrackID(rec.Form.Track)
		if t != "" {
			return t
		}
		text := strings.ToLower(strings.Join([]string{
			rec.Form.ProjectTitle,
			rec.Form.OneLiner,
			rec.Form.Problem,
			rec.Form.Solution,
			rec.Form.DocsText,
			rec.Form.WhyThisChain,
		}, "\n"))
		if hasAny(text, "agent infrastructure", "基础设施", "tooling and primitives", "developer tools") {
			return "agent_infra"
		}
		if hasAny(text, "user-facing ai agents", "user-facing", "telegram", "payment bots", "assistants", "automation products", "用户") {
			return "user_facing"
		}
	}
	if strings.TrimSpace(subID) != "" {
		p := filepath.Join(wordDirFor(roundID), subID+"_00_README.md")
		if b, err := os.ReadFile(p); err == nil {
			s := strings.ToLower(string(b))
			if hasAny(s, "track: **agent infrastructure", "agent infrastructure alignment", "智能体基础设施") {
				return "agent_infra"
			}
			if hasAny(s, "user-facing ai agents", "inside telegram", "payment bots", "automation products", "用户可交互") {
				return "user_facing"
			}
		}
	}
	return "agent_infra"
}

func hasAny(s string, keys ...string) bool {
	for _, k := range keys {
		if strings.Contains(s, strings.ToLower(k)) {
			return true
		}
	}
	return false
}

func getJudgeResult(c *gin.Context) {
	roundID, err := sanitizeRoundIDOrDefault(c.Query("round_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid round_id"})
		return
	}
	fileName := filepath.Base(strings.TrimSpace(c.Query("file")))
	if fileName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file required"})
		return
	}
	var res SavedResult
	if err := readJSONFile(resultPath(roundID, fileName), &res); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "judge result not found"})
		return
	}
	c.JSON(http.StatusOK, res)
}

func getFiles(c *gin.Context) {
	roundID, err := sanitizeRoundIDOrDefault(c.Query("round_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid round_id"})
		return
	}
	entries, err := os.ReadDir(wordDirFor(roundID))
	if err != nil {
		if os.IsNotExist(err) {
			c.JSON(http.StatusOK, []string{})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(strings.ToLower(e.Name()), ".md") {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)
	c.JSON(http.StatusOK, files)
}

func getSubmissions(c *gin.Context) {
	roundID, err := sanitizeRoundIDOrDefault(c.Query("round_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid round_id"})
		return
	}
	entries, err := os.ReadDir(submissionRoundDirFor(roundID))
	if err != nil {
		if os.IsNotExist(err) {
			c.JSON(http.StatusOK, []SubmissionSummary{})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var rows []SubmissionSummary
	builderFilter := strings.ToLower(strings.TrimSpace(c.Query("builder_filter")))
	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		subID := e.Name()
		metaPath := filepath.Join(submissionRoundDirFor(roundID), subID, "submission.json")
		var rec SubmissionRecord
		if err := readJSONFile(metaPath, &rec); err != nil {
			continue
		}
		enrichSubmission(metaPath, &rec)
		sum, err := submissionSummaryFromMeta(metaPath, subID, roundID, false)
		if err != nil {
			continue
		}
		switch builderFilter {
		case "beginner":
			if strings.ToLower(strings.TrimSpace(sum.GithubRepoOwnerType)) == "organization" {
				continue
			}
			if sum.GithubAccountYears == nil || *sum.GithubAccountYears > 1.0 {
				continue
			}
		case "longterm":
			if strings.ToLower(strings.TrimSpace(sum.GithubRepoOwnerType)) == "organization" {
				continue
			}
			if sum.GithubAccountYears == nil || *sum.GithubAccountYears < 3.0 {
				continue
			}
		case "org":
			if strings.ToLower(strings.TrimSpace(sum.GithubRepoOwnerType)) != "organization" {
				continue
			}
		}
		rows = append(rows, sum)
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].CreatedAt.After(rows[j].CreatedAt) })
	c.JSON(http.StatusOK, rows)
}

func getSubmissionByID(c *gin.Context) {
	subID := strings.TrimSpace(c.Param("id"))
	if !submissionFolderIDOK(subID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid submission id"})
		return
	}
	roundID, err := sanitizeRoundIDOrDefault(c.Query("round_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid round_id"})
		return
	}
	metaPath := filepath.Join(submissionRoundDirFor(roundID), subID, "submission.json")
	sum, err := submissionSummaryFromMeta(metaPath, subID, roundID, false)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, sum)
}

func deleteSubmission(c *gin.Context) {
	subID := strings.TrimSpace(c.Param("id"))
	if !submissionFolderIDOK(subID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid submission id"})
		return
	}
	roundID, err := sanitizeRoundIDOrDefault(c.Query("round_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid round_id"})
		return
	}
	_ = os.RemoveAll(filepath.Join(submissionRoundDirFor(roundID), subID))
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func getAdminConfig(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"admin_hash":   strings.TrimSpace(os.Getenv("AURA_ADMIN_HASH")),
		"admin_wallet": strings.TrimSpace(os.Getenv("AURA_ADMIN_WALLET")),
	})
}

func normalizeLLMErr(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func newOpenAIJudgeClient(model string) (*openai.Client, string, error) {
	m := strings.TrimSpace(strings.ToLower(model))
	if m == "" {
		m = "deepseek"
	}
	switch m {
	case "openai":
		key := strings.TrimSpace(os.Getenv("CHATGPT_API_KEY"))
		if key == "" {
			return nil, "", errors.New("CHATGPT_API_KEY is not set")
		}
		modelID := strings.TrimSpace(os.Getenv("AURA_OPENAI_MODEL"))
		if modelID == "" {
			modelID = openai.GPT4oMini
		}
		return openai.NewClient(key), modelID, nil
	case "doubao":
		key := strings.TrimSpace(os.Getenv("DOUBAO_API_KEY"))
		if key == "" {
			return nil, "", errors.New("DOUBAO_API_KEY is not set")
		}
		cfg := openai.DefaultConfig(key)
		cfg.BaseURL = "https://ark.cn-beijing.volces.com/api/v3"
		modelID := strings.TrimSpace(os.Getenv("AURA_DOUBAO_MODEL"))
		if modelID == "" {
			modelID = "ep-20250220075411-5j2mk"
		}
		return openai.NewClientWithConfig(cfg), modelID, nil
	default:
		key := strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY"))
		if key == "" {
			return nil, "", errors.New("DEEPSEEK_API_KEY is not set")
		}
		cfg := openai.DefaultConfig(key)
		cfg.BaseURL = "https://api.deepseek.com/v1"
		modelID := strings.TrimSpace(os.Getenv("AURA_DEEPSEEK_MODEL"))
		if modelID == "" {
			modelID = "deepseek-chat"
		}
		return openai.NewClientWithConfig(cfg), modelID, nil
	}
}

func extractScoreFromContent(content string) float64 {
	// Prefer explicit AI_SCORE / TOTAL_SCORE lines (accept markdown wrappers like **AI_SCORE: 85**).
	explicit := regexp.MustCompile(`(?im)(?:AI_SCORE|TOTAL_SCORE|FINAL_SCORE)\s*[:：]\s*([0-9]{1,3}(?:\.[0-9]+)?)`)
	if m := explicit.FindStringSubmatch(content); len(m) >= 2 {
		if v, err := strconv.ParseFloat(m[1], 64); err == nil {
			if v < 0 {
				return 0
			}
			if v > 100 {
				return 100
			}
			return v
		}
	}
	dim := regexp.MustCompile(`(?im)(创新性|技术实现|商业价值|用户体验|落地可行性)\s*[:：]\s*([0-9]{1,2}(?:\.[0-9]+)?)`)
	all := dim.FindAllStringSubmatch(content, -1)
	if len(all) > 0 {
		sum := 0.0
		for _, it := range all {
			v, _ := strconv.ParseFloat(it[2], 64)
			sum += v
		}
		avg20 := sum / float64(len(all))
		return (avg20 / 20.0) * 100.0
	}
	return 70.0
}

func parseDimensionScores(content string) map[string]float64 {
	out := map[string]float64{}
	// Support both:
	// - 创新性: 18
	// - 创新性 ... 18/20
	re := regexp.MustCompile(`(?im)(创新性|技术实现|商业价值|用户体验|落地可行性)[^\n\r]*?([0-9]{1,2}(?:\.[0-9]+)?)\s*(?:/20)?`)
	for _, m := range re.FindAllStringSubmatch(content, -1) {
		if len(m) < 3 {
			continue
		}
		v, err := strconv.ParseFloat(m[2], 64)
		if err != nil {
			continue
		}
		if v < 0 {
			v = 0
		}
		if v > 20 {
			v = 20
		}
		out[m[1]] = v
	}
	return out
}

func scoreByRuleWeights(dim map[string]float64, activeYAML string) float64 {
	if len(dim) == 0 {
		return 0
	}
	rs := ruleSetYAML{}
	if strings.TrimSpace(activeYAML) != "" && yaml.Unmarshal([]byte(activeYAML), &rs) == nil && len(rs.Dimensions) > 0 {
		totalWeight := 0
		total := 0.0
		for _, d := range rs.Dimensions {
			w := d.Weight
			if w <= 0 {
				continue
			}
			name := strings.TrimSpace(d.Name)
			v, ok := dim[name]
			if !ok {
				continue
			}
			totalWeight += w
			total += (v / 20.0 * 100.0) * float64(w)
		}
		if totalWeight > 0 {
			return total / float64(totalWeight)
		}
	}
	// fallback: equal-weight 5 dims
	keys := []string{"创新性", "技术实现", "商业价值", "用户体验", "落地可行性"}
	sum := 0.0
	cnt := 0
	for _, k := range keys {
		if v, ok := dim[k]; ok {
			sum += v
			cnt++
		}
	}
	if cnt == 0 {
		return 0
	}
	return (sum / float64(cnt) / 20.0) * 100.0
}

func gradeFromBands(score float64, activeYAML string) string {
	rs := ruleSetYAML{}
	if strings.TrimSpace(activeYAML) != "" && yaml.Unmarshal([]byte(activeYAML), &rs) == nil && len(rs.GradingBands) > 0 {
		for _, b := range rs.GradingBands {
			if score >= float64(b.Min) && score <= float64(b.Max) {
				g := strings.TrimSpace(strings.ToUpper(b.Grade))
				if g != "" {
					return g
				}
			}
		}
	}
	switch {
	case score >= 85:
		return "S"
	case score >= 75:
		return "A"
	case score >= 65:
		return "B"
	case score >= 55:
		return "C"
	default:
		return "D"
	}
}

func ensureAuditFooter(content string, score float64) string {
	c := strings.TrimSpace(content)
	if !regexp.MustCompile(`(?im)AI_SCORE\s*:`).MatchString(c) {
		c += fmt.Sprintf("\n\nAI_SCORE: %.0f", score)
	}
	return c
}

func detectAIScoreConflict(content string) (bool, []float64) {
	re := regexp.MustCompile(`(?im)AI_SCORE\s*[:：]\s*([0-9]{1,3}(?:\.[0-9]+)?)`)
	all := re.FindAllStringSubmatch(content, -1)
	if len(all) <= 1 {
		return false, nil
	}
	seen := map[string]bool{}
	values := make([]float64, 0, len(all))
	for _, m := range all {
		if len(m) < 2 {
			continue
		}
		v, err := strconv.ParseFloat(m[1], 64)
		if err != nil {
			continue
		}
		if v < 0 {
			v = 0
		}
		if v > 100 {
			v = 100
		}
		k := fmt.Sprintf("%.2f", v)
		if seen[k] {
			continue
		}
		seen[k] = true
		values = append(values, v)
	}
	sort.Float64s(values)
	return len(values) > 1, values
}

func runSingleModelAudit(model, outputLang, customPrompt, fileName, doc, activeYAML string) (string, float64, bool, []float64, error) {
	client, modelID, err := newOpenAIJudgeClient(model)
	if err != nil {
		return "", 0, false, nil, err
	}
	if outputLang == "" {
		outputLang = "en"
	}
	if customPrompt == "" {
		customPrompt = "Score strictly based on ACTIVE_RULES_YAML if provided."
	}
	langDirective := "Write in English."
	if strings.ToLower(strings.TrimSpace(outputLang)) == "zh" {
		langDirective = "全文使用中文输出。"
	}
	userPrompt := fmt.Sprintf(
		"[LANGUAGE]\n%s\n[/LANGUAGE]\n\n[ACTIVE_RULES_YAML]\n%s\n[/ACTIVE_RULES_YAML]\n\n[TARGET_FILE]\n%s\n[/TARGET_FILE]\n\n[DOCUMENT]\n%s\n[/DOCUMENT]\n\n[INSTRUCTION]\n%s\n\n必须按以下五维分别给出 0-20 分并解释：\n- 创新性\n- 技术实现\n- 商业价值\n- 用户体验\n- 落地可行性\n\n最后输出：\n1) Weighted Total Score (0-100)\n2) AI_SCORE: <0-100 number>\n[/INSTRUCTION]",
		langDirective, activeYAML, fileName, doc, customPrompt,
	)
	resp, err := client.CreateChatCompletion(context.Background(), openai.ChatCompletionRequest{
		Model: modelID,
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleSystem, Content: "You are a strict hackathon judge."},
			{Role: openai.ChatMessageRoleUser, Content: userPrompt},
		},
		Temperature: 0.2,
	})
	if err != nil {
		return "", 0, false, nil, err
	}
	content := strings.TrimSpace(resp.Choices[0].Message.Content)
	dim := parseDimensionScores(content)
	score := scoreByRuleWeights(dim, activeYAML)
	if score <= 0 {
		score = extractScoreFromContent(content)
	}
	if score < 0 {
		score = 0
	}
	if score > 100 {
		score = 100
	}
	conflict, conflictValues := detectAIScoreConflict(content)
	content = ensureAuditFooter(content, score)
	return content, score, conflict, conflictValues, nil
}

func processGithubRepoAndAudit(roundID, submissionID, githubURL string, skipLLM bool) error {
	if err := ensureRoundDirs(roundID); err != nil {
		return err
	}
	target := fmt.Sprintf("%s_00_README.md", submissionID)
	wordPath := filepath.Join(wordDirFor(roundID), target)
	body := fmt.Sprintf("# Imported repository\n\n- URL: %s\n- round_id: %s\n\nThis is a rebuilt-backend placeholder README snapshot.\n", githubURL, roundID)
	if err := os.WriteFile(wordPath, []byte(body), 0644); err != nil {
		return err
	}
	if skipLLM {
		return nil
	}
	content, score, _, _, err := runSingleModelAudit("deepseek", "en", "Auto-audit from GitHub ingest.", target, body, "")
	if err != nil {
		return err
	}
	res := &SavedResult{
		FileName:   target,
		AvgScore:   score,
		LetterGrade: gradeFromBands(score, ""),
		Timestamp:  time.Now().UTC().Format(time.RFC3339),
		Reports:    []AuditReport{{ModelName: "deepseek", Score: score, Content: content}},
		RoundID:    roundID,
	}
	return writeResult(roundID, res)
}

func saveUploadedFiles(subDir string, files []*multipart.FileHeader) ([]StoredFile, error) {
	var out []StoredFile
	for _, fh := range files {
		src, err := fh.Open()
		if err != nil {
			return nil, err
		}
		defer src.Close()
		name := filepath.Base(strings.TrimSpace(fh.Filename))
		if name == "" {
			continue
		}
		dstPath := filepath.Join(subDir, name)
		dst, err := os.Create(dstPath)
		if err != nil {
			return nil, err
		}
		size, err := io.Copy(dst, src)
		_ = dst.Close()
		if err != nil {
			return nil, err
		}
		out = append(out, StoredFile{Name: name, Size: size})
	}
	return out, nil
}

func postSubmit(c *gin.Context) {
	roundID, err := sanitizeRoundIDOrDefault(c.PostForm("round_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid round_id"})
		return
	}
	if err := ensureRoundDirs(roundID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	title := strings.TrimSpace(c.PostForm("project_title"))
	if title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "project_title required"})
		return
	}
	subID := fmt.Sprintf("%d_%x", time.Now().UnixNano(), time.Now().UnixNano()%0xffffff)
	form := SubmissionForm{
		RoundID:      roundID,
		Track:        c.PostForm("track"),
		ProjectTitle: title,
		OneLiner:     c.PostForm("one_liner"),
		Problem:      c.PostForm("problem"),
		Solution:     c.PostForm("solution"),
		GithubURL:    c.PostForm("github_url"),
		DemoURL:      c.PostForm("demo_url"),
		DocsText:     c.PostForm("docs_text"),
		WhyThisChain: c.PostForm("why_this_chain"),
	}
	rec := SubmissionRecord{
		ID:        subID,
		RoundID:   roundID,
		CreatedAt: time.Now().UTC(),
		Form:      form,
	}
	subDir := filepath.Join(submissionRoundDirFor(roundID), subID)
	if err := os.MkdirAll(subDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	formFiles, _ := c.MultipartForm()
	if formFiles != nil {
		if stored, err := saveUploadedFiles(subDir, formFiles.File["files"]); err == nil {
			rec.Files = stored
		}
	}
	if err := writeJSONFile(filepath.Join(subDir, "submission.json"), &rec); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(form.DocsText) != "" {
		_ = os.MkdirAll(wordDirFor(roundID), 0755)
		_ = os.WriteFile(filepath.Join(wordDirFor(roundID), subID+"_00_README.md"), []byte(form.DocsText), 0644)
	}
	_ = processGithubRepoAndAudit(roundID, subID, rec.Form.GithubURL, false)
	c.JSON(http.StatusOK, gin.H{"id": subID})
}

func getRounds(c *gin.Context) {
	rounds, err := listRoundIDs()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]gin.H, 0, len(rounds))
	for _, rid := range rounds {
		var name, mode, startAt, endAt, status string
		if m, err := loadRoundMeta(rid); err == nil && m != nil {
			name, mode, startAt, endAt, status = m.Name, m.Mode, m.StartAt, m.EndAt, m.Status
		}
		out = append(out, gin.H{
			"id":                rid,
			"name":              name,
			"mode":              mode,
			"start_at":          startAt,
			"end_at":            endAt,
			"status":            status,
			"submission_count":  countSubmissionsInRound(rid),
			"audited_file_count": countDistinctAuditedWordFiles(rid),
		})
	}
	c.JSON(http.StatusOK, gin.H{"rounds": out, "default_round_id": defaultRoundID})
}

func getRulesActive(c *gin.Context) {
	roundID, _ := sanitizeRoundIDOrDefault(c.Query("round_id"))
	raw, id, _ := loadEffectiveRuleYAMLForRound(roundID)
	idx, _ := loadRuleIndex()
	var meta *ruleMeta
	for i := range idx.Versions {
		if idx.Versions[i].ID == id {
			v := idx.Versions[i]
			meta = &v
			break
		}
	}
	c.JSON(http.StatusOK, gin.H{"meta": meta, "rawYAML": raw})
}

func getRulesVersions(c *gin.Context) {
	idx, err := loadRuleIndex()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"versions": []any{}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"versions": idx.Versions})
}

func postRulesActivate(c *gin.Context) {
	var body struct{ VersionID string `json:"versionId"` }
	if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.VersionID) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "versionId required"})
		return
	}
	idx, err := loadRuleIndex()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	found := false
	for i := range idx.Versions {
		idx.Versions[i].IsActive = idx.Versions[i].ID == body.VersionID
		if idx.Versions[i].IsActive {
			found = true
		}
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "version not found"})
		return
	}
	idx.ActiveID = body.VersionID
	if err := saveRuleIndex(idx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

func postRulesUpload(c *gin.Context) {
	var body struct{ RawYAML string `json:"rawYAML"` }
	if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.RawYAML) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "rawYAML required"})
		return
	}
	id := fmt.Sprintf("rule_%d", time.Now().Unix())
	fileName := id + ".yaml"
	if err := os.MkdirAll("rules", 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := os.WriteFile(filepath.Join("rules", fileName), []byte(body.RawYAML), 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	idx, _ := loadRuleIndex()
	for i := range idx.Versions {
		idx.Versions[i].IsActive = false
	}
	meta := ruleMeta{
		ID:         id,
		FileName:   fileName,
		UploadedAt: time.Now().UTC().Format(time.RFC3339),
		UploadedBy: "rebuild",
		SHA256:     fmt.Sprintf("%x", time.Now().UnixNano()),
		IsActive:   true,
	}
	idx.ActiveID = id
	idx.Versions = append([]ruleMeta{meta}, idx.Versions...)
	_ = saveRuleIndex(idx)
	c.JSON(http.StatusOK, gin.H{"versionId": id})
}

func deleteRuleVersion(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	idx, err := loadRuleIndex()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "deleted"})
		return
	}
	var next []ruleMeta
	for _, v := range idx.Versions {
		if v.ID == id {
			_ = os.Remove(filepath.Join("rules", v.FileName))
			continue
		}
		next = append(next, v)
	}
	idx.Versions = next
	if idx.ActiveID == id {
		idx.ActiveID = ""
		if len(next) > 0 {
			next[0].IsActive = true
			idx.ActiveID = next[0].ID
			idx.Versions[0] = next[0]
		}
	}
	_ = saveRuleIndex(idx)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
func getRuleDownload(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	idx, err := loadRuleIndex()
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "rule not found"})
		return
	}
	for _, v := range idx.Versions {
		if v.ID == id {
			data, err := os.ReadFile(filepath.Join("rules", v.FileName))
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "rule file not found"})
				return
			}
			c.Data(http.StatusOK, "text/plain; charset=utf-8", data)
			return
		}
	}
	c.JSON(http.StatusNotFound, gin.H{"error": "rule not found"})
}

func loadRuleIndex() (*ruleIndex, error) {
	p := filepath.Join("rules", "index.json")
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return &ruleIndex{Versions: []ruleMeta{}}, nil
		}
		return nil, err
	}
	var idx ruleIndex
	if err := json.Unmarshal(data, &idx); err != nil {
		return nil, err
	}
	return &idx, nil
}

func saveRuleIndex(idx *ruleIndex) error {
	if err := os.MkdirAll("rules", 0755); err != nil {
		return err
	}
	return writeJSONFile(filepath.Join("rules", "index.json"), idx)
}

func currentRuleSHA(roundID string) string {
	_, id, _ := loadEffectiveRuleYAMLForRound(roundID)
	idx, _ := loadRuleIndex()
	for _, v := range idx.Versions {
		if v.ID == id {
			return v.SHA256
		}
	}
	return ""
}

func loadEffectiveRuleYAMLForRound(roundID string) (string, string, error) {
	_ = roundID
	idx, err := loadRuleIndex()
	if err != nil {
		return "", "", err
	}
	id := strings.TrimSpace(idx.ActiveID)
	if id == "" && len(idx.Versions) > 0 {
		id = idx.Versions[0].ID
	}
	if id == "" {
		return "", "", nil
	}
	for _, v := range idx.Versions {
		if v.ID == id {
			data, err := os.ReadFile(filepath.Join("rules", v.FileName))
			if err != nil {
				return "", "", err
			}
			return string(data), id, nil
		}
	}
	return "", "", nil
}

func postRefreshSubmissionFromGithub(c *gin.Context) {
	subID := strings.TrimSpace(c.Param("id"))
	roundID, err := sanitizeRoundIDOrDefault(c.Query("round_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid round_id"})
		return
	}
	metaPath := filepath.Join(submissionRoundDirFor(roundID), subID, "submission.json")
	var rec SubmissionRecord
	if err := readJSONFile(metaPath, &rec); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "submission not found"})
		return
	}
	if err := processGithubRepoAndAudit(roundID, subID, rec.Form.GithubURL, true); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"target_file": fmt.Sprintf("%s_00_README.md", subID), "readme_only": false})
}

func main() {
	word := strings.TrimSpace(os.Getenv("AURA_WORD_DIR"))
	if word == "" {
		word = "./word"
	}
	result := strings.TrimSpace(os.Getenv("AURA_RESULT_DIR"))
	if result == "" {
		result = "./judge-result"
	}
	sub := strings.TrimSpace(os.Getenv("AURA_SUBMISSION_DIR"))
	if sub == "" {
		sub = "./submissions"
	}
	def := defaultRoundIDFromEnv(os.Getenv("AURA_DEFAULT_ROUND_ID"))
	setRoundRoots(word, result, sub, def)
	_ = ensureRoundDirs(def)

	r := gin.Default()
	r.GET("/api/admin-config", getAdminConfig)
	r.GET("/api/files", getFiles)
	r.POST("/api/audit", postAudit)
	r.GET("/api/ranking", getRanking)
	r.GET("/api/judge-result", getJudgeResult)
	r.POST("/api/submit", postSubmit)
	r.GET("/api/submissions", getSubmissions)
	r.GET("/api/submission/:id", getSubmissionByID)
	r.DELETE("/api/submission/:id", deleteSubmission)
	r.POST("/api/submission/:id/refresh-github", postRefreshSubmissionFromGithub)
	r.GET("/api/file-github-urls", getFileGithubURLs)
	r.GET("/api/file-fork-statuses", getFileForkStatuses)
	r.GET("/api/file-project-titles", getFileProjectTitles)
	r.POST("/api/duel", postDuel)
	r.GET("/api/duel-bracket-snapshot", getDuelBracketSnapshot)
	r.PUT("/api/duel-bracket-snapshot", putDuelBracketSnapshot)
	r.DELETE("/api/duel-bracket-snapshot", deleteDuelBracketSnapshot)
	r.POST("/api/batch/ingest-github-urls", postBatchIngestGithub)

	r.GET("/api/rounds", getRounds)
	r.POST("/api/rounds", postCreateRound)
	r.GET("/api/rounds/:id", getRoundDetail)
	r.PUT("/api/rounds/:id", putRoundMeta)
	// 赛道元数据：submissions/<round_id>/.aura_tracks.json（与 round_tracks.go）
	r.GET("/api/rounds/:id/tracks", getRoundTracksHTTP)
	r.PUT("/api/rounds/:id/tracks", putRoundTracksHTTP)
	r.GET("/api/rounds/:id/judges-panel", getJudgesPanel)
	r.PUT("/api/rounds/:id/judges-panel", putJudgesPanel)
	r.POST("/api/rounds/:id/judges-panel/auto-assign", postJudgesAutoAssign)
	r.GET("/api/rounds/:id/judge/:judgeId/workspace", getJudgeWorkspace)
	r.PUT("/api/rounds/:id/judge/:judgeId/submissions/:subId/human-review", putJudgeHumanReview)

	r.GET("/api/rules/active", getRulesActive)
	r.GET("/api/rules/versions", getRulesVersions)
	r.POST("/api/rules/upload", postRulesUpload)
	r.POST("/api/rules/activate", postRulesActivate)
	r.DELETE("/api/rules/version/:id", deleteRuleVersion)
	r.GET("/api/rules/version/:id/download", getRuleDownload)

	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "8888"
	}
	if _, err := strconv.Atoi(port); err != nil {
		port = "8888"
	}
	_ = r.Run(":" + port)
}

