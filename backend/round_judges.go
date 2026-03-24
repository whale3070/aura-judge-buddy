package main

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	judgeAssignmentsFileName = ".judge_assignments.json"
	humanReviewsFileName     = ".human_reviews.json"
)

type judgePanelRow struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type judgeAssignmentsFile struct {
	Judges    []judgePanelRow     `json:"judges"`
	ByJudge   map[string][]string `json:"by_judge"`
	UpdatedAt string              `json:"updated_at,omitempty"`
}

type humanReviewEntry struct {
	Comment   string   `json:"comment"`
	Score     *float64 `json:"score"`
	UpdatedAt string   `json:"updated_at"`
}

type humanReviewsFile struct {
	Reviews map[string]map[string]*humanReviewEntry `json:"reviews"`
}

func judgeAssignmentsPath(roundID string) string {
	return filepath.Join(submissionRoundDirFor(roundID), judgeAssignmentsFileName)
}

func humanReviewsPath(roundID string) string {
	return filepath.Join(submissionRoundDirFor(roundID), humanReviewsFileName)
}

func loadJudgeAssignments(roundID string) (*judgeAssignmentsFile, error) {
	p := judgeAssignmentsPath(roundID)
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return &judgeAssignmentsFile{ByJudge: map[string][]string{}}, nil
		}
		return nil, err
	}
	var f judgeAssignmentsFile
	if err := json.Unmarshal(data, &f); err != nil {
		return nil, err
	}
	if f.ByJudge == nil {
		f.ByJudge = map[string][]string{}
	}
	return &f, nil
}

func saveJudgeAssignments(roundID string, f *judgeAssignmentsFile) error {
	if err := ensureRoundDirs(roundID); err != nil {
		return err
	}
	f.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	data, err := json.MarshalIndent(f, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(judgeAssignmentsPath(roundID), data, 0644)
}

func loadHumanReviews(roundID string) (*humanReviewsFile, error) {
	p := humanReviewsPath(roundID)
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return &humanReviewsFile{Reviews: map[string]map[string]*humanReviewEntry{}}, nil
		}
		return nil, err
	}
	var f humanReviewsFile
	if err := json.Unmarshal(data, &f); err != nil {
		return nil, err
	}
	if f.Reviews == nil {
		f.Reviews = map[string]map[string]*humanReviewEntry{}
	}
	return &f, nil
}

func saveHumanReviews(roundID string, f *humanReviewsFile) error {
	if err := ensureRoundDirs(roundID); err != nil {
		return err
	}
	data, err := json.MarshalIndent(f, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(humanReviewsPath(roundID), data, 0644)
}

var judgeIDStrictRE = regexp.MustCompile(`^[a-zA-Z0-9._-]{1,64}$`)

func sanitizeJudgeIDStrict(s string) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" || !judgeIDStrictRE.MatchString(s) {
		return "", fmt.Errorf("invalid judge_id")
	}
	return s, nil
}

func submissionAssignedToJudge(assign *judgeAssignmentsFile, judgeID, subID string) bool {
	for _, x := range assign.ByJudge[judgeID] {
		if x == subID {
			return true
		}
	}
	return false
}

func workspaceSubmissionJSON(sum SubmissionSummary, rev *humanReviewEntry) gin.H {
	out := gin.H{
		"id":             sum.ID,
		"round_id":       sum.RoundID,
		"created_at":     sum.CreatedAt.UTC().Format(time.RFC3339),
		"project_title":  sum.ProjectTitle,
		"one_liner":      sum.OneLiner,
		"github_url":     sum.GithubURL,
		"demo_url":       sum.DemoURL,
		"why_this_chain": sum.WhyThisChain,
		"md_files":       sum.MDFiles,
	}
	if rev != nil {
		if rev.Comment != "" {
			out["human_comment"] = rev.Comment
		}
		if rev.Score != nil {
			out["human_score"] = *rev.Score
		}
		if rev.UpdatedAt != "" {
			out["human_updated_at"] = rev.UpdatedAt
		}
	}
	return out
}

