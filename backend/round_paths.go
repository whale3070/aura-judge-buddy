package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"unicode"
)

// 根目录（环境变量 AURA_WORD_DIR / AURA_RESULT_DIR / AURA_SUBMISSION_DIR）下按轮次隔离：
//   submissions/<round_id>/<submission_id>/
//   word/<round_id>/...
//   judge-result/<round_id>/...
//
// 默认轮次 ID 由 AURA_DEFAULT_ROUND_ID 指定（默认 "default"）；未传 round_id 的 API 使用该轮次。

var (
	wordRoot       string
	resultRoot     string
	submissionRoot string
	defaultRoundID string
)

const maxRoundIDLen = 80

func setRoundRoots(word, result, submission, defRound string) {
	wordRoot = word
	resultRoot = result
	submissionRoot = submission
	defaultRoundID = defRound
}

// sanitizeRoundIDOrDefault 校验 query/form 中的 round_id；空串使用 defaultRoundID。
func sanitizeRoundIDOrDefault(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return defaultRoundID, nil
	}
	return sanitizeRoundIDStrict(s)
}

// sanitizeRoundIDStrict 非空 round_id 的字符集与长度校验（单路径段，防穿越）。
func sanitizeRoundIDStrict(s string) (string, error) {
	if s == "" {
		return "", fmt.Errorf("invalid round_id")
	}
	if len(s) > maxRoundIDLen {
		return "", fmt.Errorf("round_id too long")
	}
	if strings.Contains(s, "..") || strings.ContainsAny(s, `/\`) {
		return "", fmt.Errorf("invalid round_id")
	}
	for _, r := range s {
		if r == '.' || r == '_' || r == '-' {
			continue
		}
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			continue
		}
		return "", fmt.Errorf("invalid round_id")
	}
	return s, nil
}

func defaultRoundIDFromEnv(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "default"
	}
	s, err := sanitizeRoundIDStrict(raw)
	if err != nil {
		return "default"
	}
	return s
}

func wordDirFor(roundID string) string {
	return filepath.Join(wordRoot, roundID)
}

func resultDirFor(roundID string) string {
	return filepath.Join(resultRoot, roundID)
}

func submissionRoundDirFor(roundID string) string {
	return filepath.Join(submissionRoot, roundID)
}

func ensureRoundDirs(roundID string) error {
	for _, d := range []string{
		wordDirFor(roundID),
		resultDirFor(roundID),
		submissionRoundDirFor(roundID),
	} {
		if err := os.MkdirAll(d, 0755); err != nil {
			return err
		}
	}
	return nil
}

// resolveWordDocumentPath 解析 word 目录下的待审文件名到绝对路径。
// 顺序：word/<round_id>/ → word 根（历史扁平）→ word/<defaultRoundID>/，与 mdFilesForSubmission 在 legacy 模式下的扫描范围一致，避免淘汰赛/预览只在单目录查找而找不到已迁移文件。
func resolveWordDocumentPath(roundID, fileName string) (string, error) {
	base := filepath.Base(strings.TrimSpace(fileName))
	if base == "" || base == "." || strings.Contains(base, "..") {
		return "", fmt.Errorf("invalid file name")
	}
	dirs := []string{wordDirFor(roundID)}
	if wordRoot != wordDirFor(roundID) {
		dirs = append(dirs, wordRoot)
	}
	defW := wordDirFor(defaultRoundID)
	if defW != wordDirFor(roundID) && defW != wordRoot {
		dirs = append(dirs, defW)
	}
	for _, dir := range dirs {
		p := filepath.Join(dir, base)
		st, err := os.Stat(p)
		if err == nil && !st.IsDir() {
			return p, nil
		}
	}
	return "", os.ErrNotExist
}

// listRoundIDs 返回 submission 根下视为「轮次」的子目录名，按字典序。
// 若某子目录下直接存在 submission.json，则视为旧版扁平布局的提交目录（纯 submission），不算轮次。
func listRoundIDs() ([]string, error) {
	entries, err := os.ReadDir(submissionRoot)
	if err != nil {
		return nil, err
	}
	var ids []string
	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		name := e.Name()
		if _, err := sanitizeRoundIDStrict(name); err != nil {
			continue
		}
		// 扁平旧数据：submissions/<submission_id>/submission.json
		if st, err := os.Stat(filepath.Join(submissionRoot, name, "submission.json")); err == nil && !st.IsDir() {
			continue
		}
		ids = append(ids, name)
	}
	sort.Strings(ids)
	return ids, nil
}

// countSubmissionsInRound 统计 submissions/<round_id>/<submission_id>/submission.json 数量。
func countSubmissionsInRound(roundID string) int {
	subDir := submissionRoundDirFor(roundID)
	entries, err := os.ReadDir(subDir)
	if err != nil {
		return 0
	}
	n := 0
	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		meta := filepath.Join(subDir, e.Name(), "submission.json")
		if st, err := os.Stat(meta); err == nil && !st.IsDir() {
			n++
		}
	}
	return n
}

// countDistinctAuditedWordFiles 统计 judge-result/<round_id>/ 下 JSON 中不重复的 file_name 数量。
func countDistinctAuditedWordFiles(roundID string) int {
	seen := make(map[string]struct{})
	dir := resultDirFor(roundID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			continue
		}
		var partial struct {
			FileName string `json:"file_name"`
		}
		if json.Unmarshal(data, &partial) != nil {
			continue
		}
		fn := strings.TrimSpace(partial.FileName)
		if fn == "" {
			continue
		}
		seen[fn] = struct{}{}
	}
	return len(seen)
}
