package executor

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"acp/backend/internal/ports"
)

func TestTonTransferLive(t *testing.T) {
	if !envEnabled("ACP_TEST_TON_LIVE") {
		t.Skip("ACP_TEST_TON_LIVE is not enabled")
	}

	mnemonic := strings.TrimSpace(os.Getenv("ACP_TON_MNEMONIC"))
	if mnemonic == "" {
		t.Skip("ACP_TON_MNEMONIC is required for live TON test")
	}
	toAddr := strings.TrimSpace(os.Getenv("ACP_TEST_TON_LIVE_TO"))
	if toAddr == "" {
		t.Skip("ACP_TEST_TON_LIVE_TO is required for live TON test")
	}
	amountNano := strings.TrimSpace(os.Getenv("ACP_TEST_TON_LIVE_AMOUNT_NANO"))
	if amountNano == "" {
		amountNano = "1000000"
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

	executor, err := NewTONTransferExecutorFromConfigURL(ctx, configURL, mnemonic, explorerBaseURL)
	if err != nil {
		t.Fatalf("NewTONTransferExecutorFromConfigURL() failed: %v", err)
	}

	result, err := executor.Execute(ctx, ports.RunnableStep{
		Input: json.RawMessage(`{
			"to":"` + toAddr + `",
			"amount_nano":"` + amountNano + `",
			"comment":"ACP live transfer test"
		}`),
	})
	if err != nil {
		t.Fatalf("Execute() failed: %v", err)
	}
	if !result.Success {
		t.Fatalf("expected success result")
	}

	var payload map[string]any
	if err := json.Unmarshal(result.Payload, &payload); err != nil {
		t.Fatalf("decode payload failed: %v", err)
	}
	if strings.TrimSpace(asString(payload["tx_hash"])) == "" {
		t.Fatalf("tx_hash is empty")
	}
	if strings.TrimSpace(asString(payload["explorer_url"])) == "" {
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

func asString(value any) string {
	text, _ := value.(string)
	return text
}