// GET /api/rounds/:id/judges-panel
func getJudgesPanel(c *gin.Context) {
	rid, err := sanitizeRoundIDStrict(strings.TrimSpace(c.Param("id")))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 round_id"})
		return
	}
	if !roundDirExists(rid) {
		c.JSON(http.StatusNotFound, gin.H{"error": "轮次不存在"})
		return
	}
	assign, err := loadJudgeAssignments(rid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取评委配置失败"})
		return
	}
	summaries, err := submissionSummariesForRound(rid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "列出提交失败"})
		return
	}
	counts := make(map[string]int)
	for jid, ids := range assign.ByJudge {
		counts[jid] = len(ids)
	}
	c.JSON(http.StatusOK, gin.H{
		"round_id":         rid,
		"judges":           assign.Judges,
		"by_judge":         assign.ByJudge,
		"counts":           counts,
		"submission_total": len(summaries),
		"updated_at":       assign.UpdatedAt,
	})
}

// PUT /api/rounds/:id/judges-panel
func putJudgesPanel(c *gin.Context) {
	rid, err := sanitizeRoundIDStrict(strings.TrimSpace(c.Param("id")))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 round_id"})
		return
	}
	if !roundDirExists(rid) {
		c.JSON(http.StatusNotFound, gin.H{"error": "轮次不存在"})
		return
	}
	var body struct {
		Judges []judgePanelRow `json:"judges"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 JSON"})
		return
	}
	assign, _ := loadJudgeAssignments(rid)
	newBy := make(map[string][]string)
	var nextJudges []judgePanelRow
	seen := make(map[string]struct{})
	for _, j := range body.Judges {
		jid := strings.TrimSpace(j.ID)
		if jid == "" {
			continue
		}
		if _, dup := seen[jid]; dup {
			continue
		}
		seen[jid] = struct{}{}
		nextJudges = append(nextJudges, judgePanelRow{ID: jid, Name: strings.TrimSpace(j.Name)})
		if prev, ok := assign.ByJudge[jid]; ok {
			newBy[jid] = append([]string(nil), prev...)
		} else {
			newBy[jid] = []string{}
		}
	}
	assign.Judges = nextJudges
	assign.ByJudge = newBy
	if err := saveJudgeAssignments(rid, assign); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "saved"})
}

// POST /api/rounds/:id/judges-panel/auto-assign
func postJudgesAutoAssign(c *gin.Context) {
	rid, err := sanitizeRoundIDStrict(strings.TrimSpace(c.Param("id")))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 round_id"})
		return
	}
	if !roundDirExists(rid) {
		c.JSON(http.StatusNotFound, gin.H{"error": "轮次不存在"})
		return
	}
	assign, err := loadJudgeAssignments(rid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取评委配置失败"})
		return
	}
	if len(assign.Judges) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请先添加评委"})
		return
	}
	summaries, err := submissionSummariesForRound(rid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "列出提交失败"})
		return
	}
	var ids []string
	for _, s := range summaries {
		ids = append(ids, s.ID)
	}
	sort.Strings(ids)
	n := len(assign.Judges)
	if n == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无评委"})
		return
	}
	newBy := make(map[string][]string)
	for _, j := range assign.Judges {
		newBy[j.ID] = []string{}
	}
	for i, subID := range ids {
		jidx := i % n
		jid := assign.Judges[jidx].ID
		newBy[jid] = append(newBy[jid], subID)
	}
	assign.ByJudge = newBy
	if err := saveJudgeAssignments(rid, assign); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败"})
		return
	}
	counts := make(map[string]int)
	for jid, list := range assign.ByJudge {
		counts[jid] = len(list)
	}
	c.JSON(http.StatusOK, gin.H{
		"message":          "assigned",
		"round_id":         rid,
		"by_judge":         assign.ByJudge,
		"counts":           counts,
		"submission_total": len(ids),
	})
}

// GET /api/rounds/:id/judge/:judgeId/workspace
func getJudgeWorkspace(c *gin.Context) {
	rid, err := sanitizeRoundIDStrict(strings.TrimSpace(c.Param("id")))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 round_id"})
		return
	}
	jid, err := sanitizeJudgeIDStrict(c.Param("judgeId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 judge_id"})
		return
	}
	if !roundDirExists(rid) {
		c.JSON(http.StatusNotFound, gin.H{"error": "轮次不存在"})
		return
	}
	assign, err := loadJudgeAssignments(rid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取评委配置失败"})
		return
	}
	var jname string
	found := false
	for _, j := range assign.Judges {
		if j.ID == jid {
			jname = j.Name
			found = true
			break
		}
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "未找到该评委"})
		return
	}
	hf, err := loadHumanReviews(rid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取人工评审失败"})
		return
	}
	subIDs := assign.ByJudge[jid]
	var subs []gin.H
	for _, subID := range subIDs {
		metaPath := filepath.Join(submissionRoundDirFor(rid), subID, "submission.json")
		sum, err := submissionSummaryFromMeta(metaPath, subID, rid, false)
		if err != nil {
			continue
		}
		var rev *humanReviewEntry
		if hf.Reviews[jid] != nil {
			rev = hf.Reviews[jid][subID]
		}
		subs = append(subs, workspaceSubmissionJSON(sum, rev))
	}
	c.JSON(http.StatusOK, gin.H{
		"round_id":    rid,
		"judge":       gin.H{"id": jid, "name": jname},
		"count":       len(subs),
		"submissions": subs,
	})
}

type putHumanReviewBody struct {
	Comment string   `json:"comment"`
	Score   *float64 `json:"score"`
}

// PUT /api/rounds/:id/judge/:judgeId/submissions/:subId/human-review
func putJudgeHumanReview(c *gin.Context) {
	rid, err := sanitizeRoundIDStrict(strings.TrimSpace(c.Param("id")))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 round_id"})
		return
	}
	jid, err := sanitizeJudgeIDStrict(c.Param("judgeId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 judge_id"})
		return
	}
	subID := strings.TrimSpace(c.Param("subId"))
	if !submissionFolderIDOK(subID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 submission id"})
		return
	}
	var body putHumanReviewBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求体无效"})
		return
	}
	if body.Score != nil {
		s := *body.Score
		if math.IsNaN(s) || math.IsInf(s, 0) || s < 0 || s > 100 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "score 须在 0–100 之间"})
			return
		}
	}
	assign, err := loadJudgeAssignments(rid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取评委配置失败"})
		return
	}
	found := false
	for _, j := range assign.Judges {
		if j.ID == jid {
			found = true
			break
		}
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "未找到该评委"})
		return
	}
	if !submissionAssignedToJudge(assign, jid, subID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "该项目未分配给当前评委"})
		return
	}
	hf, err := loadHumanReviews(rid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取人工评审记录失败"})
		return
	}
	comment := strings.TrimSpace(body.Comment)
	if comment == "" && body.Score == nil {
		if hf.Reviews[jid] != nil {
			delete(hf.Reviews[jid], subID)
			if len(hf.Reviews[jid]) == 0 {
				delete(hf.Reviews, jid)
			}
		}
		if err := saveHumanReviews(rid, hf); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"message":          "cleared",
			"submission_id":    subID,
			"human_comment":    "",
			"human_score":      nil,
			"human_updated_at": time.Now().UTC().Format(time.RFC3339),
		})
		return
	}
	ent := &humanReviewEntry{
		Comment:   comment,
		Score:     body.Score,
		UpdatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	if hf.Reviews[jid] == nil {
		hf.Reviews[jid] = map[string]*humanReviewEntry{}
	}
	hf.Reviews[jid][subID] = ent
	if err := saveHumanReviews(rid, hf); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败"})
		return
	}
	resp := gin.H{
		"message":          "saved",
		"submission_id":    subID,
		"human_comment":    ent.Comment,
		"human_updated_at": ent.UpdatedAt,
		"human_score":      nil,
	}
	if ent.Score != nil {
		resp["human_score"] = *ent.Score
	}
	c.JSON(http.StatusOK, resp)
}
