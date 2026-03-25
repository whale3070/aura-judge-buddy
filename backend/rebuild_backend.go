package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
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
	/** 与 form.track 一致，用于排行按赛道筛选 */
	Track string `json:"track,omitempty"`
}

type AuditReport struct {
	ModelName           string    `json:"model_name"`
	Content             string    `json:"content"`
	Score               float64   `json:"score,omitempty"`
	Error               string    `json:"error,omitempty"`
	ScoreConflict       bool      `json:"score_conflict,omitempty"`
	ScoreConflictValues []float64 `json:"score_conflict_values,omitempty"`
	/** >0 表示 score 为「各维原始分之和」；与 YAML 加权满分之和一致 */
	RubricRawMax float64 `json:"rubric_raw_max,omitempty"`
}

type SavedResult struct {
	FileName               string        `json:"file_name"`
	AvgScore               float64       `json:"avg_score"`
	/** 各维满分之和（仅当 avg_score 为原始分总和时非零）；兼容旧存证缺省=0 表示 avg_score 为 0–100 归一 */
	RubricRawMax           float64       `json:"rubric_raw_max,omitempty"`
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
	Notes      string `yaml:"notes"`
	Dimensions []struct {
		Key         string `yaml:"key"`
		Name        string `yaml:"name"`
		Weight      int    `yaml:"weight"`
		Max         int    `yaml:"max"`
		Description string `yaml:"description"`
	} `yaml:"dimensions"`
	GradingBands []struct {
		Grade string `yaml:"grade"`
		Min   int    `yaml:"min"`
		Max   int    `yaml:"max"`
		Label string `yaml:"label"`
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
	// 成功 enriched 后须返回年限（含 0，新账号），否则前端会把「有 username、无数值」误判为「获取中」。
	var years *float64
	if strings.EqualFold(strings.TrimSpace(rec.GithubEnrichStatus), "success") {
		v := rec.GithubAccountYears
		years = &v
	} else if rec.GithubAccountYears > 0 {
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
		Track:                    strings.TrimSpace(rec.Form.Track),
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

// rankingSortKey 用于排序：原始分模式按 (avg/max)*100，与 legacy 0–100 分数可比。
func rankingSortKey(s SavedResult) float64 {
	if s.RubricRawMax > 0 {
		return s.AvgScore / s.RubricRawMax * 100
	}
	return s.AvgScore
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
	sort.Slice(out, func(i, j int) bool { return rankingSortKey(out[i]) > rankingSortKey(out[j]) })
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
		models = []string{"deepseek"}
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
	okCount := 0
	anyScoreConflict := false
	var failReasons []string
	for _, m := range models {
		content, score, rMax, conflict, conflictValues, llmErr := runSingleModelAudit(strings.TrimSpace(strings.ToLower(m)), body.OutputLang, body.CustomPrompt, fileName, string(doc), activeYAML)
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
		rep.RubricRawMax = rMax
		rep.ScoreConflict = conflict
		rep.ScoreConflictValues = conflictValues
		if conflict {
			anyScoreConflict = true
		}
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
	avg, rawMax, letter := aggregateSavedResultScores(reports, activeYAML)
	res := &SavedResult{
		FileName:        fileName,
		AvgScore:        avg,
		RubricRawMax:    rawMax,
		LetterGrade:     letter,
		Timestamp:       time.Now().UTC().Format(time.RFC3339),
		Reports:         reports,
		RoundID:         roundID,
		RuleVersionID:   ruleID,
		RuleSHA256:      currentRuleSHA(roundID),
		ScoreConflict:   anyScoreConflict,
	}
	if err := writeResult(roundID, res); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

// resolveRankingTrackQuery 解析 ?track=：优先匹配本场 .aura_tracks.json 中的 id，并兼容旧版 normalizeTrackID 别名。
func resolveRankingTrackQuery(roundID, raw string) (filter string, err error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || strings.EqualFold(raw, "all") {
		return "", nil
	}
	if id, e := sanitizeRoundTrackID(raw); e == nil && validRoundTrackID(roundID, id) {
		return id, nil
	}
	if leg := normalizeTrackID(raw); leg != "" {
		return leg, nil
	}
	if id, e := sanitizeRoundTrackID(raw); e == nil && !RoundHasConfiguredTracks(roundID) {
		return id, nil
	}
	return "", errors.New("invalid track")
}

func rankingRowResolvedTrackID(row *SavedResult, roundID string) string {
	subID := parseSubmissionIDFromStandardReadmeWordFile(row.FileName)
	if !submissionFolderIDOK(subID) {
		return ""
	}
	metaPath := filepath.Join(submissionRoundDirFor(roundID), subID, "submission.json")
	var rec SubmissionRecord
	if err := readJSONFile(metaPath, &rec); err != nil {
		return ""
	}
	return detectSubmissionTrack(&rec, roundID, subID)
}

// attachRankingCountsToTracks 为每个已配置赛道填充 ranking_count（与 /api/ranking?track= 条数一致）。
func attachRankingCountsToTracks(roundID string, tracks []RoundTrackEntry) []RoundTrackEntry {
	counts := make(map[string]int)
	cleanIDs := make([]string, 0, len(tracks))
	for _, t := range tracks {
		if id, err := sanitizeRoundTrackID(t.ID); err == nil {
			if _, ok := counts[id]; !ok {
				counts[id] = 0
				cleanIDs = append(cleanIDs, id)
			}
		}
	}
	if len(cleanIDs) > 0 {
		if rows, err := loadRanking(roundID); err == nil {
			for i := range rows {
				tk := rankingRowResolvedTrackID(&rows[i], roundID)
				if tk != "" {
					if _, ok := counts[tk]; ok {
						counts[tk]++
					}
				}
			}
		}
	}
	out := make([]RoundTrackEntry, 0, len(tracks))
	for _, t := range tracks {
		entry := RoundTrackEntry{
			ID:          t.ID,
			Name:        t.Name,
			Description: t.Description,
			PrizePool:   t.PrizePool,
		}
		if id, err := sanitizeRoundTrackID(t.ID); err == nil {
			entry.RankingCount = counts[id]
		}
		out = append(out, entry)
	}
	return out
}

func getRanking(c *gin.Context) {
	roundID, err := sanitizeRoundIDOrDefault(c.Query("round_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid round_id"})
		return
	}
	trackFilter, err := resolveRankingTrackQuery(roundID, c.Query("track"))
	if err != nil {
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
			norm := rows[i].AvgScore
			if rows[i].RubricRawMax > 0 {
				norm = rows[i].AvgScore / rows[i].RubricRawMax * 100
			}
			rows[i].LetterGrade = gradeFromBands(norm, activeYAML)
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
			// submission 已删除或损坏：不再展示孤儿排名行（否则与提交列表数量不一致）
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
			rows[i].RubricRawMax = 0
			rows[i].LetterGrade = "D"
		case "C":
			rows[i].RubricRawMax = 0
			rows[i].AvgScore = 65
			rows[i].LetterGrade = "C"
		}
		if u := strings.TrimSpace(rec.Form.GithubURL); u != "" {
			rows[i].GithubURL = u
		}
		filtered = append(filtered, rows[i])
	}
	sort.Slice(filtered, func(i, j int) bool { return rankingSortKey(filtered[i]) > rankingSortKey(filtered[j]) })
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
	configured := RoundHasConfiguredTracks(roundID)
	if rec != nil {
		raw := strings.TrimSpace(rec.Form.Track)
		if raw != "" {
			if id, err := sanitizeRoundTrackID(raw); err == nil {
				if !configured || validRoundTrackID(roundID, id) {
					return id
				}
			}
			if t := normalizeTrackID(raw); t != "" {
				return t
			}
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
	if configured {
		return ""
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

// getFileContent GET /api/file-content?file=...&round_id=... — 预览/下载 word 目录下的待审文件（与 /api/audit 解析路径一致）。
func getFileContent(c *gin.Context) {
	roundID, err := sanitizeRoundIDOrDefault(c.Query("round_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid round_id"})
		return
	}
	fileName := strings.TrimSpace(c.Query("file"))
	if fileName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file required"})
		return
	}
	path, err := resolveWordDocumentPath(roundID, fileName)
	if err != nil || path == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
		return
	}
	data, err := os.ReadFile(path)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
		return
	}
	base := filepath.Base(path)
	ext := strings.ToLower(filepath.Ext(base))
	var ctype string
	switch ext {
	case ".md", ".markdown":
		ctype = "text/markdown; charset=utf-8"
	case ".txt":
		ctype = "text/plain; charset=utf-8"
	case ".pdf":
		ctype = "application/pdf"
	default:
		ctype = "application/octet-stream"
	}
	download := strings.TrimSpace(c.Query("download"))
	if download == "1" || strings.EqualFold(download, "true") {
		c.Header("Content-Disposition", `attachment; filename="`+base+`"`)
	} else {
		c.Header("Content-Disposition", `inline; filename="`+base+`"`)
	}
	c.Data(http.StatusOK, ctype, data)
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

type putSubmissionTrackBody struct {
	Track string `json:"track"`
}

// putSubmissionTrack PUT /api/submission/:id/track?round_id= — 写入 submission.json form.track（须为本场已配置赛道 id，或传空字符串清空）
func putSubmissionTrackHTTP(c *gin.Context) {
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
	var rec SubmissionRecord
	if err := readJSONFile(metaPath, &rec); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "submission not found"})
		return
	}
	var body putSubmissionTrackBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	raw := strings.TrimSpace(body.Track)
	if raw == "" {
		rec.Form.Track = ""
	} else {
		tid, err := sanitizeRoundTrackID(raw)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid track id"})
			return
		}
		if RoundHasConfiguredTracks(roundID) && !validRoundTrackID(roundID, tid) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "unknown track for this round"})
			return
		}
		rec.Form.Track = tid
	}
	if err := writeJSONFile(metaPath, &rec); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "save failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"track": strings.TrimSpace(rec.Form.Track)})
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
	// 同步清理 word 与裁决 JSON，避免 /api/ranking 继续读到已删项目
	for _, fn := range readmeFilesByPrefix(roundID, subID) {
		_ = os.Remove(filepath.Join(wordDirFor(roundID), fn))
		_ = os.Remove(resultPath(roundID, fn))
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

func yamlDimensionMax(maxField int) int {
	if maxField > 0 {
		return maxField
	}
	return 20
}

func parseRuleSetYAMLString(raw string) *ruleSetYAML {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var rs ruleSetYAML
	if err := yaml.Unmarshal([]byte(raw), &rs); err != nil {
		return nil
	}
	if len(rs.Dimensions) == 0 {
		return nil
	}
	return &rs
}

func parseLegacyChineseFiveDims(content string) map[string]float64 {
	out := map[string]float64{}
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

// extractRubricScoresSection returns text between RUBRIC_SCORES_BLOCK and END_RUBRIC_SCORES_BLOCK if present.
func extractRubricScoresSection(content string) (string, bool) {
	reStart := regexp.MustCompile(`(?is)RUBRIC_SCORES_BLOCK\s*\n`)
	reEnd := regexp.MustCompile(`(?is)\n\s*END_RUBRIC_SCORES_BLOCK`)
	loc := reStart.FindStringIndex(content)
	if loc == nil {
		return "", false
	}
	tail := content[loc[1]:]
	loc2 := reEnd.FindStringIndex(tail)
	if loc2 == nil {
		return "", false
	}
	return tail[:loc2[0]], true
}

func parseDimensionScoresFromContent(content string, rs *ruleSetYAML) map[string]float64 {
	if rs == nil || len(rs.Dimensions) == 0 {
		return parseLegacyChineseFiveDims(content)
	}
	searchPrimary := content
	if sec, ok := extractRubricScoresSection(content); ok && strings.TrimSpace(sec) != "" {
		searchPrimary = sec
	}
	out := map[string]float64{}
	for _, d := range rs.Dimensions {
		name := strings.TrimSpace(d.Name)
		if name == "" {
			continue
		}
		maxV := yamlDimensionMax(d.Max)
		esc := regexp.QuoteMeta(name)
		pat := fmt.Sprintf(`(?im)^\s*(?:\*\*)?%s(?:\*\*)?\s*[:：]\s*([0-9]{1,2}(?:\.[0-9]+)?)\s*(?:/\s*%d)?\s*$`, esc, maxV)
		reLine, err := regexp.Compile(pat)
		if err != nil {
			continue
		}
		patLoose := fmt.Sprintf(`(?i)(?:\*\*)?%s(?:\*\*)?\s*[:：]\s*([0-9]{1,2}(?:\.[0-9]+)?)\s*(?:/\s*%d)?`, esc, maxV)
		reLoose, err := regexp.Compile(patLoose)
		if err != nil {
			continue
		}
		tryExtract := func(src string) (float64, bool) {
			for _, line := range strings.Split(src, "\n") {
				if m := reLine.FindStringSubmatch(strings.TrimSpace(line)); len(m) >= 2 {
					v, err := strconv.ParseFloat(m[1], 64)
					if err != nil {
						continue
					}
					return v, true
				}
			}
			all := reLoose.FindAllStringSubmatch(src, -1)
			if len(all) == 0 {
				return 0, false
			}
			m := all[len(all)-1]
			if len(m) < 2 {
				return 0, false
			}
			v, err := strconv.ParseFloat(m[1], 64)
			if err != nil {
				return 0, false
			}
			return v, true
		}
		v, ok := tryExtract(searchPrimary)
		if !ok && searchPrimary != content {
			v, ok = tryExtract(content)
		}
		if !ok {
			continue
		}
		mv := float64(maxV)
		if v < 0 {
			v = 0
		}
		if v > mv {
			v = mv
		}
		out[name] = v
	}
	return out
}

func allWeightedRuleDimsPresent(dim map[string]float64, rs *ruleSetYAML) bool {
	if rs == nil || len(dim) == 0 {
		return false
	}
	for _, d := range rs.Dimensions {
		if d.Weight <= 0 {
			continue
		}
		if _, ok := dim[strings.TrimSpace(d.Name)]; !ok {
			return false
		}
	}
	return true
}

func rubricPossibleRawMax(rs *ruleSetYAML) float64 {
	if rs == nil {
		return 0
	}
	var s float64
	for _, d := range rs.Dimensions {
		if d.Weight <= 0 {
			continue
		}
		s += float64(yamlDimensionMax(d.Max))
	}
	return s
}

func rubricRawSum(dim map[string]float64, rs *ruleSetYAML) float64 {
	if rs == nil {
		return 0
	}
	var sum float64
	for _, d := range rs.Dimensions {
		if d.Weight <= 0 {
			continue
		}
		name := strings.TrimSpace(d.Name)
		if v, ok := dim[name]; ok {
			sum += v
		}
	}
	return sum
}

// computeAuditScoreBundle: 若解析齐 YAML 带权维度，reportScore=各维分数之和，rubricRawMax=满分之和，normForGrade=(和/满分)*100；否则与旧版一致 reportScore 为 0–100。
func computeAuditScoreBundle(content string, rs *ruleSetYAML) (reportScore float64, rubricRawMax float64, normForGrade float64) {
	dim := parseDimensionScoresFromContent(content, rs)
	maxSum := rubricPossibleRawMax(rs)
	if rs != nil && maxSum > 0 && allWeightedRuleDimsPresent(dim, rs) {
		raw := rubricRawSum(dim, rs)
		norm := raw / maxSum * 100
		if norm > 100 {
			norm = 100
		}
		return raw, maxSum, norm
	}
	fallback := extractScoreFromContentPartial(content, rs, dim)
	return fallback, 0, fallback
}

func clampScore100(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}

// extractScoreFromContent 返回 0–100 归一（用于兼容旧逻辑）；完整 YAML 维度解析时与 scoreByRuleWeights 一致。
func extractScoreFromContent(content string, rs *ruleSetYAML) float64 {
	_, _, n := computeAuditScoreBundle(content, rs)
	return n
}

func extractScoreFromContentPartial(content string, rs *ruleSetYAML, dim map[string]float64) float64 {
	explicit := regexp.MustCompile(`(?im)(?:AI_SCORE|TOTAL_SCORE|FINAL_SCORE)\s*[:：]\s*([0-9]{1,3}(?:\.[0-9]+)?)`)
	if m := explicit.FindStringSubmatch(content); len(m) >= 2 {
		if v, err := strconv.ParseFloat(m[1], 64); err == nil {
			return clampScore100(v)
		}
	}
	if s := scoreByRuleWeights(dim, rs); s > 0 {
		return clampScore100(s)
	}
	all := parseLegacyChineseFiveDims(content)
	if len(all) > 0 {
		sum := 0.0
		for _, v := range all {
			sum += v
		}
		avg20 := sum / float64(len(all))
		return clampScore100((avg20 / 20.0) * 100.0)
	}
	return 70.0
}

func scoreByRuleWeights(dim map[string]float64, rs *ruleSetYAML) float64 {
	if len(dim) == 0 {
		return 0
	}
	if rs != nil && len(rs.Dimensions) > 0 {
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
			maxV := float64(yamlDimensionMax(d.Max))
			totalWeight += w
			total += (v / maxV * 100.0) * float64(w)
		}
		if totalWeight > 0 {
			return total / float64(totalWeight)
		}
	}
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

func buildAuditInstructionBlock(rs *ruleSetYAML, customPrompt string) string {
	prefix := strings.TrimSpace(customPrompt)
	if prefix == "" {
		prefix = "Apply ACTIVE_RULES_YAML fairly: use exact YAML dimension names, per-dimension max scores, weights, gradingBands, and notes."
	}
	if rs != nil && len(rs.Dimensions) > 0 {
		var b strings.Builder
		b.WriteString(prefix)
		b.WriteString("\n\n")
		b.WriteString("Scoring calibration (mandatory):\n")
		b.WriteString("- Base scores ONLY on evidence in [DOCUMENT]. Do not invent features; ambiguous gaps should moderate scores on that criterion, not collapse every criterion.\n")
		b.WriteString("- Use the full 0–max range meaningfully: a workable hackathon MVP with clear gaps is often near the **mid range** on criteria that are partially satisfied. Reserve **very low scores** for that criterion only when it is clearly unmet, misleading, or critically failed **for that criterion**.\n")
		b.WriteString("- Score each dimension **independently**: a shortcoming in one rubric line must not automatically force **unrelated** dimensions to the minimum.\n")
		b.WriteString("- When a criterion mentions \"Polkadot / Web3\" or similar: **other major Web3 chains and tooling still count as Web3-relevant**. Penalize lack of Polkadot/Substrate-specific fit **in proportion** to how strongly the criterion and project scope emphasize Polkadot; **do not assign the minimum ecosystem score solely because the stack is not Polkadot** unless the materials require Polkadot-native delivery.\n\n")
		b.WriteString("Output order (mandatory):\n")
		b.WriteString("1) FIRST emit the machine-readable block below (one line per rubric dimension, names must match YAML `name` **exactly**, integer 0–max only):\n")
		b.WriteString("RUBRIC_SCORES_BLOCK\n")
		b.WriteString("<exact YAML name>: <integer>\n")
		b.WriteString("... (repeat for every weighted dimension)\n")
		b.WriteString("END_RUBRIC_SCORES_BLOCK\n\n")
		b.WriteString("2) THEN add brief rationale per dimension (you may repeat the dimension names).\n")
		b.WriteString("3) End the entire response with exactly one line: AI_SCORE: <sum of dimension scores> (integer or one decimal), NOT the 0–100 normalized value.\n\n")
		b.WriteString("Rubric dimensions:\n")
		for _, d := range rs.Dimensions {
			maxV := yamlDimensionMax(d.Max)
			desc := strings.TrimSpace(d.Description)
			if nl := strings.Index(desc, "\n"); nl >= 0 {
				desc = strings.TrimSpace(desc[:nl])
			}
			if desc != "" {
				fmt.Fprintf(&b, "- %s — 0–%d, weight %d%% — %s\n", strings.TrimSpace(d.Name), maxV, d.Weight, desc)
			} else {
				fmt.Fprintf(&b, "- %s — 0–%d, weight %d%%\n", strings.TrimSpace(d.Name), maxV, d.Weight)
			}
		}
		rsMax := rubricPossibleRawMax(rs)
		fmt.Fprintf(&b, "\nGrading note: dimension lines above are each 0–max; **AI_SCORE** must be their **numeric sum** (max %.0f). The server converts sum/max to 0–100 only for gradingBands.\n", rsMax)
		if len(rs.GradingBands) > 0 {
			b.WriteString("\ngradingBands (weighted total 0–100; reference only; letter tier for ranking may follow `notes` ladder if specified there):\n")
			for _, g := range rs.GradingBands {
				lab := strings.TrimSpace(g.Label)
				if lab != "" {
					fmt.Fprintf(&b, "  %s: %d–%d — %s\n", strings.ToUpper(strings.TrimSpace(g.Grade)), g.Min, g.Max, lab)
				} else {
					fmt.Fprintf(&b, "  %s: %d–%d\n", strings.ToUpper(strings.TrimSpace(g.Grade)), g.Min, g.Max)
				}
			}
		}
		if notes := strings.TrimSpace(rs.Notes); notes != "" {
			b.WriteString("\n--- Ruleset notes (normative for output format, ladders, and conventions) ---\n")
			b.WriteString(notes)
			b.WriteString("\n")
		}
		return b.String()
	}
	legacy := `(Legacy rubric — use only when YAML has no dimensions.) Score these five dimensions 0–20 each with brief rationale:
- 创新性
- 技术实现
- 商业价值
- 用户体验
- 落地可行性

End with: AI_SCORE: <0-100> (weighted average of the five scores scaled to 0–100).`
	return prefix + "\n\n" + legacy
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

func detectAIScoreConflict(content string, expectedReportScore float64) (bool, []float64) {
	re := regexp.MustCompile(`(?im)AI_SCORE\s*[:：]\s*([0-9]{1,3}(?:\.[0-9]+)?)`)
	all := re.FindAllStringSubmatch(content, -1)
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
		k := fmt.Sprintf("%.4f", v)
		if seen[k] {
			continue
		}
		seen[k] = true
		values = append(values, v)
	}
	sort.Float64s(values)
	if len(values) > 1 {
		return true, values
	}
	if len(values) == 1 && math.Abs(values[0]-expectedReportScore) > 0.05 {
		return true, []float64{values[0], expectedReportScore}
	}
	return false, nil
}

func runSingleModelAudit(model, outputLang, customPrompt, fileName, doc, activeYAML string) (string, float64, float64, bool, []float64, error) {
	client, modelID, err := newOpenAIJudgeClient(model)
	if err != nil {
		return "", 0, 0, false, nil, err
	}
	if outputLang == "" {
		outputLang = "en"
	}
	langDirective := "Write in English."
	if strings.ToLower(strings.TrimSpace(outputLang)) == "zh" {
		langDirective = "全文使用中文输出。"
	}
	rs := parseRuleSetYAMLString(activeYAML)
	instruction := buildAuditInstructionBlock(rs, customPrompt)
	userPrompt := fmt.Sprintf(
		"[LANGUAGE]\n%s\n[/LANGUAGE]\n\n[ACTIVE_RULES_YAML]\n%s\n[/ACTIVE_RULES_YAML]\n\n[TARGET_FILE]\n%s\n[/TARGET_FILE]\n\n[DOCUMENT]\n%s\n[/DOCUMENT]\n\n[INSTRUCTION]\n%s\n[/INSTRUCTION]",
		langDirective, activeYAML, fileName, doc, instruction,
	)
	resp, err := client.CreateChatCompletion(context.Background(), openai.ChatCompletionRequest{
		Model: modelID,
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleSystem, Content: "You are an experienced hackathon judge. Apply ACTIVE_RULES_YAML calmly and proportionally: score from stated evidence, keep dimensions independent unless the rubric explicitly ties them, and avoid universally harsh anchoring."},
			{Role: openai.ChatMessageRoleUser, Content: userPrompt},
		},
		Temperature: 0.2,
	})
	if err != nil {
		return "", 0, 0, false, nil, err
	}
	content := strings.TrimSpace(resp.Choices[0].Message.Content)
	reportScore, rubricRawMax, _ := computeAuditScoreBundle(content, rs)
	conflict, conflictValues := detectAIScoreConflict(content, reportScore)
	content = ensureAuditFooter(content, reportScore)
	return content, reportScore, rubricRawMax, conflict, conflictValues, nil
}

