package policy

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"acp/backend/internal/ports"
)

const defaultPolicyCacheTTL = 30 * time.Second

type CachedPolicyReader struct {
	inner   ports.PolicyReader
	ttl     time.Duration
	now     func() time.Time
	mu      sync.RWMutex
	entries map[string]cachedPolicy
}

type cachedPolicy struct {
	policy    ports.OnChainPolicy
	fetchedAt time.Time
}

func NewCachedPolicyReader(inner ports.PolicyReader, ttl time.Duration, now func() time.Time) *CachedPolicyReader {
	if ttl <= 0 {
		ttl = defaultPolicyCacheTTL
	}
	if now == nil {
		now = func() time.Time { return time.Now().UTC() }
	}
	return &CachedPolicyReader{
		inner:   inner,
		ttl:     ttl,
		now:     now,
		entries: map[string]cachedPolicy{},
	}
}

func (r *CachedPolicyReader) GetPolicy(ctx context.Context, contractAddr string) (ports.OnChainPolicy, error) {
	if r.inner == nil {
		return ports.OnChainPolicy{}, fmt.Errorf("policy reader is not configured")
	}

	key := strings.TrimSpace(contractAddr)
	now := r.now().UTC()

	if policy, ok := r.getFresh(key, now); ok {
		return policy, nil
	}

	fresh, err := r.inner.GetPolicy(ctx, key)
	if err != nil {
		if stale, ok := r.getAny(key); ok {
			return stale, nil
		}
		return ports.OnChainPolicy{}, err
	}

	fresh = clonePolicy(fresh)
	if fresh.FetchedAt.IsZero() {
		fresh.FetchedAt = now
	}

	r.mu.Lock()
	r.entries[key] = cachedPolicy{
		policy:    fresh,
		fetchedAt: now,
	}
	r.mu.Unlock()
	return fresh, nil
}

func (r *CachedPolicyReader) getFresh(key string, now time.Time) (ports.OnChainPolicy, bool) {
	r.mu.RLock()
	entry, ok := r.entries[key]
	r.mu.RUnlock()
	if !ok {
		return ports.OnChainPolicy{}, false
	}
	if now.Sub(entry.fetchedAt) > r.ttl {
		return ports.OnChainPolicy{}, false
	}
	return clonePolicy(entry.policy), true
}

func (r *CachedPolicyReader) getAny(key string) (ports.OnChainPolicy, bool) {
	r.mu.RLock()
	entry, ok := r.entries[key]
	r.mu.RUnlock()
	if !ok {
		return ports.OnChainPolicy{}, false
	}
	return clonePolicy(entry.policy), true
}

func clonePolicy(policy ports.OnChainPolicy) ports.OnChainPolicy {
	copyValue := policy
	copyValue.AllowedExecutorHashes = append([]string(nil), policy.AllowedExecutorHashes...)
	return copyValue
}
