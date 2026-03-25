package main

import (
	"io/fs"
	"path/filepath"
	"regexp"
	"strings"
)

const readmeOnlyMarkerFile = ".aura_readme_only_repo"

// 与 rebuild_backend submissionIDOK 一致：纯数字 id，或 数字_十六进制（如 1774…_8283519bc1c3）
var readmeOnlyWordFileRE = regexp.MustCompile(
	`^((?:[0-9]+_[a-zA-Z0-9]+|[0-9]+))_00_README\.md$`,
)

var skipRepoSubdirs = map[string]bool{
	".git": true, "node_modules": true, "vendor": true, "dist": true,
	"build": true, ".next": true, "target": true, "__pycache__": true,
	".venv": true, "venv": true, "env": true, ".idea": true, ".vscode": true,
}

var codeLikeExts = map[string]bool{
	".go": true, ".ts": true, ".tsx": true, ".js": true, ".jsx": true, ".mjs": true, ".cjs": true,
	".vue": true, ".svelte": true, ".py": true, ".rs": true, ".java": true, ".kt": true,
	".swift": true, ".sol": true, ".move": true, ".cairo": true, ".rb": true, ".php": true,
	".cs": true, ".cpp": true, ".cc": true, ".cxx": true, ".c": true, ".h": true, ".hh": true, ".hpp": true,
	".sql": true, ".scala": true, ".clj": true, ".ex": true, ".exs": true, ".dart": true,
	".r": true, ".R": true, ".wasm": true, ".zig": true,
}

var codeLikeBasenames = map[string]bool{
	"dockerfile":         true,
	"makefile":           true,
	"docker-compose.yml": true,
	"docker-compose.yaml": true,
	"go.mod":             true,
	"cargo.toml":         true,
	"package.json":       true,
	"pyproject.toml":     true,
	"requirements.txt":   true,
	"pom.xml":            true,
	"build.gradle":       true,
	"build.gradle.kts":   true,
	"cmakelists.txt":     true,
}

func readmeOnlyMarkerPath(roundID, submissionID string) string {
	return filepath.Join(submissionRoundDirFor(roundID), submissionID, readmeOnlyMarkerFile)
}

func parseSubmissionIDFromStandardReadmeWordFile(targetFile string) string {
	m := readmeOnlyWordFileRE.FindStringSubmatch(strings.TrimSpace(targetFile))
	if len(m) < 2 {
		return ""
	}
	return m[1]
}

// detectReadmeOnlyRepo 在 git clone 后的目录内扫描：若无任何「源代码或工程配置文件」则视为 README-only 仓库（如仅含 README、LICENSE）。
func detectReadmeOnlyRepo(repoDir string) (readmeOnly bool, summary string) {
	found := false
	_ = filepath.WalkDir(repoDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(repoDir, path)
		if rel == "." {
			return nil
		}
		parts := strings.Split(filepath.ToSlash(rel), "/")
		for _, seg := range parts[:len(parts)-1] {
			if skipRepoSubdirs[strings.ToLower(seg)] {
				if d.IsDir() {
					return fs.SkipDir
				}
				return nil
			}
		}
		if d.IsDir() {
			if skipRepoSubdirs[strings.ToLower(d.Name())] {
				return fs.SkipDir
			}
			return nil
		}
		name := d.Name()
		ext := strings.ToLower(filepath.Ext(name))
		if codeLikeExts[ext] {
			found = true
			return fs.SkipAll
		}
		baseLower := strings.ToLower(name)
		if codeLikeBasenames[baseLower] {
			found = true
			return fs.SkipAll
		}
		return nil
	})
	if found {
		return false, ""
	}
	return true, "克隆目录内未检出源代码文件（如 .go/.ts/.py/.sol 等）或工程配置文件（如 go.mod、package.json、Dockerfile、Makefile 等）；已排除 .git、node_modules、vendor 等目录。"
}