func aggregateSavedResultScores(reports []AuditReport, activeYAML string) (avgScore float64, rubricRawMax float64, letterGrade string) {
	var sum float64
	n := 0
	allRaw := true
	var maxR float64
	for _, r := range reports {
		if strings.TrimSpace(r.Error) != "" {
			continue
		}
		sum += r.Score
		n++
		if r.RubricRawMax <= 0 {
			allRaw = false
		} else if maxR == 0 {
			maxR = r.RubricRawMax
		} else if math.Abs(r.RubricRawMax-maxR) > 0.01 {
			allRaw = false
		}
	}
	if n == 0 {
		return 0, 0, ""
	}
	avgScore = sum / float64(n)
	if allRaw && maxR > 0 {
		rubricRawMax = maxR
		letterGrade = gradeFromBands(avgScore/maxR*100, activeYAML)
	} else {
		letterGrade = gradeFromBands(avgScore, activeYAML)
	}
	return avgScore, rubricRawMax, letterGrade
}

const placeholderReadmeMarker = "This is a rebuilt-backend placeholder README snapshot"

func isPlaceholderReadmeMarkdown(s string) bool {
	s = strings.TrimSpace(s)
	return s == "" || strings.Contains(s, placeholderReadmeMarker)
}

func loadSubmissionRecordForAudit(roundID, submissionID string) *SubmissionRecord {
	metaPath := filepath.Join(submissionRoundDirFor(roundID), submissionID, "submission.json")
	var rec SubmissionRecord
	if err := readJSONFile(metaPath, &rec); err != nil {
		return nil
	}
	return &rec
}

