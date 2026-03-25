package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// BatchIngestGithubRequest 管理员批量导入：仅 GitHub 仓库 URL，复用与 /api/submit 相同的 clone → word → 可选自动裁决
type BatchIngestGithubRequest struct {
	RoundID string `json:"round_id"`
	URLs    []string `json:"urls"`
	// Track 写入各 submission.form.track；本场已配置 .aura_tracks.json 时必填且须为已登记赛道 id
	Track string `json:"track,omitempty"`
	// SkipDuplicates 为 nil 时默认 true：同一 round 下已存在相同仓库 URL 则跳过
	SkipDuplicates *bool `json:"skip_duplicates"`
	// AutoAudit 为 nil 时默认 true：clone 完成后对非 readme-only 仓库调用 LLM 自动裁决（与 AURA_AUTO_MODELS 一致）
	AutoAudit *bool `json:"auto_audit"`
	// Concurrency git clone 并发数，默认 2，范围 1–4
	Concurrency int `json:"concurrency"`
}

type batchIngestJob struct {
	ID  string
	URL string
}

func newBatchSubmissionID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%d_%s", time.Now().UnixNano(), hex.EncodeToString(b))
}

func normalizeGithubURLForCompare(s string) string {
	s = strings.TrimSpace(strings.ToLower(s))
	s = strings.TrimSuffix(s, "/")
	s = strings.TrimSuffix(s, ".git")
	if i := strings.Index(s, "github.com"); i >= 0 {
		s = s[i:]
	}
	return s
}

func canonicalGithubHTTPS(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", fmt.Errorf("empty url")
	}
	if !isHTTPURL(raw) {
		return "", fmt.Errorf("not http(s) url")
	}
	if !strings.Contains(strings.ToLower(raw), "github.com") {
		return "", fmt.Errorf("not a github.com url")
	}
	low := strings.ToLower(raw)
	if strings.HasPrefix(low, "http://") {
		raw = "https://" + raw[len("http://"):]
	}
	raw = strings.TrimSuffix(raw, "/")
	raw = strings.TrimSuffix(raw, ".git")
	return raw, nil
}

func projectTitleFromGithubURL(u string) string {
	canon, err := canonicalGithubHTTPS(u)
	if err != nil {
		return "GitHub import"
	}
	low := strings.ToLower(canon)
	idx := strings.Index(low, "github.com/")
	if idx < 0 {
		return "GitHub import"
	}
	rest := strings.Trim(canon[idx+len("github.com/"):], "/")
	if rest == "" {
		return "GitHub import"
	}
	return rest
}

func existingGithubURLKeysInRound(roundID string) (map[string]struct{}, error) {
	seen := make(map[string]struct{})
	base := submissionRoundDirFor(roundID)
	entries, err := os.ReadDir(base)
	if err != nil {
		if os.IsNotExist(err) {
			return seen, nil
		}
		return nil, err
	}
	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		metaPath := filepath.Join(base, e.Name(), "submission.json")
		data, err := os.ReadFile(metaPath)
		if err != nil {
			continue
		}
		var rec SubmissionRecord
		if json.Unmarshal(data, &rec) != nil {
			continue
		}
		gu := strings.TrimSpace(rec.Form.GithubURL)
		if gu == "" {
			continue
		}
		seen[normalizeGithubURLForCompare(gu)] = struct{}{}
	}
	return seen, nil
}

func dedupeURLsPreserveOrder(urls []string) []string {
	seen := make(map[string]struct{})
	var out []string
	for _, u := range urls {
		u = strings.TrimSpace(u)
		if u == "" {
			continue
		}
		k := normalizeGithubURLForCompare(u)
		if k == "" {
			continue
		}
		if _, ok := seen[k]; ok {
			continue
		}
		seen[k] = struct{}{}
		out = append(out, u)
	}
	return out
}

