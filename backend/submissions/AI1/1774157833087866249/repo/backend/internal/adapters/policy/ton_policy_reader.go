package policy

import (
	"context"
	"fmt"
	"math/big"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/ton"

	"acp/backend/internal/ports"
)

const (
	canonicalMethodGetPolicy     = "getPolicy"
	canonicalMethodGetPolicyTVM  = "get_policy"
	zeroExecutorHashLowercaseHex = "0000000000000000000000000000000000000000000000000000000000000000"
)

type TONPolicyReader struct {
	api ton.APIClientWrapped
}

func NewTONPolicyReader(api ton.APIClientWrapped) *TONPolicyReader {
	return &TONPolicyReader{api: api}
}

func NewTONPolicyReaderFromConfigURL(ctx context.Context, configURL string) (*TONPolicyReader, error) {
	pool := liteclient.NewConnectionPool()
	if err := pool.AddConnectionsFromConfigUrl(ctx, strings.TrimSpace(configURL)); err != nil {
		return nil, fmt.Errorf("connect ton lite servers: %w", err)
	}
	return &TONPolicyReader{api: ton.NewAPIClient(pool).WithRetry()}, nil
}

func (r *TONPolicyReader) GetPolicy(ctx context.Context, contractAddr string) (ports.OnChainPolicy, error) {
	if r.api == nil {
		return ports.OnChainPolicy{}, fmt.Errorf("ton api client is not configured")
	}

	addr, err := address.ParseAddr(strings.TrimSpace(contractAddr))
	if err != nil {
		return ports.OnChainPolicy{}, fmt.Errorf("parse policy contract address: %w", err)
	}

	block, err := r.api.CurrentMasterchainInfo(ctx)
	if err != nil {
		return ports.OnChainPolicy{}, fmt.Errorf("load masterchain info: %w", err)
	}

	execResult, methodUsed, err := r.runGetPolicyMethod(ctx, block, addr)
	if err != nil {
		return ports.OnChainPolicy{}, err
	}

	parsed, err := parsePolicyExecutionResult(execResult)
	if err != nil {
		return ports.OnChainPolicy{}, fmt.Errorf("decode %s result: %w", methodUsed, err)
	}

	return ports.OnChainPolicy{
		PolicyContractAddr:    addr.String(),
		MaxSpendNano:          parsed.MaxSpendNano,
		RequireApproval:       parsed.RequireApproval,
		AllowedExecutorHashes: parsed.AllowedExecutorHashes,
		FetchedAt:             time.Now().UTC(),
		PolicySeqno:           parsed.PolicySeqno,
	}, nil
}

func (r *TONPolicyReader) runGetPolicyMethod(
	ctx context.Context,
	block *ton.BlockIDExt,
	addr *address.Address,
) (*ton.ExecutionResult, string, error) {
	methods := []string{canonicalMethodGetPolicy, canonicalMethodGetPolicyTVM}
	var runErrors []string

	for _, method := range methods {
		execResult, err := r.api.RunGetMethod(ctx, block, addr, method)
		if err == nil {
			return execResult, method, nil
		}
		runErrors = append(runErrors, fmt.Sprintf("%s: %v", method, err))
	}

	return nil, "", fmt.Errorf(
		"run %s/%s: %s",
		canonicalMethodGetPolicy,
		canonicalMethodGetPolicyTVM,
		strings.Join(runErrors, "; "),
	)
}

type parsedPolicyResult struct {
	MaxSpendNano          int64
	RequireApproval       bool
	AllowedExecutorHashes []string
	PolicySeqno           int64
}

func parsePolicyExecutionResult(result *ton.ExecutionResult) (parsedPolicyResult, error) {
	if result == nil {
		return parsedPolicyResult{}, fmt.Errorf("empty execution result")
	}

	canonicalTuple, canonicalTupleErr := parseCanonicalFlatOrTupleResult(result)
	if canonicalTupleErr == nil {
		return canonicalTuple, nil
	}

	canonicalSlice, canonicalSliceErr := parseCanonicalSliceResult(result)
	if canonicalSliceErr == nil {
		return canonicalSlice, nil
	}

	legacy, legacyErr := parseLegacyDictCellResult(result)
	if legacyErr == nil {
		return legacy, nil
	}

	return parsedPolicyResult{}, fmt.Errorf(
		"canonical tuple parse failed: %v; canonical slice parse failed: %v; legacy compat parse failed: %v",
		canonicalTupleErr,
		canonicalSliceErr,
		legacyErr,
	)
}