// 当 word 目录尚无实质 README 时，用提交表单字段拼成可供评审的 Markdown（避免只剩一行 URL）。
func composeMarkdownFromSubmissionForm(rec *SubmissionRecord) string {
	if rec == nil {
		return ""
	}
	f := rec.Form
	var b strings.Builder
	if t := strings.TrimSpace(f.ProjectTitle); t != "" {
		b.WriteString("# ")
		b.WriteString(t)
		b.WriteString("\n\n")
	}
	if t := strings.TrimSpace(f.GithubURL); t != "" {
		b.WriteString("- **GitHub:** ")
		b.WriteString(t)
		b.WriteString("\n\n")
	}
	sections := []struct{ title, val string }{
		{"One-liner", f.OneLiner},
		{"Problem", f.Problem},
		{"Solution", f.Solution},
		{"Demo", f.DemoURL},
		{"Why this chain", f.WhyThisChain},
	}
	for _, sec := range sections {
		v := strings.TrimSpace(sec.val)
		if v == "" {
			continue
		}
		b.WriteString("## ")
		b.WriteString(sec.title)
		b.WriteString("\n\n")
		b.WriteString(v)
		b.WriteString("\n\n")
	}
	if d := strings.TrimSpace(f.DocsText); d != "" {
		b.WriteString("## Additional documentation\n\n")
		b.WriteString(d)
		b.WriteString("\n")
	}
	return strings.TrimSpace(b.String())
}

