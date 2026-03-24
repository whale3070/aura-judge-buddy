package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/sashabaranov/go-openai"
)

type duelRequest struct {
	RoundID    string `json:"round_id"`
	FileA      string `json:"file_a"`
	FileB      string `json:"file_b"`
	Model      string `json:"model"`
	OutputLang string `json:"output_lang"`
}

var duelWinnerRE = regexp.MustCompile(`(?i)DUEL_WINNER\s*[:：=＝]\s*([ABabＡＢａｂ])`)
var duelDimLineRE = regexp.MustCompile(`(?i)^\s*DUEL_DIM_([1-5])\s*[:：]\s*([ABabＡＢａｂ])\s*$`)
var duelWinnerLineRE = regexp.MustCompile(`(?i)^\s*DUEL_WINNER\s*[:：=＝]\s*([ABabＡＢａｂ])\s*$`)

func validateWordFileBaseName(name string) bool {
	s := strings.TrimSpace(name)
	if s == "" {
		return false
	}
	if strings.Contains(s, "..") || strings.ContainsAny(s, string(os.PathSeparator)) {
		return false
	}
	return true
}

func normalizeDuelSide(tok string) string {
	t := strings.TrimSpace(tok)
	switch t {
	case "A", "a", "Ａ", "ａ":
		return "A"
	case "B", "b", "Ｂ", "ｂ":
		return "B"
	default:
		return ""
	}
}

func parseDuelWinnerFromRaw(raw string) string {
	all := duelWinnerRE.FindAllStringSubmatch(raw, -1)
	if len(all) == 0 {
		return ""
	}
	last := all[len(all)-1][1]
	return normalizeDuelSide(last)
}

// parseDuelDimVotes 解析文末 DUEL_DIM_1:A … DUEL_DIM_5:B
func parseDuelDimVotes(raw string) (aCount, bCount int) {
	seen := make(map[int]string)
	for _, line := range strings.Split(raw, "\n") {
		m := duelDimLineRE.FindStringSubmatch(strings.TrimSpace(line))
		if m == nil {
			continue
		}
		idx, err := strconv.Atoi(m[1])
		if err != nil || idx < 1 || idx > 5 {
			continue
		}
		side := normalizeDuelSide(m[2])
		if side == "" {
			continue
		}
		seen[idx] = side
	}
	for _, side := range seen {
		if side == "A" {
			aCount++
		} else {
			bCount++
		}
	}
	return aCount, bCount
}

// resolveDuelWinner 优先按「五维中 ≥3 维获胜」多数决；否则回退到 DUEL_WINNER 行
func resolveDuelWinner(raw string) string {
	aCnt, bCnt := parseDuelDimVotes(raw)
	if aCnt >= 3 {
		return "A"
	}
	if bCnt >= 3 {
		return "B"
	}
	if aCnt > bCnt && aCnt > 0 {
		return "A"
	}
	if bCnt > aCnt && bCnt > 0 {
		return "B"
	}
	return parseDuelWinnerFromRaw(raw)
}

// stripDuelMachineFooter 去掉文末机器可读行，保留完整对比正文（不再截断字数）
func stripDuelMachineFooter(raw string) string {
	lines := strings.Split(raw, "\n")
	end := len(lines) - 1
	for end >= 0 {
		s := strings.TrimSpace(lines[end])
		if s == "" {
			end--
			continue
		}
		if duelDimLineRE.MatchString(s) || duelWinnerLineRE.MatchString(s) {
			end--
			continue
		}
		break
	}
	if end < 0 {
		return strings.TrimSpace(raw)
	}
	return strings.TrimSpace(strings.Join(lines[:end+1], "\n"))
}

func buildDimensionWinnersJSON(raw string) []gin.H {
	seen := make(map[int]string)
	for _, line := range strings.Split(raw, "\n") {
		m := duelDimLineRE.FindStringSubmatch(strings.TrimSpace(line))
		if m == nil {
			continue
		}
		idx, err := strconv.Atoi(m[1])
		if err != nil || idx < 1 || idx > 5 {
			continue
		}
		side := normalizeDuelSide(m[2])
		if side == "" {
			continue
		}
		seen[idx] = side
	}
	out := make([]gin.H, 0, len(seen))
	for i := 1; i <= 5; i++ {
		if w, ok := seen[i]; ok {
			out = append(out, gin.H{"index": i, "winner": w})
		}
	}
	return out
}

func duelLanguageBlock(outputLang string) string {
	b := "[LANGUAGE]\n"
	if strings.TrimSpace(strings.ToLower(outputLang)) == "zh" {
		b += "全文使用中文撰写。\n"
	} else {
		b += "Write in English only (except quoted document text).\n"
	}
	b += "[/LANGUAGE]\n\n"
	return b
}

