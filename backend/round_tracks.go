package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
)

// 赛道元数据：submissions/<round_id>/.aura_tracks.json
// 路由需在主程序中注册，例如：
//   r.GET("/api/rounds/:id/tracks", getRoundTracksHTTP)
//   r.PUT("/api/rounds/:id/tracks", putRoundTracksHTTP)

const auraTracksFileName = ".aura_tracks.json"

var roundTrackIDRe = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)

func auraTracksPath(roundID string) string {
	return filepath.Join(submissionRoundDirFor(roundID), auraTracksFileName)
}

// RoundTrackEntry 与前端 TracksManagement / fetchRoundTracksAPI 一致
type RoundTrackEntry struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	PrizePool   string `json:"prize_pool,omitempty"`
}

type auraTracksFile struct {
	Tracks []RoundTrackEntry `json:"tracks"`
}

func loadAuraTracksFile(roundID string) (*auraTracksFile, error) {
	p := auraTracksPath(roundID)
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return &auraTracksFile{Tracks: nil}, nil
		}
		return nil, err
	}
	var f auraTracksFile
	if err := json.Unmarshal(data, &f); err != nil {
		return nil, err
	}
	return &f, nil
}

func saveAuraTracksFile(roundID string, f *auraTracksFile) error {
	if err := ensureRoundDirs(roundID); err != nil {
		return err
	}
	data, err := json.MarshalIndent(f, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(auraTracksPath(roundID), data, 0644)
}

func sanitizeRoundTrackID(s string) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" || !roundTrackIDRe.MatchString(s) {
		return "", errors.New("invalid track id")
	}
	return s, nil
}

// getRoundTracksHTTP GET /api/rounds/:id/tracks
func getRoundTracksHTTP(c *gin.Context) {
	rid := strings.TrimSpace(c.Param("id"))
	if _, err := sanitizeRoundIDStrict(rid); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 round id"})
		return
	}
	if !roundDirExists(rid) {
		c.JSON(http.StatusNotFound, gin.H{"error": "轮次不存在"})
		return
	}
	f, err := loadAuraTracksFile(rid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取赛道配置失败"})
		return
	}
	if f.Tracks == nil {
		f.Tracks = []RoundTrackEntry{}
	}
	c.JSON(http.StatusOK, gin.H{"tracks": f.Tracks})
}

type putRoundTracksBody struct {
	Tracks []RoundTrackEntry `json:"tracks"`
}

// putRoundTracksHTTP PUT /api/rounds/:id/tracks — 与前端赛道管理一致（管理员鉴权由外层中间件负责时可在此省略）
func putRoundTracksHTTP(c *gin.Context) {
	rid := strings.TrimSpace(c.Param("id"))
	if _, err := sanitizeRoundIDStrict(rid); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 round id"})
		return
	}
	if !roundDirExists(rid) {
		c.JSON(http.StatusNotFound, gin.H{"error": "轮次不存在"})
		return
	}
	var body putRoundTracksBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 JSON"})
		return
	}
	out := make([]RoundTrackEntry, 0, len(body.Tracks))
	seen := make(map[string]struct{})
	for _, t := range body.Tracks {
		id, err := sanitizeRoundTrackID(t.ID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "赛道 id 非法: " + t.ID})
			return
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, RoundTrackEntry{
			ID:          id,
			Name:        strings.TrimSpace(t.Name),
			Description: strings.TrimSpace(t.Description),
			PrizePool:   strings.TrimSpace(t.PrizePool),
		})
	}
	if err := saveAuraTracksFile(rid, &auraTracksFile{Tracks: out}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"tracks": out})
}

// ValidRoundTrackID 返回 true 当且仅当 id 在轮次 .aura_tracks.json 中存在（用于提交校验）
func validRoundTrackID(roundID, trackID string) bool {
	tid, err := sanitizeRoundTrackID(trackID)
	if err != nil {
		return false
	}
	f, err := loadAuraTracksFile(roundID)
	if err != nil || f == nil {
		return false
	}
	for _, t := range f.Tracks {
		if strings.TrimSpace(t.ID) == tid {
			return true
		}
	}
	return false
}

// RoundHasConfiguredTracks 是否配置了至少一条有效赛道
func RoundHasConfiguredTracks(roundID string) bool {
	f, err := loadAuraTracksFile(roundID)
	if err != nil || f == nil {
		return false
	}
	for _, t := range f.Tracks {
		if id, err := sanitizeRoundTrackID(t.ID); err == nil && id != "" {
			return true
		}
	}
	return false
}
