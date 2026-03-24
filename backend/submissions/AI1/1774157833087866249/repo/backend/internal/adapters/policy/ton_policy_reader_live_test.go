package policy

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"
)

func TestTONPolicyReaderLive(t *testing.T) {
	if !envEnabled("ACP_TEST_TON_LIVE") {
		t.Skip("ACP_TEST_TON_LIVE is not enabled")
	}

	contractAddr := strings.TrimSpace(os.Getenv("ACP_TEST_TON_POLICY_ADDR"))
	if contractAddr == "" {
		t.Skip("ACP_TEST_TON_POLICY_ADDR is required for live policy reader test")
	}

	configURL := strings.TrimSpace(os.Getenv("ACP_TON_LITE_CONFIG_URL"))
	if configURL == "" {
		configURL = "https://ton.org/testnet-global.config.json"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	reader, err := NewTONPolicyReaderFromConfigURL(ctx, configURL)
	if err != nil {
		t.Fatalf("NewTONPolicyReaderFromConfigURL() failed: %v", err)
	}

	policy, err := reader.GetPolicy(ctx, contractAddr)
	if err != nil {
		t.Fatalf("GetPolicy() failed: %v", err)
	}

	if strings.TrimSpace(policy.PolicyContractAddr) == "" {
		t.Fatalf("policy contract address is empty")
	}
	if policy.MaxSpendNano < 0 {
		t.Fatalf("max spend is negative: %d", policy.MaxSpendNano)
	}
	if policy.FetchedAt.IsZero() {
		t.Fatalf("fetched_at is zero")
	}
	if policy.PolicySeqno < 0 {
		t.Fatalf("policy seqno is negative: %d", policy.PolicySeqno)
	}
	for _, hash := range policy.AllowedExecutorHashes {
		if len(strings.TrimSpace(hash)) != 64 {
			t.Fatalf("allowed executor hash length is not 64 hex chars: %q", hash)
		}
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
