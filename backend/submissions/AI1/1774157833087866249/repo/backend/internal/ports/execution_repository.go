package ports

import (
	"context"
	"encoding/json"
	"time"

	"acp/backend/internal/domain"
)

type RunnableStep struct {
	StepID             string
	RunID              string
	Status             string
	Name               string
	ExecutorType       string
	PolicyContractAddr string
	Input              json.RawMessage
	Attempt            int
	MaxRetries         int
	IsFinancial        bool
	BudgetSpentNano    int64
	ApprovalResolved   bool
}

type ClaimNextRunnableStepParams struct {
	Now                time.Time
	StepStartedEventID string
}

type PutStepOnApprovalHoldParams struct {
	RunID                    string
	StepID                   string
	ApprovalID               string
	RequestedAt              time.Time
	ApprovalRequestedEventID string
}

type CompleteStepParams struct {
	RunID                string
	StepID               string
	FinishedAt           time.Time
	Output               json.RawMessage
	CostNano             int64
	MaxSpendNano         int64
	StepCompletedEventID string
	RunCompletedEventID  string
}

type RetryStepParams struct {
	RunID              string
	StepID             string
	FailedAt           time.Time
	ErrorMessage       string
	StepFailedEventID  string
	StepRetriedEventID string
}

type FailStepAndRunParams struct {
	RunID             string
	StepID            string
	FailedAt          time.Time
	ErrorMessage      string
	StepFailedEventID string
	RunFailedEventID  string
}

type RecoverStaleRunningStepsParams struct {
	Now   time.Time
	Limit int
}

type ApplyPolicySnapshotParams struct {
	RunID                 string
	PolicyContractAddr    string
	MaxSpendNano          int64
	RequireApproval       bool
	AllowedExecutorHashes []string
	FetchedAt             time.Time
	PolicySeqno           int64
}

type CompletedRunForAnchor struct {
	RunID      string
	FinishedAt time.Time
}

type MarkRunAnchoredWithEventParams struct {
	RunID              string
	AnchorTxHash       string
	AnchorDigest       string
	AnchoredAt         time.Time
	RunAnchoredEventID string
	ExplorerURL        string
}

type ExecutionRepository interface {
	ClaimNextRunnableStep(ctx context.Context, params ClaimNextRunnableStepParams) (*RunnableStep, error)
	ApplyPolicySnapshot(ctx context.Context, params ApplyPolicySnapshotParams) error
	PutStepOnApprovalHold(ctx context.Context, params PutStepOnApprovalHoldParams) error
	CompleteStep(ctx context.Context, params CompleteStepParams) error
	RetryStep(ctx context.Context, params RetryStepParams) error
	FailStepAndRun(ctx context.Context, params FailStepAndRunParams) error
	RecoverStaleRunningSteps(ctx context.Context, params RecoverStaleRunningStepsParams) (int, error)
	ListCompletedUnanchoredRuns(ctx context.Context, limit int) ([]CompletedRunForAnchor, error)
	ListRunEventsForAnchor(ctx context.Context, runID string) ([]domain.Event, error)
	MarkRunAnchoredWithEvent(ctx context.Context, params MarkRunAnchoredWithEventParams) error
}

type ExecutionResult struct {
	Success      bool
	Payload      json.RawMessage
	CostNano     int64
	ErrorMessage string
}

type StepExecutor interface {
	Execute(ctx context.Context, step RunnableStep) (ExecutionResult, error)
}

type ExecutorMetadata struct {
	Endpoint     string
	EndpointHash string
}

type ExecutorRegistry interface {
	Get(executorType string) (StepExecutor, bool)
	Metadata(executorType string) (ExecutorMetadata, bool)
}

type ExecutorRegistration struct {
	Executor StepExecutor
	Metadata ExecutorMetadata
}

type ExecutorRegistryMap map[string]ExecutorRegistration

func (m ExecutorRegistryMap) Get(executorType string) (StepExecutor, bool) {
	entry, ok := m[executorType]
	if !ok {
		return nil, false
	}
	return entry.Executor, true
}

func (m ExecutorRegistryMap) Metadata(executorType string) (ExecutorMetadata, bool) {
	entry, ok := m[executorType]
	if !ok {
		return ExecutorMetadata{}, false
	}
	return entry.Metadata, true
}