type ghReadmeAPI struct {
	Content  string `json:"content"`
	Encoding string `json:"encoding"`
}

// 使用 GitHub REST API 拉取默认 README（application/vnd.github+json），无需本地 git clone。
func fetchGithubRepoReadmeMarkdown(ctx context.Context, githubURL string) (string, error) {
	owner, repo, ok := parseOwnerRepo(githubURL)
	if !ok {
		return "", errors.New("invalid github url")
	}
	token := githubToken()
	ep := fmt.Sprintf("https://api.github.com/repos/%s/%s/readme", url.PathEscape(owner), url.PathEscape(repo))
	var out ghReadmeAPI
	if err := githubGet(ctx, token, ep, &out); err != nil {
		return "", err
	}
	enc := strings.ToLower(strings.TrimSpace(out.Encoding))
	if enc != "" && enc != "base64" {
		return "", fmt.Errorf("unexpected readme encoding %q", out.Encoding)
	}
	raw := strings.ReplaceAll(out.Content, "\n", "")
	raw = strings.ReplaceAll(raw, "\r", "")
	dec, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return "", err
	}
	return string(dec), nil
}

// resolveAuditMarkdownForSubmission 决定送进 LLM 的文档：优先保留 word 目录已有正文，其次 GitHub README API，再其次表单合成，最后占位符。
func resolveAuditMarkdownForSubmission(ctx context.Context, roundID, submissionID, githubURL string) string {
	target := fmt.Sprintf("%s_00_README.md", submissionID)
	wordPath := filepath.Join(wordDirFor(roundID), target)
	if data, err := os.ReadFile(wordPath); err == nil {
		s := string(data)
		if strings.TrimSpace(s) != "" && !isPlaceholderReadmeMarkdown(s) {
			return s
		}
	}
	rec := loadSubmissionRecordForAudit(roundID, submissionID)
	if strings.TrimSpace(githubURL) != "" {
		if md, err := fetchGithubRepoReadmeMarkdown(ctx, githubURL); err == nil && strings.TrimSpace(md) != "" {
			return md
		}
	}
	if rec != nil {
		if composed := composeMarkdownFromSubmissionForm(rec); composed != "" {
			return composed
		}
	}
	return fmt.Sprintf("# Imported repository\n\n- URL: %s\n- round_id: %s\n\n%s\n", strings.TrimSpace(githubURL), roundID, placeholderReadmeMarker+".")
}

