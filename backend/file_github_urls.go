package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

// getFileGithubURLs 返回 word 目录下各 readme 文件名（如 1774…_00_README.md）到提交时 GitHub 仓库 URL 的映射，
// 供排行榜页展示「源码地址」。公开接口，与 GET /api/ranking 一致无需管理员头。
// GET /api/file-github-urls?round_id=... → { "文件名": "https://github.com/owner/repo" }
func getFileGithubURLs(c *gin.Context) {
	roundID, err := sanitizeRoundIDOrDefault(c.Query("round_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 round_id"})
		return
	}
	m, err := buildFileGithubURLMap(roundID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法构建文件与 GitHub 映射"})
		return
	}
	c.JSON(http.StatusOK, m)
}

// buildFileGithubURLMap 遍历 submissions/<round_id>/ 下 submission.json，将每条提交在对应 word/<round_id>/ 中关联的 .md 文件名映射到其 github_url。
// 若同一文件名被多次关联（异常数据），保留 CreatedAt 较新的提交。
func buildFileGithubURLMap(roundID string) (map[string]string, error) {
	out := make(map[string]string)
	bestAt := make(map[string]int64)

	entries, err := os.ReadDir(submissionRoundDirFor(roundID))
	if err != nil {
		return nil, err
	}

	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		subID := e.Name()
		metaPath := filepath.Join(submissionRoundDirFor(roundID), subID, "submission.json")
		data, err := os.ReadFile(metaPath)
		if err != nil {
			continue
		}
		var rec SubmissionRecord
		if json.Unmarshal(data, &rec) != nil {
			continue
		}
		url := strings.TrimSpace(rec.Form.GithubURL)
		if url == "" {
			continue
		}

		wordEntries, err := os.ReadDir(wordDirFor(roundID))
		if err != nil {
			continue
		}
		prefix := subID + "_"
		ts := rec.CreatedAt.UnixNano()
		for _, we := range wordEntries {
			if we.IsDir() {
				continue
			}
			name := we.Name()
			if !strings.HasPrefix(name, prefix) || !strings.EqualFold(filepath.Ext(name), ".md") {
				continue
			}
			if prev, ok := bestAt[name]; !ok || ts >= prev {
				bestAt[name] = ts
				out[name] = url
			}
		}
	}

	return out, nil
}
