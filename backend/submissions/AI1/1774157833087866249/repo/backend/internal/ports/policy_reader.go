package ports

import (
	"context"
	"time"
)

type OnChainPolicy struct {
	PolicyContractAddr    string
	MaxSpendNano          int64
	RequireApproval       bool
	AllowedExecutorHashes []string
	FetchedAt             time.Time
	PolicySeqno           int64
}

type PolicyReader interface {
	GetPolicy(ctx context.Context, contractAddr string) (OnChainPolicy, error)
}