// processGithubRepoAndAudit 将实质 README/表单内容写入 word 目录并可选用多模型跑审（与 /api/audit 一致取均分）。
// 不再无条件覆盖已由 postSubmit 写入的 docs_text *00_README.md；并尝试通过 GitHub API 拉取仓库 README。
// models 为空且非 skipLLM 时仅使用 deepseek；customPrompt 为空则用内置占位说明。
func processGithubRepoAndAudit(roundID, submissionID, githubURL string, skipLLM bool, models []string, outputLang, customPrompt string) error {
	if err := ensureRoundDirs(roundID); err != nil {
		return err
	}
	target := fmt.Sprintf("%s_00_README.md", submissionID)
	wordPath := filepath.Join(wordDirFor(roundID), target)
	ctxResolve, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	body := resolveAuditMarkdownForSubmission(ctxResolve, roundID, submissionID, githubURL)
	if err := os.WriteFile(wordPath, []byte(body), 0644); err != nil {
		return err
	}
	if skipLLM {
		return nil
	}
	ms := models
	if len(ms) == 0 {
		ms = []string{"deepseek"}
	}
	activeYAML, ruleID, _ := loadEffectiveRuleYAMLForRound(roundID)
	cp := strings.TrimSpace(customPrompt)
	if cp == "" {
		cp = "Auto-audit from GitHub ingest."
	}
	ol := strings.TrimSpace(outputLang)
	reports := make([]AuditReport, 0, len(ms))
	okCount := 0
	anyConflict := false
	for _, m := range ms {
		mm := strings.TrimSpace(strings.ToLower(m))
		content, score, rMax, conflict, conflictVals, llmErr := runSingleModelAudit(mm, ol, cp, target, body, activeYAML)
		rep := AuditReport{ModelName: m}
		if llmErr != nil {
			rep.Error = normalizeLLMErr(llmErr)
			reports = append(reports, rep)
			continue
		}
		rep.Content = content
		rep.Score = score
		rep.RubricRawMax = rMax
		rep.ScoreConflict = conflict
		rep.ScoreConflictValues = conflictVals
		if conflict {
			anyConflict = true
		}
		okCount++
		reports = append(reports, rep)
	}
	if okCount == 0 {
		return errors.New("all selected models failed audit")
	}
	avg, rawMax, letter := aggregateSavedResultScores(reports, activeYAML)
	res := &SavedResult{
		FileName:        target,
		AvgScore:        avg,
		RubricRawMax:    rawMax,
		LetterGrade:     letter,
		Timestamp:       time.Now().UTC().Format(time.RFC3339),
		Reports:         reports,
		RoundID:         roundID,
		RuleVersionID:   ruleID,
		RuleSHA256:      currentRuleSHA(roundID),
		ScoreConflict:   anyConflict,
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
	trackRaw := strings.TrimSpace(c.PostForm("track"))
	var trackVal string
	if RoundHasConfiguredTracks(roundID) {
		if trackRaw == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "track required for this round"})
			return
		}
		tid, err := sanitizeRoundTrackID(trackRaw)
		if err != nil || !validRoundTrackID(roundID, tid) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or unknown track"})
			return
		}
		trackVal = tid
	} else {
		trackVal = trackRaw
	}
	form := SubmissionForm{
		RoundID:      roundID,
		Track:        trackVal,
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
	var auditModels []string
	if raw := strings.TrimSpace(c.PostForm("selected_models")); raw != "" {
		_ = json.Unmarshal([]byte(raw), &auditModels)
	}
	auditOutLang := strings.TrimSpace(c.PostForm("output_lang"))
	auditPrompt := strings.TrimSpace(c.PostForm("custom_prompt"))
	_ = processGithubRepoAndAudit(roundID, subID, rec.Form.GithubURL, false, auditModels, auditOutLang, auditPrompt)
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
	if err := processGithubRepoAndAudit(roundID, subID, rec.Form.GithubURL, true, nil, "", ""); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"target_file": fmt.Sprintf("%s_00_README.md", subID), "readme_only": false})
}

