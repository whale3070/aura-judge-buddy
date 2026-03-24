package anchor

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"acp/backend/internal/ports"
)

const (
	anchorPayloadMagic = uint64(0x41435000)
)

type anchorWallet interface {
	WalletAddress() *address.Address
	SendWaitTransaction(
		ctx context.Context,
		message *wallet.Message,
	) (*tlb.Transaction, *ton.BlockIDExt, error)
}

type TONAnchorPublisher struct {
	wallet            anchorWallet
	amountNano        int64
	explorerTxBaseURL string
}

func NewTONAnchorPublisher(wallet anchorWallet, amountNano int64, explorerTxBaseURL string) (*TONAnchorPublisher, error) {
	if wallet == nil {
		return nil, fmt.Errorf("anchor wallet is not configured")
	}
	if amountNano <= 0 {
		return nil, fmt.Errorf("anchor amount must be > 0")
	}
	return &TONAnchorPublisher{
		wallet:            wallet,
		amountNano:        amountNano,
		explorerTxBaseURL: strings.TrimSpace(explorerTxBaseURL),
	}, nil
}

func NewTONAnchorPublisherFromConfigURL(
	ctx context.Context,
	configURL string,
	mnemonic string,
	amountNano int64,
	explorerTxBaseURL string,
) (*TONAnchorPublisher, error) {
	tonConfigURL := strings.TrimSpace(configURL)
	if tonConfigURL == "" {
		return nil, fmt.Errorf("ton lite config url is required")
	}
	seed := strings.Fields(strings.TrimSpace(mnemonic))
	if len(seed) == 0 {
		return nil, fmt.Errorf("ton mnemonic is required")
	}

	pool := liteclient.NewConnectionPool()
	if err := pool.AddConnectionsFromConfigUrl(ctx, tonConfigURL); err != nil {
		return nil, fmt.Errorf("connect ton lite servers: %w", err)
	}
	api := ton.NewAPIClient(pool).WithRetry()

	versionCfg, err := resolveTONWalletVersionConfigFromEnv()
	if err != nil {
		return nil, fmt.Errorf("resolve ton wallet profile: %w", err)
	}
	w, err := wallet.FromSeed(api, seed, versionCfg)
	if err != nil {
		return nil, fmt.Errorf("create ton wallet from mnemonic: %w", err)
	}
	return NewTONAnchorPublisher(w, amountNano, explorerTxBaseURL)
}

func (p *TONAnchorPublisher) PublishRunAnchor(ctx context.Context, request ports.PublishRunAnchorRequest) (ports.PublishRunAnchorResult, error) {
	if p.wallet == nil {
		return ports.PublishRunAnchorResult{}, fmt.Errorf("anchor wallet is not configured")
	}
	if strings.TrimSpace(request.RunID) == "" {
		return ports.PublishRunAnchorResult{}, fmt.Errorf("anchor request.run_id is required")
	}
	if len(request.Digest) != sha256.Size {
		return ports.PublishRunAnchorResult{}, fmt.Errorf("anchor request.digest must be 32 bytes")
	}
	if request.EventCount < 0 {
		return ports.PublishRunAnchorResult{}, fmt.Errorf("anchor request.event_count must be >= 0")
	}

	payload, err := buildAnchorPayload(
		request.RunID,
		request.Digest,
		request.EventCount,
		request.CompletedAtUTC.UTC().Unix(),
	)
	if err != nil {
		return ports.PublishRunAnchorResult{}, err
	}
	message := wallet.SimpleMessageAutoBounce(
		p.wallet.WalletAddress(),
		tlb.FromNanoTONU(uint64(p.amountNano)),
		payload,
	)

	tx, _, err := p.wallet.SendWaitTransaction(ctx, message)
	if err != nil {
		return ports.PublishRunAnchorResult{}, fmt.Errorf("publish anchor tx: %w", err)
	}
	if tx == nil || len(tx.Hash) == 0 {
		return ports.PublishRunAnchorResult{}, fmt.Errorf("publish anchor tx returned empty hash")
	}

	txHash := hex.EncodeToString(tx.Hash)
	return ports.PublishRunAnchorResult{
		TxHash:      txHash,
		ExplorerURL: buildExplorerTxURL(p.explorerTxBaseURL, txHash),
	}, nil
}

