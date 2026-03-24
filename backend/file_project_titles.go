package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

// getFileProjectTitles 返回 word 目录下各 readme 文件名到「项目名称」的映射（来自 submissions 内 submission.json），
// 供公开排行榜页展示人类可读标题。GET /api/file-project-titles?round_id=...
func getFileProjectTitles(c *gin.Context) {
	roundID, err := sanitizeRoundIDOrDefault(c.Query("round_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 round_id"})
		return
	}
	m, err := buildFileProjectTitleMap(roundID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法构建文件与项目名映射"})
		return
	}
	c.JSON(http.StatusOK, m)
}

func submissionDisplayTitle(rec *SubmissionRecord, subID string) string {
	t := strings.TrimSpace(rec.Form.ProjectTitle)
	if t != "" {
		return t
	}
	one := strings.TrimSpace(rec.Form.OneLiner)
	if one != "" {
		runes := []rune(one)
		if len(runes) > 80 {
			return string(runes[:80]) + "…"
		}
		return one
	}
	return "项目 " + subID
}

// buildFileProjectTitleMap 与 buildFileGithubURLMap 相同遍历方式；同一文件名多提交时保留 CreatedAt 较新者。
func buildFileProjectTitleMap(roundID string) (map[string]string, error) {
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

		display := submissionDisplayTitle(&rec, subID)
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
				out[name] = display
			}
		}
	}

	return out, nil
}
