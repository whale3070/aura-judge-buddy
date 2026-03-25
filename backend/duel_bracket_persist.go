package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// 与管理台 / 排行榜 localStorage 结构一致；放在 submissions/<round_id>/ 下，避免 judge-result 内普通存证 JSON 被 getRanking 误读。
// 历史单文件（仅一份）；新写入为 .aura_duel_bracket_snapshot.<unixNano>.json，多次擂台互不覆盖。GET 返回其中最新一份。
const duelBracketSnapshotFile = ".aura_duel_bracket_snapshot.json"

// isDuelBracketSnapshotEntry 是否为本轮擂台存证文件（旧单文件或带纳秒时间戳的新文件）。
func isDuelBracketSnapshotEntry(name string) bool {
	if name == duelBracketSnapshotFile {
		return true
	}
	const pref = ".aura_duel_bracket_snapshot."
	if !strings.HasPrefix(name, pref) || !strings.HasSuffix(name, ".json") {
		return false
	}
	numPart := name[len(pref) : len(name)-len(".json")]
	if numPart == "" {
		return false
	}
	for _, r := range numPart {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// 排序键：带数字后缀的用文件名内纳秒（与我们写入时一致）；旧版单文件用 mtime。
func duelBracketSnapshotSortKey(entryName string, mod time.Time) int64 {
	if entryName == duelBracketSnapshotFile {
		return mod.UnixNano()
	}
	const pref = ".aura_duel_bracket_snapshot."
	numStr := entryName[len(pref) : len(entryName)-len(".json")]
	if n, err := strconv.ParseInt(numStr, 10, 64); err == nil {
		return n
	}
	return mod.UnixNano()
}

func readDuelSnapshotTrackID(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	var m struct {
		TrackID string `json:"trackId"`
	}
	if json.Unmarshal(data, &m) != nil {
		return ""
	}
	return strings.TrimSpace(m.TrackID)
}

// trackQueryResolved 已由 resolveRankingTrackQuery 规范化；空串表示「未按赛道筛选」。
func latestDuelBracketSnapshotPath(roundID, trackQueryResolved string) (string, error) {
	dir := submissionRoundDirFor(roundID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return "", os.ErrNotExist
		}
		return "", err
	}
	hasTracks := RoundHasConfiguredTracks(roundID)
	var bestPath string
	var bestKey int64 = -1
	for _, e := range entries {
		if e.IsDir() || !isDuelBracketSnapshotEntry(e.Name()) {
			continue
		}
		p := filepath.Join(dir, e.Name())
		st, err := os.Stat(p)
		if err != nil {
			continue
		}
		tid := readDuelSnapshotTrackID(p)
		if hasTracks && trackQueryResolved != "" {
			if tid != trackQueryResolved {
				continue
			}
		} else if hasTracks && trackQueryResolved == "" {
			// 未传 track：仅兼容旧版「全场一条」存证（无 trackId）
			if tid != "" {
				continue
			}
		}
		k := duelBracketSnapshotSortKey(e.Name(), st.ModTime())
		if k > bestKey {
			bestKey = k
			bestPath = p
		}
	}
	if bestPath == "" {
		return "", os.ErrNotExist
	}
	return bestPath, nil
}

// GET /api/duel-bracket-snapshot?round_id=&track_id= — 公开读取；多赛道时每赛道独立存证
func getDuelBracketSnapshot(c *gin.Context) {
	roundID, err := sanitizeRoundIDOrDefault(c.Query("round_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 round_id"})
		return
	}
	trackRaw := strings.TrimSpace(c.Query("track_id"))
	var trackResolved string
	if trackRaw != "" {
		var terr error
		trackResolved, terr = resolveRankingTrackQuery(roundID, trackRaw)
		if terr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 track_id"})
			return
		}
	}
	p, err := latestDuelBracketSnapshotPath(roundID, trackResolved)
	if err != nil {
		if os.IsNotExist(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取目录失败"})
		return
	}
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
		TrackID         string          `json:"trackId"`
		RankedFileNames []string        `json:"rankedFileNames"`
		Matches         json.RawMessage `json:"matches"`
	}
	if json.Unmarshal(raw, &check) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "非法 JSON"})
		return
	}
	if RoundHasConfiguredTracks(roundID) {
		tid, err := sanitizeRoundTrackID(check.TrackID)
		if err != nil || !validRoundTrackID(roundID, tid) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "本场已配置赛道：JSON 须有合法 trackId"})
			return
		}
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
	ts := time.Now().UnixNano()
	p := filepath.Join(submissionRoundDirFor(roundID), fmt.Sprintf(".aura_duel_bracket_snapshot.%d.json", ts))
	if err := os.WriteFile(p, raw, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "写入失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "path": filepath.Base(p)})
}

// DELETE /api/duel-bracket-snapshot?round_id=&track_id= — 未传 track_id 时删除该轮全部擂台存证；传 track_id 时仅删该赛道
func deleteDuelBracketSnapshot(c *gin.Context) {
	roundID, err := sanitizeRoundIDOrDefault(c.Query("round_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 round_id"})
		return
	}
	trackRaw := strings.TrimSpace(c.Query("track_id"))
	var trackResolved string
	if trackRaw != "" {
		var terr error
		trackResolved, terr = resolveRankingTrackQuery(roundID, trackRaw)
		if terr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 track_id"})
			return
		}
	}
	dir := submissionRoundDirFor(roundID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			c.JSON(http.StatusOK, gin.H{"ok": true})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取目录失败"})
		return
	}
	var delErr error
	for _, e := range entries {
		if e.IsDir() || !isDuelBracketSnapshotEntry(e.Name()) {
			continue
		}
		p := filepath.Join(dir, e.Name())
		if trackResolved != "" {
			if readDuelSnapshotTrackID(p) != trackResolved {
				continue
			}
		}
		if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
			delErr = err
		}
	}
	if delErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