func parseCanonicalFlatOrTupleResult(result *ton.ExecutionResult) (parsedPolicyResult, error) {
	values, err := extractCanonicalStackValues(result.AsTuple())
	if err != nil {
		return parsedPolicyResult{}, err
	}

	maxSpend, ok := values[0].(*big.Int)
	if !ok {
		return parsedPolicyResult{}, fmt.Errorf("maxSpendNano is not integer")
	}
	requireApproval, ok := values[1].(*big.Int)
	if !ok {
		return parsedPolicyResult{}, fmt.Errorf("requireApproval is not integer")
	}
	allowedExecutorHash, ok := values[2].(*big.Int)
	if !ok {
		return parsedPolicyResult{}, fmt.Errorf("allowedExecutorHash is not integer")
	}
	seqno, ok := values[3].(*big.Int)
	if !ok {
		return parsedPolicyResult{}, fmt.Errorf("seqno is not integer")
	}

	return buildCanonicalResult(maxSpend, requireApproval, allowedExecutorHash, seqno)
}

func extractCanonicalStackValues(values []any) ([]any, error) {
	if len(values) == 0 {
		return nil, fmt.Errorf("empty stack")
	}

	if len(values) == 1 {
		if tuple, ok := values[0].([]any); ok {
			values = tuple
		}
	}

	if len(values) < 4 {
		return nil, fmt.Errorf("expected 4 stack values, got %d", len(values))
	}
	return values[:4], nil
}

func parseCanonicalSliceResult(result *ton.ExecutionResult) (parsedPolicyResult, error) {
	slice, err := result.Slice(0)
	if err != nil {
		return parsedPolicyResult{}, err
	}

	maxSpend, err := slice.LoadBigUInt(128)
	if err != nil {
		return parsedPolicyResult{}, fmt.Errorf("read maxSpendNano from slice: %w", err)
	}

	requireApprovalBit, err := slice.LoadUInt(1)
	if err != nil {
		return parsedPolicyResult{}, fmt.Errorf("read requireApproval from slice: %w", err)
	}
	requireApproval := big.NewInt(0)
	requireApproval.SetUint64(requireApprovalBit)

	allowedExecutorHash, err := slice.LoadBigUInt(256)
	if err != nil {
		return parsedPolicyResult{}, fmt.Errorf("read allowedExecutorHash from slice: %w", err)
	}

	seqnoRaw, err := slice.LoadUInt(32)
	if err != nil {
		return parsedPolicyResult{}, fmt.Errorf("read seqno from slice: %w", err)
	}
	seqno := big.NewInt(0)
	seqno.SetUint64(seqnoRaw)

	return buildCanonicalResult(maxSpend, requireApproval, allowedExecutorHash, seqno)
}

func buildCanonicalResult(
	maxSpendNano *big.Int,
	requireApprovalInt *big.Int,
	allowedExecutorHash *big.Int,
	seqno *big.Int,
) (parsedPolicyResult, error) {
	maxSpendNanoInt64, err := toNonNegativeInt64(maxSpendNano, "maxSpendNano")
	if err != nil {
		return parsedPolicyResult{}, err
	}
	seqnoInt64, err := toNonNegativeInt64(seqno, "seqno")
	if err != nil {
		return parsedPolicyResult{}, err
	}

	hash, err := normalizeHashBigInt(allowedExecutorHash)
	if err != nil {
		return parsedPolicyResult{}, fmt.Errorf("normalize allowedExecutorHash: %w", err)
	}

	allowedHashes := []string{}
	if hash != zeroExecutorHashLowercaseHex {
		allowedHashes = []string{hash}
	}

	return parsedPolicyResult{
		MaxSpendNano:          maxSpendNanoInt64,
		RequireApproval:       toBool(requireApprovalInt),
		AllowedExecutorHashes: allowedHashes,
		PolicySeqno:           seqnoInt64,
	}, nil
}

func parseLegacyDictCellResult(result *ton.ExecutionResult) (parsedPolicyResult, error) {
	// Legacy compatibility path for pre-pivot contracts.
	maxSpend, err := readInt(result, 1, 0)
	if err != nil {
		return parsedPolicyResult{}, fmt.Errorf("legacy max_spend_nano: %w", err)
	}
	requireApproval, err := readBool(result, 3, 2)
	if err != nil {
		return parsedPolicyResult{}, fmt.Errorf("legacy require_approval: %w", err)
	}
	allowedHashes, err := readLegacyAllowedExecutorHashes(result, 2)
	if err != nil {
		return parsedPolicyResult{}, fmt.Errorf("legacy allowlist: %w", err)
	}

	seqno := int64(0)
	if value, seqErr := readInt(result, 4); seqErr == nil {
		seqno = value
	}

	return parsedPolicyResult{
		MaxSpendNano:          maxSpend,
		RequireApproval:       requireApproval,
		AllowedExecutorHashes: allowedHashes,
		PolicySeqno:           seqno,
	}, nil
}

