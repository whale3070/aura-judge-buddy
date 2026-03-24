package policy

import (
	"context"
	"errors"
	"testing"
	"time"

	"acp/backend/internal/ports"
)

type policyReaderFunc struct {
	fn    func(ctx context.Context, contractAddr string) (ports.OnChainPolicy, error)
	calls int
}

func (m *policyReaderFunc) GetPolicy(ctx context.Context, contractAddr string) (ports.OnChainPolicy, error) {
	m.calls++
	return m.fn(ctx, contractAddr)
}

func TestCachedPolicyReaderReturnsFreshCache(t *testing.T) {
	now := time.Date(2026, 3, 19, 12, 0, 0, 0, time.UTC)
	reader := &policyReaderFunc{
		fn: func(_ context.Context, contractAddr string) (ports.OnChainPolicy, error) {
			return ports.OnChainPolicy{
				PolicyContractAddr: contractAddr,
				MaxSpendNano:       5_000_000_000,
				RequireApproval:    true,
				FetchedAt:          now,
			}, nil
		},
	}

	cache := NewCachedPolicyReader(reader, 30*time.Second, func() time.Time { return now })
	addr := "kQTestPolicy"

	first, err := cache.GetPolicy(context.Background(), addr)
	if err != nil {
		t.Fatalf("first GetPolicy() failed: %v", err)
	}
	second, err := cache.GetPolicy(context.Background(), addr)
	if err != nil {
		t.Fatalf("second GetPolicy() failed: %v", err)
	}

	if reader.calls != 1 {
		t.Fatalf("inner calls=%d, want 1", reader.calls)
	}
	if first.MaxSpendNano != second.MaxSpendNano {
		t.Fatalf("cache value mismatch: first=%d second=%d", first.MaxSpendNano, second.MaxSpendNano)
	}
}

func TestCachedPolicyReaderReturnsStaleOnRefreshError(t *testing.T) {
	now := time.Date(2026, 3, 19, 12, 0, 0, 0, time.UTC)
	call := 0
	reader := &policyReaderFunc{
		fn: func(_ context.Context, contractAddr string) (ports.OnChainPolicy, error) {
			call++
			if call == 1 {
				return ports.OnChainPolicy{
					PolicyContractAddr: contractAddr,
					MaxSpendNano:       5_000_000_000,
					RequireApproval:    true,
					FetchedAt:          now,
				}, nil
			}
			return ports.OnChainPolicy{}, errors.New("network unavailable")
		},
	}

	current := now
	cache := NewCachedPolicyReader(reader, 30*time.Second, func() time.Time { return current })
	addr := "kQTestPolicy"

	first, err := cache.GetPolicy(context.Background(), addr)
	if err != nil {
		t.Fatalf("first GetPolicy() failed: %v", err)
	}

	current = current.Add(31 * time.Second)
	second, err := cache.GetPolicy(context.Background(), addr)
	if err != nil {
		t.Fatalf("second GetPolicy() failed: %v", err)
	}

	if reader.calls != 2 {
		t.Fatalf("inner calls=%d, want 2", reader.calls)
	}
	if second.MaxSpendNano != first.MaxSpendNano {
		t.Fatalf("stale fallback mismatch: got=%d want=%d", second.MaxSpendNano, first.MaxSpendNano)
	}
}

func TestCachedPolicyReaderReturnsErrorWithoutStaleEntry(t *testing.T) {
	reader := &policyReaderFunc{
		fn: func(_ context.Context, _ string) (ports.OnChainPolicy, error) {
			return ports.OnChainPolicy{}, errors.New("network unavailable")
		},
	}
	cache := NewCachedPolicyReader(reader, 30*time.Second, time.Now)

	_, err := cache.GetPolicy(context.Background(), "kQTestPolicy")
	if err == nil {
		t.Fatalf("GetPolicy() error=nil, want failure")
	}
}
