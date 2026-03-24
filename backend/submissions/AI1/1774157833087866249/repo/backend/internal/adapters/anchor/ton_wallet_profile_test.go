package anchor

import (
	"testing"

	"github.com/xssnick/tonutils-go/ton/wallet"
)

func TestResolveTONWalletVersionConfigFromEnvDefault(t *testing.T) {
	t.Setenv("ACP_TON_WALLET_VERSION", "")
	t.Setenv("ACP_TON_WALLET_NETWORK_ID", "")
	t.Setenv("ACP_TON_WALLET_WORKCHAIN", "")

	cfg, err := resolveTONWalletVersionConfigFromEnv()
	if err != nil {
		t.Fatalf("resolveTONWalletVersionConfigFromEnv() error = %v", err)
	}

	v5Cfg, ok := cfg.(wallet.ConfigV5R1Final)
	if !ok {
		t.Fatalf("expected wallet.ConfigV5R1Final, got %T", cfg)
	}
	if v5Cfg.NetworkGlobalID != wallet.MainnetGlobalID {
		t.Fatalf("unexpected default NetworkGlobalID: got %d, want %d", v5Cfg.NetworkGlobalID, wallet.MainnetGlobalID)
	}
	if v5Cfg.Workchain != 0 {
		t.Fatalf("unexpected default Workchain: got %d, want 0", v5Cfg.Workchain)
	}
}

func TestResolveTONWalletVersionConfigFromEnvV4R2(t *testing.T) {
	t.Setenv("ACP_TON_WALLET_VERSION", "v4r2")

	cfg, err := resolveTONWalletVersionConfigFromEnv()
	if err != nil {
		t.Fatalf("resolveTONWalletVersionConfigFromEnv() error = %v", err)
	}

	versionCfg, ok := cfg.(wallet.Version)
	if !ok {
		t.Fatalf("expected wallet.Version, got %T", cfg)
	}
	if versionCfg != wallet.V4R2 {
		t.Fatalf("unexpected wallet version: got %v, want %v", versionCfg, wallet.V4R2)
	}
}

func TestResolveTONWalletVersionConfigFromEnvInvalid(t *testing.T) {
	t.Setenv("ACP_TON_WALLET_VERSION", "unknown")

	if _, err := resolveTONWalletVersionConfigFromEnv(); err == nil {
		t.Fatalf("expected error for unsupported wallet version")
	}
}