func readLegacyAllowedExecutorHashes(result *ton.ExecutionResult, index uint) ([]string, error) {
	policyCell, err := result.Cell(index)
	if err != nil || policyCell == nil {
		return nil, fmt.Errorf("cell[%d] not found", index)
	}

	dict := policyCell.AsDict(256)
	if dict == nil || dict.IsEmpty() {
		return []string{}, nil
	}

	items, err := dict.LoadAll()
	if err != nil {
		return nil, err
	}

	hashSet := map[string]struct{}{}
	for _, item := range items {
		if item.Key == nil {
			continue
		}
		keyInt, keyErr := item.Key.LoadBigUInt(256)
		if keyErr != nil {
			return nil, keyErr
		}

		allowed := true
		if item.Value != nil {
			flag, flagErr := item.Value.LoadBoolBit()
			if flagErr == nil {
				allowed = flag
			}
		}
		if !allowed {
			continue
		}

		normalized, normalizeErr := normalizeHashBigInt(keyInt)
		if normalizeErr != nil {
			return nil, normalizeErr
		}
		hashSet[normalized] = struct{}{}
	}

	hashes := make([]string, 0, len(hashSet))
	for hash := range hashSet {
		hashes = append(hashes, hash)
	}
	return normalizeHashList(hashes), nil
}

func readBool(result *ton.ExecutionResult, indexes ...uint) (bool, error) {
	value, err := readBigInt(result, indexes...)
	if err != nil {
		return false, err
	}
	return toBool(value), nil
}

func readBigInt(result *ton.ExecutionResult, indexes ...uint) (*big.Int, error) {
	if result == nil {
		return nil, fmt.Errorf("nil result")
	}
	for _, idx := range indexes {
		value, err := result.Int(idx)
		if err != nil {
			continue
		}
		return value, nil
	}
	return nil, fmt.Errorf("int value not found at expected indexes")
}

func readInt(result *ton.ExecutionResult, indexes ...uint) (int64, error) {
	value, err := readBigInt(result, indexes...)
	if err != nil {
		return 0, err
	}
	return toInt64(value)
}

func toNonNegativeInt64(value *big.Int, field string) (int64, error) {
	if value == nil {
		return 0, fmt.Errorf("%s is nil", field)
	}
	if value.Sign() < 0 {
		return 0, fmt.Errorf("%s is negative", field)
	}
	if !value.IsInt64() {
		return 0, fmt.Errorf("%s overflows int64", field)
	}
	return value.Int64(), nil
}

func toInt64(value *big.Int) (int64, error) {
	if value == nil {
		return 0, fmt.Errorf("nil integer")
	}
	if !value.IsInt64() {
		return 0, fmt.Errorf("integer overflow")
	}
	return value.Int64(), nil
}

func toBool(value *big.Int) bool {
	if value == nil {
		return false
	}
	return value.Sign() != 0
}

func normalizeHashBigInt(value *big.Int) (string, error) {
	if value == nil {
		return "", fmt.Errorf("nil hash")
	}
	if value.Sign() < 0 {
		return "", fmt.Errorf("negative hash")
	}
	if value.BitLen() > 256 {
		return "", fmt.Errorf("hash overflows uint256")
	}
	hash := fmt.Sprintf("%064x", value)
	return strings.ToLower(hash), nil
}

func normalizeHashString(value string) string {
	hash := strings.TrimSpace(strings.ToLower(value))
	if len(hash) == 64 {
		return hash
	}
	if hash == "" {
		return ""
	}
	if len(hash) < 64 {
		return strings.Repeat("0", 64-len(hash)) + hash
	}
	return hash
}

func normalizeHashList(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	set := map[string]struct{}{}
	for _, value := range values {
		normalized := normalizeHashString(value)
		if normalized == "" {
			continue
		}
		set[normalized] = struct{}{}
	}
	if len(set) == 0 {
		return []string{}
	}
	normalized := make([]string, 0, len(set))
	for hash := range set {
		normalized = append(normalized, hash)
	}
	sort.Strings(normalized)
	if slices.Equal(normalized, []string{zeroExecutorHashLowercaseHex}) {
		return []string{}
	}
	return normalized
}
