package executor

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"acp/backend/internal/ports"
)

type tonTransferWallet interface {
	TransferWaitTransaction(
		ctx context.Context,
		to *address.Address,
		amount tlb.Coins,
		comment string,
	) (*tlb.Transaction, *ton.BlockIDExt, error)
}

type TONTransferExecutor struct {
	wallet            tonTransferWallet
	explorerTxBaseURL string
}

type tonTransferInput struct {
	To         string `json:"to"`
	AmountNano string `json:"amount_nano"`
	Comment    string `json:"comment"`
}

func NewTONTransferExecutor(wallet tonTransferWallet, explorerTxBaseURL string) *TONTransferExecutor {
	return &TONTransferExecutor{
		wallet:            wallet,
		explorerTxBaseURL: strings.TrimSpace(explorerTxBaseURL),
	}
}

func NewTONTransferExecutorFromConfigURL(
	ctx context.Context,
	configURL string,
	mnemonic string,
	explorerTxBaseURL string,
) (*TONTransferExecutor, error) {
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
	return NewTONTransferExecutor(w, explorerTxBaseURL), nil
}

func (e *TONTransferExecutor) Execute(ctx context.Context, step ports.RunnableStep) (ports.ExecutionResult, error) {
	if e.wallet == nil {
		return ports.ExecutionResult{}, fmt.Errorf("ton transfer executor wallet is not configured")
	}

	var input tonTransferInput
	if len(step.Input) == 0 {
		return ports.ExecutionResult{}, fmt.Errorf("ton_transaction input is required")
	}
	if err := json.Unmarshal(step.Input, &input); err != nil {
		return ports.ExecutionResult{}, fmt.Errorf("decode ton_transaction input: %w", err)
	}

	toAddr, err := parseTONAddress(input.To)
	if err != nil {
		return ports.ExecutionResult{}, err
	}
	amountNano, err := parsePositiveNano(input.AmountNano)
	if err != nil {
		return ports.ExecutionResult{}, err
	}
	comment := strings.TrimSpace(input.Comment)

	tx, _, err := e.wallet.TransferWaitTransaction(
		ctx,
		toAddr,
		tlb.FromNanoTONU(uint64(amountNano)),
		comment,
	)
	if err != nil {
		return ports.ExecutionResult{}, fmt.Errorf("send ton transfer: %w", err)
	}
	if tx == nil || len(tx.Hash) == 0 {
		return ports.ExecutionResult{}, fmt.Errorf("ton transfer returned empty transaction hash")
	}

	txHash := hex.EncodeToString(tx.Hash)
	payloadMap := map[string]any{
		"tx_hash":      txHash,
		"lt":           strconv.FormatUint(tx.LT, 10),
		"explorer_url": buildExplorerTxURL(e.explorerTxBaseURL, txHash),
		"to":           toAddr.String(),
		"amount_nano":  strconv.FormatInt(amountNano, 10),
	}
	if comment != "" {
		payloadMap["comment"] = comment
	}

	payload, err := json.Marshal(payloadMap)
	if err != nil {
		return ports.ExecutionResult{}, fmt.Errorf("encode ton transfer payload: %w", err)
	}

	return ports.ExecutionResult{
		Success:  true,
		Payload:  payload,
		CostNano: amountNano,
	}, nil
}

func parseTONAddress(raw string) (*address.Address, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil, fmt.Errorf("ton_transaction input.to is required")
	}
	addr, err := address.ParseAddr(value)
	if err != nil {
		return nil, fmt.Errorf("ton_transaction input.to is invalid: %w", err)
	}
	return addr, nil
}

func parsePositiveNano(raw string) (int64, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return 0, fmt.Errorf("ton_transaction input.amount_nano is required")
	}
	amount, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("ton_transaction input.amount_nano must be a base-10 int64 string")
	}
	if amount <= 0 {
		return 0, fmt.Errorf("ton_transaction input.amount_nano must be > 0")
	}
	return amount, nil
}

func buildExplorerTxURL(baseURL string, txHash string) string {
	base := strings.TrimSpace(baseURL)
	if base == "" || strings.TrimSpace(txHash) == "" {
		return ""
	}
	return strings.TrimRight(base, "/") + "/" + txHash
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