// postDuel POST /api/duel — 管理员：两份 word 五维逐维对比 + 多数决（≥3 维胜）
func postDuel(c *gin.Context) {
	var req duelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	roundID, err := sanitizeRoundIDOrDefault(req.RoundID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 round_id"})
		return
	}

	fa := strings.TrimSpace(req.FileA)
	fb := strings.TrimSpace(req.FileB)
	if !validateWordFileBaseName(fa) || !validateWordFileBaseName(fb) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "非法文件名"})
		return
	}
	if fa == fb {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file_a 与 file_b 不能相同"})
		return
	}

	pathA, err := resolveWordDocumentPath(roundID, fa)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "未找到文档 A（请确认 word 目录与 round_id）"})
		return
	}
	pathB, err := resolveWordDocumentPath(roundID, fb)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "未找到文档 B（请确认 word 目录与 round_id）"})
		return
	}
	docA, err := os.ReadFile(pathA)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "读取文档 A 失败"})
		return
	}
	docB, err := os.ReadFile(pathB)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "读取文档 B 失败"})
		return
	}

	activeYAML, _, _ := loadEffectiveRuleYAMLForRound(roundID)
	lang := req.OutputLang
	if strings.TrimSpace(lang) == "" {
		lang = "en"
	}
	if strings.ToLower(strings.TrimSpace(lang)) != "zh" {
		lang = "en"
	}

	rulesBlock := ""
	if strings.TrimSpace(activeYAML) != "" {
		rulesBlock = "[ACTIVE_RULES_YAML]\n" + activeYAML + "\n[/ACTIVE_RULES_YAML]\n\n"
	}

	promptCore := fmt.Sprintf(
		"You are an expert hackathon judge running a HEAD-TO-HEAD elimination.\n"+
			"Compare PROJECT A vs PROJECT B using ACTIVE_RULES_YAML when present.\n\n"+
			"[PROJECT A — file: %s]\n%s\n[/PROJECT A]\n\n"+
			"[PROJECT B — file: %s]\n%s\n[/PROJECT B]\n\n"+
			"Tasks:\n"+
			"1) Compare the two projects on EXACTLY these FIVE dimensions (same 0–20 rubric as the main audit; say which side is stronger on each):\n"+
			"   Dim 1 — 创新性 (Innovation)\n"+
			"   Dim 2 — 技术实现 (Technical execution)\n"+
			"   Dim 3 — 商业价值 (Business value)\n"+
			"   Dim 4 — 用户体验 (User experience)\n"+
			"   Dim 5 — 落地可行性 (Feasibility)\n"+
			"2) For EACH dimension, write a substantive comparative analysis (like your usual audit style), then state clearly whether PROJECT A or PROJECT B wins that dimension.\n"+
			"3) Overall match rule: the duel winner is the project that wins **at least 3** of the 5 dimensions (majority). You MUST make a decision so one side reaches 3 wins (no 2–2 tie).\n"+
			"4) After the full narrative, output EXACTLY these 6 lines at the very end — no extra text after line 6. Use uppercase A or B only:\n"+
			"DUEL_DIM_1:A_or_B\n"+
			"DUEL_DIM_2:A_or_B\n"+
			"DUEL_DIM_3:A_or_B\n"+
			"DUEL_DIM_4:A_or_B\n"+
			"DUEL_DIM_5:A_or_B\n"+
			"DUEL_WINNER:A_or_B\n"+
			"DUEL_WINNER must be the same letter as the side that won >=3 dimensions.\n",
		fa, string(docA),
		fb, string(docB),
	)

	fullUser := duelLanguageBlock(lang) + rulesBlock + promptCore

	client, modelID, err := newOpenAIJudgeClient(req.Model)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := client.CreateChatCompletion(context.Background(), openai.ChatCompletionRequest{
		Model: modelID,
		Messages: []openai.ChatCompletionMessage{
			{Role: "user", Content: fullUser},
		},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": normalizeLLMErr(err)})
		return
	}
	raw := strings.TrimSpace(resp.Choices[0].Message.Content)
	winner := resolveDuelWinner(raw)
	modelTag := strings.TrimSpace(req.Model)
	if modelTag == "" {
		modelTag = "deepseek"
	}

	aCnt, bCnt := parseDuelDimVotes(raw)
	reasonBody := stripDuelMachineFooter(raw)
	if reasonBody == "" {
		reasonBody = raw
	}

	c.JSON(http.StatusOK, gin.H{
		"winner":             winner,
		"reason":             reasonBody,
		"raw":                raw,
		"model":              modelTag,
		"dimension_winners":  buildDimensionWinnersJSON(raw),
		"dim_vote_counts":    gin.H{"A": aCnt, "B": bCnt},
	})
}
