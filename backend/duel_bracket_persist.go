package main

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

// 与管理台 / 排行榜 localStorage 结构一致；放在 submissions/<round_id>/ 下，避免 judge-result 内普通存证 JSON 被 getRanking 误读。
const duelBracketSnapshotFile = ".aura_duel_bracket_snapshot.json"

func duelBracketSnapshotPath(roundID string) string {
	return filepath.Join(submissionRoundDirFor(roundID), duelBracketSnapshotFile)
}

// GET /api/duel-bracket-snapshot?round_id= — 公开读取，供排名页同步服务端擂台结果
func getDuelBracketSnapshot(c *gin.Context) {
	roundID, err := sanitizeRoundIDOrDefault(c.Query("round_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 round_id"})
		return
	}
	p := duelBracketSnapshotPath(roundID)
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取失败"})
		return
	}
	c.Data(http.StatusOK, "application/json; charset=utf-8", data)
}

// PUT /api/duel-bracket-snapshot?round_id= — 管理员写入（Body 为完整快照 JSON）
func putDuelBracketSnapshot(c *gin.Context) {
	roundID, err := sanitizeRoundIDOrDefault(c.Query("round_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 round_id"})
		return
	}
	raw, err := io.ReadAll(c.Request.Body)
	if err != nil || len(raw) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求体无效"})
		return
	}
	var check struct {
		SavedAt         string          `json:"savedAt"`
		PoolTier        string          `json:"poolTier"`
		RoundID         string          `json:"roundId"`
		RankedFileNames []string        `json:"rankedFileNames"`
		Matches         json.RawMessage `json:"matches"`
	}
	if json.Unmarshal(raw, &check) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "非法 JSON"})
		return
	}
	if check.PoolTier != "S" && check.PoolTier != "A" && check.PoolTier != "B" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "poolTier 须为 S/A/B"})
		return
	}
	if check.Matches == nil || string(check.Matches) == "null" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 matches"})
		return
	}
	if len(check.RankedFileNames) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 rankedFileNames"})
		return
	}
	if strings.TrimSpace(check.RoundID) != "" && check.RoundID != roundID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "JSON 内 roundId 与 query round_id 不一致"})
		return
	}

	if err := ensureRoundDirs(roundID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法创建轮次目录"})
		return
	}
	p := duelBracketSnapshotPath(roundID)
	if err := os.WriteFile(p, raw, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "写入失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DELETE /api/duel-bracket-snapshot?round_id= — 管理员删除服务端存证
func deleteDuelBracketSnapshot(c *gin.Context) {
	roundID, err := sanitizeRoundIDOrDefault(c.Query("round_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 round_id"})
		return
	}
	p := duelBracketSnapshotPath(roundID)
	err = os.Remove(p)
	if err != nil && !os.IsNotExist(err) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
