package ports

import (
	"context"
	"encoding/json"
	"time"

	"acp/backend/internal/domain"
)

type RunStepInput struct {
	ID                     string
	ClientStepID           string
	Name                   string
	ExecutorType           string
	Input                  json.RawMessage
	MaxRetries             int
	IsFinancial            bool
	DependsOnClientStepIDs []string
}

type CreateRunWithPlanAndLedgerParams struct {
	RunID              string
	AgentID            string
	PolicyContractAddr string
	CreatedAt          time.Time
	StartedAt          time.Time
	BudgetID           string
	Budget             domain.Budget
	PolicySnapshot     domain.PolicySnapshot
	Steps              []RunStepInput
	RunCreatedEventID  string
	RunStartedEventID  string
	Idempotency        *IdempotencyRecord
}

type IdempotencyRecord struct {
	Scope          string
	IdempotencyKey string
	RequestHash    string
	CreatedAt      time.Time
}

type GetRunByIDResult struct {
	ID                 string
	AgentID            string
	Status             domain.RunStatus
	PolicyContractAddr string
	CreatedAt          time.Time
	StartedAt          *time.Time
	FinishedAt         *time.Time
	Budget             domain.Budget
	PolicySnapshot     *domain.PolicySnapshot
	AnchorTxHash       *string
	AnchorDigest       *string
	AnchoredAt         *time.Time
}

type StepRecord struct {
	ID           string
	RunID        string
	ClientStepID string
	Name         string
	ExecutorType string
	Status       domain.StepStatus
	Attempt      int
	MaxRetries   int
	IsFinancial  bool
	Input        json.RawMessage
	Output       json.RawMessage
	CreatedAt    time.Time
	StartedAt    *time.Time
	FinishedAt   *time.Time
}

type ResolveApprovalApproveParams struct {
	ApprovalID              string
	ResolvedAt              time.Time
	ApprovalReceivedEventID string
}

type ResolveApprovalRejectParams struct {
	ApprovalID              string
	ResolvedAt              time.Time
	ApprovalReceivedEventID string
	StepFailedEventID       string
	RunFailedEventID        string
}

type ApprovalRecord struct {
	ID     string
	StepID string
	Status domain.ApprovalStatus
}

type RunsRepository interface {
	CreateRunWithPlanAndLedger(ctx context.Context, params CreateRunWithPlanAndLedgerParams) (string, error)
	GetRunByID(ctx context.Context, runID string) (GetRunByIDResult, error)
	ListRunSteps(ctx context.Context, runID string) ([]StepRecord, error)
	GetStepByID(ctx context.Context, stepID string) (StepRecord, error)
	ListRunEventsOrdered(ctx context.Context, runID string, limit int) ([]domain.Event, error)
	ResolveApprovalApprove(ctx context.Context, params ResolveApprovalApproveParams) (ApprovalRecord, error)
	ResolveApprovalReject(ctx context.Context, params ResolveApprovalRejectParams) (ApprovalRecord, error)
	CancelRunWithLedger(ctx context.Context, runID string, eventID string, cancelledAt time.Time) error
	GetIdempotency(ctx context.Context, scope, key string) (*IdempotencyLookupResult, error)
}

type IdempotencyLookupResult struct {
	RequestHash string
	RunID       string
}