func postBatchIngestGithub(c *gin.Context) {
	var req BatchIngestGithubRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "JSON 参数错误"})
		return
	}
	roundID, err := sanitizeRoundIDOrDefault(req.RoundID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 round_id"})
		return
	}
	if err := ensureRoundDirs(roundID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法创建轮次目录"})
		return
	}

	trackVal := strings.TrimSpace(req.Track)
	if RoundHasConfiguredTracks(roundID) {
		if trackVal == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "本场已配置赛道，批量导入须指定 track"})
			return
		}
		tid, err := sanitizeRoundTrackID(trackVal)
		if err != nil || !validRoundTrackID(roundID, tid) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无效或未知赛道"})
			return
		}
		trackVal = tid
	} else if trackVal != "" {
		tid, err := sanitizeRoundTrackID(trackVal)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "赛道 id 格式无效"})
			return
		}
		trackVal = tid
	}

	skipDup := true
	if req.SkipDuplicates != nil {
		skipDup = *req.SkipDuplicates
	}
	autoAudit := true
	if req.AutoAudit != nil {
		autoAudit = *req.AutoAudit
	}
	skipLLM := !autoAudit

	concurrency := req.Concurrency
	if concurrency < 1 {
		concurrency = 2
	}
	if concurrency > 4 {
		concurrency = 4
	}

	rawList := dedupeURLsPreserveOrder(req.URLs)
	if len(rawList) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "urls 为空或全部无效"})
		return
	}

	existing, err := existingGithubURLKeysInRound(roundID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法扫描已有提交"})
		return
	}

	var invalid []string
	var skippedDuplicate []string
	var jobs []batchIngestJob

	for _, raw := range rawList {
		canon, verr := canonicalGithubHTTPS(raw)
		if verr != nil {
			invalid = append(invalid, raw)
			continue
		}
		key := normalizeGithubURLForCompare(canon)
		if skipDup {
			if _, dup := existing[key]; dup {
				skippedDuplicate = append(skippedDuplicate, canon)
				continue
			}
			existing[key] = struct{}{}
		}

		id := newBatchSubmissionID()
		dir := filepath.Join(submissionRoundDirFor(roundID), id)
		if err := os.MkdirAll(dir, 0755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "无法创建提交目录"})
			return
		}

		now := time.Now()
		title := projectTitleFromGithubURL(canon)
		record := SubmissionRecord{
			ID:        id,
			RoundID:   roundID,
			CreatedAt: now,
			Form: SubmissionForm{
				RoundID:      roundID,
				Track:        trackVal,
				ProjectTitle: title,
				OneLiner:     "Batch ingest via /api/batch/ingest-github-urls",
				Problem:      "",
				Solution:     "",
				GithubURL:    canon,
				DemoURL:      "",
				DocsText:     "",
			},
			Files: nil,
		}
		data, err := json.MarshalIndent(record, "", "  ")
		if err != nil {
			_ = os.RemoveAll(dir)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "序列化提交记录失败"})
			return
		}
		metaPath := filepath.Join(dir, "submission.json")
		if err := os.WriteFile(metaPath, data, 0644); err != nil {
			_ = os.RemoveAll(dir)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "写入 submission.json 失败"})
			return
		}

		jobs = append(jobs, batchIngestJob{ID: id, URL: canon})
	}

	ids := make([]string, 0, len(jobs))
	for _, j := range jobs {
		ids = append(ids, j.ID)
	}
	sort.Strings(ids)

	go runBatchGithubIngestWorkers(roundID, jobs, skipLLM, concurrency)

	c.JSON(http.StatusAccepted, gin.H{
		"message":             "已开始后台 clone 与生成 word；完成后可在 /judge 或 ranking 查看",
		"round_id":            roundID,
		"queued_jobs":         len(jobs),
		"submission_ids":      ids,
		"invalid_urls":        invalid,
		"skipped_duplicates":  skippedDuplicate,
		"auto_audit_llm":      autoAudit,
		"clone_concurrency":   concurrency,
	})
}

func runBatchGithubIngestWorkers(roundID string, jobs []batchIngestJob, skipLLM bool, concurrency int) {
	if len(jobs) == 0 {
		return
	}
	ch := make(chan batchIngestJob)
	var wg sync.WaitGroup
	for w := 0; w < concurrency; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range ch {
				if err := processGithubRepoAndAudit(roundID, j.ID, j.URL, skipLLM, nil, "", ""); err != nil {
					fmt.Printf("[batch-ingest] round=%s id=%s url=%s err=%v\n", roundID, j.ID, j.URL, err)
				} else {
					fmt.Printf("[batch-ingest] round=%s id=%s url=%s ok\n", roundID, j.ID, j.URL)
				}
			}
		}()
	}
	for _, j := range jobs {
		ch <- j
	}
	close(ch)
	wg.Wait()
	fmt.Printf("[batch-ingest] round=%s finished %d jobs\n", roundID, len(jobs))
}