func buildAnchorPayload(runID string, digest []byte, eventCount int, completedAtUnix int64) (*cell.Cell, error) {
	runIDBytes := []byte(runID)
	if len(runIDBytes) == 0 {
		return nil, fmt.Errorf("anchor payload run_id is empty")
	}
	if len(runIDBytes) > 0xFFFF {
		return nil, fmt.Errorf("anchor payload run_id exceeds uint16 length")
	}

	return cell.BeginCell().
		MustStoreUInt(anchorPayloadMagic, 32).
		MustStoreUInt(uint64(len(runIDBytes)), 16).
		MustStoreSlice(runIDBytes, uint(len(runIDBytes))*8).
		MustStoreSlice(digest, 256).
		MustStoreUInt(uint64(eventCount), 32).
		MustStoreInt(completedAtUnix, 64).
		EndCell(), nil
}

func buildExplorerTxURL(baseURL string, txHash string) string {
	base := strings.TrimSpace(baseURL)
	if base == "" || strings.TrimSpace(txHash) == "" {
		return ""
	}
	return strings.TrimRight(base, "/") + "/" + txHash
}

type MockAnchorPublisher struct {
	ExplorerTxBaseURL string
}

func NewMockAnchorPublisher(explorerTxBaseURL string) *MockAnchorPublisher {
	return &MockAnchorPublisher{
		ExplorerTxBaseURL: strings.TrimSpace(explorerTxBaseURL),
	}
}

func (p *MockAnchorPublisher) PublishRunAnchor(_ context.Context, request ports.PublishRunAnchorRequest) (ports.PublishRunAnchorResult, error) {
	if strings.TrimSpace(request.RunID) == "" {
		return ports.PublishRunAnchorResult{}, fmt.Errorf("anchor request.run_id is required")
	}
	if len(request.Digest) != sha256.Size {
		return ports.PublishRunAnchorResult{}, fmt.Errorf("anchor request.digest must be 32 bytes")
	}
	if request.EventCount < 0 {
		return ports.PublishRunAnchorResult{}, fmt.Errorf("anchor request.event_count must be >= 0")
	}

	seed := strings.Join([]string{
		request.RunID,
		hex.EncodeToString(request.Digest),
		strconv.Itoa(request.EventCount),
		strconv.FormatInt(request.CompletedAtUTC.UTC().Unix(), 10),
	}, "|")
	sum := sha256.Sum256([]byte(seed))
	txHash := hex.EncodeToString(sum[:])
	return ports.PublishRunAnchorResult{
		TxHash:      txHash,
		ExplorerURL: buildExplorerTxURL(p.ExplorerTxBaseURL, txHash),
	}, nil
}

func resolveTONWalletVersionConfigFromEnv() (wallet.VersionConfig, error) {
	version := strings.ToLower(strings.TrimSpace(os.Getenv("ACP_TON_WALLET_VERSION")))
	switch version {
	case "", "v5r1", "v5r1final":
		return wallet.ConfigV5R1Final{
			NetworkGlobalID: int32(getIntEnvDefault("ACP_TON_WALLET_NETWORK_ID", wallet.MainnetGlobalID)),
			Workchain:       int8(getIntEnvDefault("ACP_TON_WALLET_WORKCHAIN", 0)),
		}, nil
	case "v4r2":
		return wallet.V4R2, nil
	default:
		return nil, fmt.Errorf("unsupported ACP_TON_WALLET_VERSION=%q (supported: v5r1, v4r2)", version)
	}
}

func getIntEnvDefault(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
