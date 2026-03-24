package domain

import (
	"strings"
	"time"
)

const (
	ExecutorTypeHTTP           = "http"
	ExecutorTypeAgent          = "agent"
	ExecutorTypeTonTransaction = "ton_transaction"
)

var knownExecutorTypes = map[string]struct{}{
	ExecutorTypeHTTP:           {},
	ExecutorTypeAgent:          {},
	ExecutorTypeTonTransaction: {},
}

type Budget struct {
	Currency     string
	MaxSpendNano int64
	SpentNano    int64
}

func (b Budget) Validate() error {
	if strings.TrimSpace(b.Currency) == "" {
		return &InvalidInputError{
			Field:  "budget.currency",
			Reason: "must not be empty",
		}
	}
	if b.MaxSpendNano < 0 {
		return &InvariantError{
			Entity: "budget",
			Field:  "max_spend_nano",
			Value:  int(b.MaxSpendNano),
		}
	}
	if b.SpentNano < 0 {
		return &InvariantError{
			Entity: "budget",
			Field:  "spent_nano",
			Value:  int(b.SpentNano),
		}
	}
	return nil
}

type PolicySnapshot struct {
	PolicyContractAddr    string
	RequireApproval       bool
	MaxSpendNano          int64
	AllowedExecutorHashes []string
	FetchedAt             time.Time
	PolicySeqno           int64
}

func (p PolicySnapshot) Validate() error {
	if strings.TrimSpace(p.PolicyContractAddr) == "" {
		return &InvalidInputError{
			Field:  "policy_contract_addr",
			Reason: "must not be empty",
		}
	}
	if p.MaxSpendNano < 0 {
		return &InvariantError{
			Entity: "policy_snapshot",
			Field:  "max_spend_nano",
			Value:  int(p.MaxSpendNano),
		}
	}
	return nil
}

func IsKnownExecutorType(executorType string) bool {
	_, ok := knownExecutorTypes[executorType]
	return ok
}
