package policy

import (
	"math/big"
	"testing"

	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

func TestParsePolicyExecutionResultCanonicalFlatTuple(t *testing.T) {
	hash := big.NewInt(0)
	hash.SetString("1234abcd", 16)

	result := ton.NewExecutionResult([]any{
		big.NewInt(5_000_000_000),
		big.NewInt(-1),
		hash,
		big.NewInt(9),
	})

	parsed, err := parsePolicyExecutionResult(result)
	if err != nil {
		t.Fatalf("parsePolicyExecutionResult() failed: %v", err)
	}
	if parsed.MaxSpendNano != 5_000_000_000 {
		t.Fatalf("MaxSpendNano=%d, want 5000000000", parsed.MaxSpendNano)
	}
	if !parsed.RequireApproval {
		t.Fatalf("RequireApproval=false, want true")
	}
	if parsed.PolicySeqno != 9 {
		t.Fatalf("PolicySeqno=%d, want 9", parsed.PolicySeqno)
	}
	if len(parsed.AllowedExecutorHashes) != 1 {
		t.Fatalf("AllowedExecutorHashes len=%d, want 1", len(parsed.AllowedExecutorHashes))
	}
	if parsed.AllowedExecutorHashes[0] != "000000000000000000000000000000000000000000000000000000001234abcd" {
		t.Fatalf("AllowedExecutorHashes[0]=%q", parsed.AllowedExecutorHashes[0])
	}
}

func TestParsePolicyExecutionResultCanonicalTupleZeroHashDisablesAllowlist(t *testing.T) {
	innerTuple := []any{
		big.NewInt(5_000_000_000),
		big.NewInt(1),
		big.NewInt(0),
		big.NewInt(0),
	}
	result := ton.NewExecutionResult([]any{innerTuple})

	parsed, err := parsePolicyExecutionResult(result)
	if err != nil {
		t.Fatalf("parsePolicyExecutionResult() failed: %v", err)
	}
	if len(parsed.AllowedExecutorHashes) != 0 {
		t.Fatalf("AllowedExecutorHashes len=%d, want 0", len(parsed.AllowedExecutorHashes))
	}
}

func TestParsePolicyExecutionResultCanonicalSlice(t *testing.T) {
	hash := big.NewInt(0)
	hash.SetString("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 16)
	sliceCell := cell.BeginCell().
		MustStoreUInt(5_000_000_000, 128).
		MustStoreUInt(1, 1).
		MustStoreBigInt(hash, 256).
		MustStoreUInt(7, 32).
		EndCell()
	result := ton.NewExecutionResult([]any{sliceCell.BeginParse()})

	parsed, err := parsePolicyExecutionResult(result)
	if err != nil {
		t.Fatalf("parsePolicyExecutionResult() failed: %v", err)
	}
	if !parsed.RequireApproval {
		t.Fatalf("RequireApproval=false, want true")
	}
	if parsed.PolicySeqno != 7 {
		t.Fatalf("PolicySeqno=%d, want 7", parsed.PolicySeqno)
	}
	if len(parsed.AllowedExecutorHashes) != 1 {
		t.Fatalf("AllowedExecutorHashes len=%d, want 1", len(parsed.AllowedExecutorHashes))
	}
	if parsed.AllowedExecutorHashes[0] != "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" {
		t.Fatalf("AllowedExecutorHashes[0]=%q", parsed.AllowedExecutorHashes[0])
	}
}

func TestParsePolicyExecutionResultLegacyDictCompat(t *testing.T) {
	hash := big.NewInt(0)
	hash.SetString("ff", 16)

	dict := cell.NewDict(256)
	if err := dict.SetIntKey(hash, cell.BeginCell().MustStoreUInt(1, 1).EndCell()); err != nil {
		t.Fatalf("SetIntKey() failed: %v", err)
	}

	result := ton.NewExecutionResult([]any{
		big.NewInt(12345), // legacy owner or unused slot
		big.NewInt(4_000_000_000),
		dict.AsCell(),
		big.NewInt(1),
		big.NewInt(3),
	})

	parsed, err := parsePolicyExecutionResult(result)
	if err != nil {
		t.Fatalf("parsePolicyExecutionResult() failed: %v", err)
	}
	if parsed.MaxSpendNano != 4_000_000_000 {
		t.Fatalf("MaxSpendNano=%d, want 4000000000", parsed.MaxSpendNano)
	}
	if len(parsed.AllowedExecutorHashes) != 1 {
		t.Fatalf("AllowedExecutorHashes len=%d, want 1", len(parsed.AllowedExecutorHashes))
	}
	if parsed.AllowedExecutorHashes[0] != "00000000000000000000000000000000000000000000000000000000000000ff" {
		t.Fatalf("AllowedExecutorHashes[0]=%q", parsed.AllowedExecutorHashes[0])
	}
}
