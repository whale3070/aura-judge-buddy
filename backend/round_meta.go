package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

const roundMetaFileName = ".aura_round_meta.json"

func roundMetaPath(roundID string) string {
	return filepath.Join(submissionRoundDirFor(roundID), roundMetaFileName)
}

type storedRoundRules struct {
	RuleVersionID     string `json:"rule_version_id,omitempty"`
	ScoringDimensions []struct {
		Name   string `json:"name"`
		Weight int    `json:"weight"`
	} `json:"scoring_dimensions"`
	GradeBands []struct {
		Grade string `json:"grade"`
		Min   int    `json:"min"`
		Max   int    `json:"max"`
	} `json:"grade_bands"`
}

type storedRoundPitch struct {
	Enabled   bool `json:"enabled"`
	Weight    int  `json:"weight"`
	SubScores []struct {
		Name   string `json:"name"`
		Weight int    `json:"weight"`
	} `json:"sub_scores"`
}

// StoredRoundMeta 存在 submissions/<round_id>/.aura_round_meta.json
type StoredRoundMeta struct {
	Name        string           `json:"name"`
	Description string           `json:"description,omitempty"`
	Mode        string           `json:"mode,omitempty"`
	Timezone    string           `json:"timezone,omitempty"`
	StartAt     string           `json:"start_at,omitempty"`
	EndAt       string           `json:"end_at,omitempty"`
	Status      string           `json:"status,omitempty"`
	Rules       storedRoundRules `json:"rules"`
	Pitch       storedRoundPitch `json:"pitch"`
}

func loadRoundMeta(roundID string) (*StoredRoundMeta, error) {
	data, err := os.ReadFile(roundMetaPath(roundID))
	if err != nil {
		return nil, err
	}
	var m StoredRoundMeta
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, err
	}
	return &m, nil
}

func saveRoundMeta(roundID string, m *StoredRoundMeta) error {
	if err := ensureRoundDirs(roundID); err != nil {
		return err
	}
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(roundMetaPath(roundID), data, 0644)
}

func roundDirExists(roundID string) bool {
	st, err := os.Stat(submissionRoundDirFor(roundID))
	return err == nil && st.IsDir()
}

type createRoundBody struct {
	ID string `json:"id" binding:"required"`
	StoredRoundMeta
}

// postCreateRound POST /api/rounds — 创建轮次目录并写入元数据（管理员）
func postCreateRound(c *gin.Context) {
	var body createRoundBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 JSON，需要 id 及元数据字段"})
		return
	}
	rid, err := sanitizeRoundIDStrict(strings.TrimSpace(body.ID))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 round id（仅字母数字 . _ -）"})
		return
	}
	if roundDirExists(rid) {
		c.JSON(http.StatusConflict, gin.H{"error": "该轮次已存在", "id": rid})
		return
	}
	if err := ensureRoundDirs(rid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法创建轮次目录"})
		return
	}
	meta := body.StoredRoundMeta
	if err := saveRoundMeta(rid, &meta); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法写入轮次元数据"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": rid, "message": "created"})
}

// putRoundMeta PUT /api/rounds/:id — 更新元数据（管理员），目录须已存在
func putRoundMeta(c *gin.Context) {
	rid, err := sanitizeRoundIDStrict(strings.TrimSpace(c.Param("id")))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 round id"})
		return
	}
	if !roundDirExists(rid) {
		c.JSON(http.StatusNotFound, gin.H{"error": "轮次不存在"})
		return
	}
	var meta StoredRoundMeta
	if err := c.ShouldBindJSON(&meta); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 JSON"})
		return
	}
	if err := saveRoundMeta(rid, &meta); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法保存轮次元数据"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": rid, "message": "updated"})
}

// getRoundDetail GET /api/rounds/:id — 单轮详情（元数据 + 统计）
func getRoundDetail(c *gin.Context) {
	rid, err := sanitizeRoundIDStrict(strings.TrimSpace(c.Param("id")))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 round id"})
		return
	}
	if !roundDirExists(rid) {
		c.JSON(http.StatusNotFound, gin.H{"error": "轮次不存在"})
		return
	}
	meta, _ := loadRoundMeta(rid)
	out := gin.H{
		"id":                 rid,
		"submission_count":   countSubmissionsInRound(rid),
		"audited_file_count": countDistinctAuditedWordFiles(rid),
	}
	if meta != nil {
		out["meta"] = meta
	}
	c.JSON(http.StatusOK, out)
}