// auraCORSMiddleware：仅在本机部署树 /root/aura 维护（systemd 使用此目录编译的 aura）。
// aura-judge-buddy/backend 对齐 GitHub，如需同样行为请把此处改动手工合并或拷贝到本树后再同步 go 文件。
//
// 允许前端（如 :3000）跨域访问 API（:8888）。未设置 AURA_CORS_ORIGINS 时回显 Origin；
// 设置 AURA_CORS_ORIGINS 为逗号分隔列表时仅允许列表中的 Origin。
func auraCORSMiddleware() gin.HandlerFunc {
	allowSet := make(map[string]bool)
	if raw := strings.TrimSpace(os.Getenv("AURA_CORS_ORIGINS")); raw != "" {
		for _, o := range strings.Split(raw, ",") {
			o = strings.TrimSpace(o)
			if o != "" {
				allowSet[o] = true
			}
		}
	}
	return func(c *gin.Context) {
		origin := strings.TrimSpace(c.GetHeader("Origin"))
		var allow string
		if len(allowSet) > 0 {
			if origin != "" && allowSet[origin] {
				allow = origin
			}
		} else if origin != "" {
			allow = origin
		} else {
			allow = "*"
		}
		if allow != "" {
			c.Header("Access-Control-Allow-Origin", allow)
			if allow != "*" {
				c.Header("Access-Control-Allow-Credentials", "true")
			}
		}
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, Authorization, X-Admin-Wallet")
		c.Header("Access-Control-Max-Age", "86400")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
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
	r.Use(auraCORSMiddleware())
	r.GET("/api/admin-config", getAdminConfig)
	r.GET("/api/files", getFiles)
	r.GET("/api/file-content", getFileContent)
	r.POST("/api/audit", postAudit)
	r.GET("/api/ranking", getRanking)
	r.GET("/api/judge-result", getJudgeResult)
	r.POST("/api/submit", postSubmit)
	r.GET("/api/submissions", getSubmissions)
	r.GET("/api/submission/:id", getSubmissionByID)
	r.PUT("/api/submission/:id/track", putSubmissionTrackHTTP)
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

