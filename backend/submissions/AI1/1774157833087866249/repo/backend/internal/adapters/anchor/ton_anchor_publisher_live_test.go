package anchor

import (
	"context"
	"encoding/hex"
	"os"
	"strings"
	"testing"
	"time"

	"acp/backend/internal/ports"
)

func TestRunAnchorLive(t *testing.T) {
	if !envEnabled("ACP_TEST_TON_LIVE") {
		t.Skip("ACP_TEST_TON_LIVE is not enabled")
	}

	mnemonic := strings.TrimSpace(os.Getenv("ACP_TON_MNEMONIC"))
	if mnemonic == "" {
		t.Skip("ACP_TON_MNEMONIC is required for live TON anchor test")
	}
	configURL := strings.TrimSpace(os.Getenv("ACP_TON_LITE_CONFIG_URL"))
	if configURL == "" {
		configURL = "https://ton.org/testnet-global.config.json"
	}
	explorerBaseURL := strings.TrimSpace(os.Getenv("ACP_TON_EXPLORER_TX_BASE_URL"))
	if explorerBaseURL == "" {
		explorerBaseURL = "https://testnet.tonscan.org/tx"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	publisher, err := NewTONAnchorPublisherFromConfigURL(
		ctx,
		configURL,
		mnemonic,
		1_000_000,
		explorerBaseURL,
	)
	if err != nil {
		t.Fatalf("NewTONAnchorPublisherFromConfigURL() failed: %v", err)
	}

	digest := make([]byte, 32)
	copy(digest, []byte("acp-anchor-live-test-digest-000001"))
	result, err := publisher.PublishRunAnchor(ctx, ports.PublishRunAnchorRequest{
		RunID:          "run-live-anchor-test",
		Digest:         digest,
		DigestHex:      hex.EncodeToString(digest),
		EventCount:     3,
		CompletedAtUTC: time.Now().UTC(),
	})
	if err != nil {
		t.Fatalf("PublishRunAnchor() failed: %v", err)
	}
	if strings.TrimSpace(result.TxHash) == "" {
		t.Fatalf("tx_hash is empty")
	}
	if strings.TrimSpace(result.ExplorerURL) == "" {
		t.Fatalf("explorer_url is empty")
	}
}

func envEnabled(key string) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(key))) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}
