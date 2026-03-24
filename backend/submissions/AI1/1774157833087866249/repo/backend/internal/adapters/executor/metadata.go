package executor

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

func HashEndpoint(endpoint string) string {
	normalized := strings.TrimSpace(strings.ToLower(endpoint))
	if normalized == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(normalized))
	return hex.EncodeToString(sum[:])
}
