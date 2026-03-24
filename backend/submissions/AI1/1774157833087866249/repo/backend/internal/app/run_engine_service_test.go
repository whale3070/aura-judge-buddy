package app

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"acp/backend/internal/domain"
	"acp/backend/internal/ports"
)

type executionRepoMock struct {
	claimFn         func(ctx context.Context, params ports.ClaimNextRunnableStepParams) (*ports.RunnableStep, error)
	applyPolicyFn   func(ctx context.Context, params ports.ApplyPolicySnapshotParams) error
	holdFn          func(ctx context.Context, params ports.PutStepOnApprovalHoldParams) error
	completeFn      func(ctx context.Context, params ports.CompleteStepParams) error
	retryFn         func(ctx context.Context, params ports.RetryStepParams) error
	failFn          func(ctx context.Context, params ports.FailStepAndRunParams) error
	recoverFn       func(ctx context.Context, params ports.RecoverStaleRunningStepsParams) (int, error)
	listRunsFn      func(ctx context.Context, limit int) ([]ports.CompletedRunForAnchor, error)
	listEventsFn    func(ctx context.Context, runID string) ([]domain.Event, error)
	markAnchorFn    func(ctx context.Context, params ports.MarkRunAnchoredWithEventParams) error
	holdCalls       int
	completeCalls   int
	retryCalls      int
	failCalls       int
	applyPolicyCall int
	markAnchorCalls int
}

func (m *executionRepoMock) ClaimNextRunnableStep(ctx context.Context, params ports.ClaimNextRunnableStepParams) (*ports.RunnableStep, error) {
	if m.claimFn == nil {
		return nil, nil
	}
	return m.claimFn(ctx, params)
}

func (m *executionRepoMock) ApplyPolicySnapshot(ctx context.Context, params ports.ApplyPolicySnapshotParams) error {
	m.applyPolicyCall++
	if m.applyPolicyFn == nil {
		return nil
	}
	return m.applyPolicyFn(ctx, params)
}

func (m *executionRepoMock) PutStepOnApprovalHold(ctx context.Context, params ports.PutStepOnApprovalHoldParams) error {
	m.holdCalls++
	if m.holdFn == nil {
		return nil
	}
	return m.holdFn(ctx, params)
}

func (m *executionRepoMock) CompleteStep(ctx context.Context, params ports.CompleteStepParams) error {
	m.completeCalls++
	if m.completeFn == nil {
		return nil
	}
	return m.completeFn(ctx, params)
}

func (m *executionRepoMock) RetryStep(ctx context.Context, params ports.RetryStepParams) error {
	m.retryCalls++
	if m.retryFn == nil {
		return nil
	}
	return m.retryFn(ctx, params)
}

func (m *executionRepoMock) FailStepAndRun(ctx context.Context, params ports.FailStepAndRunParams) error {
	m.failCalls++
	if m.failFn == nil {
		return nil
	}
	return m.failFn(ctx, params)
}

func (m *executionRepoMock) RecoverStaleRunningSteps(ctx context.Context, params ports.RecoverStaleRunningStepsParams) (int, error) {
	if m.recoverFn == nil {
		return 0, nil
	}
	return m.recoverFn(ctx, params)
}

func (m *executionRepoMock) ListCompletedUnanchoredRuns(ctx context.Context, limit int) ([]ports.CompletedRunForAnchor, error) {
	if m.listRunsFn == nil {
		return nil, nil
	}
	return m.listRunsFn(ctx, limit)
}

func (m *executionRepoMock) ListRunEventsForAnchor(ctx context.Context, runID string) ([]domain.Event, error) {
	if m.listEventsFn == nil {
		return nil, nil
	}
	return m.listEventsFn(ctx, runID)
}

func (m *executionRepoMock) MarkRunAnchoredWithEvent(ctx context.Context, params ports.MarkRunAnchoredWithEventParams) error {
	m.markAnchorCalls++
	if m.markAnchorFn == nil {
		return nil
	}
	return m.markAnchorFn(ctx, params)
}

type stepExecutorMock struct {
	executeFn func(ctx context.Context, step ports.RunnableStep) (ports.ExecutionResult, error)
}

func (m *stepExecutorMock) Execute(ctx context.Context, step ports.RunnableStep) (ports.ExecutionResult, error) {
	if m.executeFn == nil {
		return ports.ExecutionResult{Success: true, Payload: json.RawMessage(`{}`)}, nil
	}
	return m.executeFn(ctx, step)
}

type anchorPublisherMock struct {
	publishFn func(ctx context.Context, request ports.PublishRunAnchorRequest) (ports.PublishRunAnchorResult, error)
}

func (m *anchorPublisherMock) PublishRunAnchor(ctx context.Context, request ports.PublishRunAnchorRequest) (ports.PublishRunAnchorResult, error) {
	if m.publishFn == nil {
		return ports.PublishRunAnchorResult{
			TxHash:      "mock-anchor-hash",
			ExplorerURL: "https://testnet.tonscan.org/tx/mock-anchor-hash",
		}, nil
	}
	return m.publishFn(ctx, request)
}

func TestRunEngineTickTONPolicyGuards(t *testing.T) {
	now := time.Date(2026, 3, 18, 11, 0, 0, 0, time.UTC)
	step := ports.RunnableStep{
		StepID:             "step-1",
		RunID:              "run-1",
		Name:               "trade",
		ExecutorType:       domain.ExecutorTypeTonTransaction,
		PolicyContractAddr: "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
		Attempt:            0,
		MaxRetries:         1,
		IsFinancial:        true,
		BudgetSpentNano:    1000,
	}

	repo := &executionRepoMock{
		claimFn: func(_ context.Context, _ ports.ClaimNextRunnableStepParams) (*ports.RunnableStep, error) {
			copy := step
			return &copy, nil
		},
	}
	reader := &policyReaderMock{
		getPolicyFn: func(_ context.Context, _ string) (ports.OnChainPolicy, error) {
			return ports.OnChainPolicy{
				PolicyContractAddr:    step.PolicyContractAddr,
				MaxSpendNano:          5000,
				RequireApproval:       true,
				AllowedExecutorHashes: []string{"allowhash"},
				FetchedAt:             now,
				PolicySeqno:           3,
			}, nil
		},
	}
	engine := NewRunEngineService(
		repo,
		ports.ExecutorRegistryMap{
			domain.ExecutorTypeTonTransaction: {
				Executor: &stepExecutorMock{
					executeFn: func(_ context.Context, _ ports.RunnableStep) (ports.ExecutionResult, error) {
						return ports.ExecutionResult{Success: true, CostNano: 1000, Payload: json.RawMessage(`{"ok":true}`)}, nil
					},
				},
				Metadata: ports.ExecutorMetadata{Endpoint: "acp://executor/ton_transaction", EndpointHash: "allowhash"},
			},
		},
		reader,
		nil,
		func() time.Time { return now },
		func() string { return "id-1" },
	)

	processed, err := engine.Tick(context.Background(), 1)
	if err != nil {
		t.Fatalf("Tick() unexpected error: %v", err)
	}
	if processed != 1 {
		t.Fatalf("processed=%d, want 1", processed)
	}
	if repo.holdCalls != 1 {
		t.Fatalf("PutStepOnApprovalHold calls=%d, want 1", repo.holdCalls)
	}
	if repo.applyPolicyCall != 1 {
		t.Fatalf("ApplyPolicySnapshot calls=%d, want 1", repo.applyPolicyCall)
	}
}

func TestRunEngineTickSkipsApprovalHoldForResolvedApprovalStep(t *testing.T) {
	now := time.Date(2026, 3, 20, 1, 0, 0, 0, time.UTC)
	step := ports.RunnableStep{
		StepID:             "step-approval-resumed",
		RunID:              "run-approval-resumed",
		Name:               "execute_trade",
		ExecutorType:       domain.ExecutorTypeTonTransaction,
		PolicyContractAddr: "kQAIcLPh2TM-z7jFmvAKdVHfR0zHkoe1OCaIDPRSNOX-d5Is",
		Attempt:            0,
		MaxRetries:         0,
		IsFinancial:        true,
		BudgetSpentNano:    0,
		ApprovalResolved:   true,
	}

	repo := &executionRepoMock{
		claimFn: func(_ context.Context, _ ports.ClaimNextRunnableStepParams) (*ports.RunnableStep, error) {
			copy := step
			return &copy, nil
		},
	}
	reader := &policyReaderMock{
		getPolicyFn: func(_ context.Context, _ string) (ports.OnChainPolicy, error) {
			return ports.OnChainPolicy{
				PolicyContractAddr:    step.PolicyContractAddr,
				MaxSpendNano:          5_000_000_000,
				RequireApproval:       true,
				AllowedExecutorHashes: []string{"allowhash"},
				FetchedAt:             now,
				PolicySeqno:           1,
			}, nil
		},
	}

	engine := NewRunEngineService(
		repo,
		ports.ExecutorRegistryMap{
			domain.ExecutorTypeTonTransaction: {
				Executor: &stepExecutorMock{
					executeFn: func(_ context.Context, _ ports.RunnableStep) (ports.ExecutionResult, error) {
						return ports.ExecutionResult{Success: true, CostNano: 1_000_000, Payload: json.RawMessage(`{"ok":true}`)}, nil
					},
				},
				Metadata: ports.ExecutorMetadata{Endpoint: "acp://executor/ton_transaction", EndpointHash: "allowhash"},
			},
		},
		reader,
		nil,
		func() time.Time { return now },
		func() string { return "id-1" },
	)

	processed, err := engine.Tick(context.Background(), 1)
	if err != nil {
		t.Fatalf("Tick() unexpected error: %v", err)
	}
	if processed != 1 {
		t.Fatalf("processed=%d, want 1", processed)
	}
	if repo.holdCalls != 0 {
		t.Fatalf("PutStepOnApprovalHold calls=%d, want 0", repo.holdCalls)
	}
	if repo.completeCalls != 1 {
		t.Fatalf("CompleteStep calls=%d, want 1", repo.completeCalls)
	}
}

func TestRunEngineTickBudgetExceededNano(t *testing.T) {
	now := time.Date(2026, 3, 18, 11, 0, 0, 0, time.UTC)
	repo := &executionRepoMock{
		claimFn: func(_ context.Context, _ ports.ClaimNextRunnableStepParams) (*ports.RunnableStep, error) {
			return &ports.RunnableStep{
				StepID:             "step-1",
				RunID:              "run-1",
				ExecutorType:       domain.ExecutorTypeHTTP,
				PolicyContractAddr: "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
				Attempt:            0,
				MaxRetries:         0,
				IsFinancial:        true,
				BudgetSpentNano:    5000,
			}, nil
		},
	}
	reader := &policyReaderMock{
		getPolicyFn: func(_ context.Context, _ string) (ports.OnChainPolicy, error) {
			return ports.OnChainPolicy{
				PolicyContractAddr:    "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
				MaxSpendNano:          5000,
				RequireApproval:       false,
				AllowedExecutorHashes: []string{"h1"},
				FetchedAt:             now,
			}, nil
		},
	}
	engine := NewRunEngineService(
		repo,
		ports.ExecutorRegistryMap{
			domain.ExecutorTypeHTTP: {
				Executor: &stepExecutorMock{
					executeFn: func(_ context.Context, _ ports.RunnableStep) (ports.ExecutionResult, error) {
						return ports.ExecutionResult{Success: true, CostNano: 1, Payload: json.RawMessage(`{}`)}, nil
					},
				},
				Metadata: ports.ExecutorMetadata{EndpointHash: "h1"},
			},
		},
		reader,
		nil,
		func() time.Time { return now },
		func() string { return "id-1" },
	)

	if _, err := engine.Tick(context.Background(), 1); err != nil {
		t.Fatalf("Tick() unexpected error: %v", err)
	}
	if repo.failCalls != 1 {
		t.Fatalf("FailStepAndRun calls=%d, want 1", repo.failCalls)
	}
}

func TestRunEngineAnchorCompletedRunsSuccess(t *testing.T) {
	now := time.Date(2026, 3, 18, 12, 0, 0, 0, time.UTC)
	repo := &executionRepoMock{
		listRunsFn: func(_ context.Context, _ int) ([]ports.CompletedRunForAnchor, error) {
			return []ports.CompletedRunForAnchor{
				{RunID: "run-1", FinishedAt: now.Add(-time.Minute)},
			}, nil
		},
		listEventsFn: func(_ context.Context, runID string) ([]domain.Event, error) {
			return []domain.Event{
				{
					ID:        "e1",
					RunID:     runID,
					EventType: domain.EventTypeRunCreated,
					Payload:   json.RawMessage(`{"x":1}`),
					CreatedAt: now.Add(-2 * time.Minute),
					Seq:       1,
				},
				{
					ID:        "e2",
					RunID:     runID,
					EventType: domain.EventTypeRunCompleted,
					Payload:   json.RawMessage(`{}`),
					CreatedAt: now.Add(-time.Minute),
					Seq:       2,
				},
			}, nil
		},
	}

	engine := NewRunEngineService(
		repo,
		ports.ExecutorRegistryMap{},
		nil,
		&anchorPublisherMock{},
		func() time.Time { return now },
		func() string { return "event-id" },
	)

	anchored, err := engine.AnchorCompletedRuns(context.Background(), 5)
	if err != nil {
		t.Fatalf("AnchorCompletedRuns() unexpected error: %v", err)
	}
	if anchored != 1 {
		t.Fatalf("anchored=%d, want 1", anchored)
	}
	if repo.markAnchorCalls != 1 {
		t.Fatalf("markAnchorCalls=%d, want 1", repo.markAnchorCalls)
	}
}

func TestRunEngineAnchorCompletedRunsPublishFailure(t *testing.T) {
	now := time.Date(2026, 3, 18, 12, 0, 0, 0, time.UTC)
	repo := &executionRepoMock{
		listRunsFn: func(_ context.Context, _ int) ([]ports.CompletedRunForAnchor, error) {
			return []ports.CompletedRunForAnchor{
				{RunID: "run-1", FinishedAt: now},
			}, nil
		},
		listEventsFn: func(_ context.Context, runID string) ([]domain.Event, error) {
			return []domain.Event{
				{
					ID:        "e1",
					RunID:     runID,
					EventType: domain.EventTypeRunCompleted,
					Payload:   json.RawMessage(`{}`),
					CreatedAt: now,
					Seq:       1,
				},
			}, nil
		},
	}

	engine := NewRunEngineService(
		repo,
		ports.ExecutorRegistryMap{},
		nil,
		&anchorPublisherMock{
			publishFn: func(_ context.Context, _ ports.PublishRunAnchorRequest) (ports.PublishRunAnchorResult, error) {
				return ports.PublishRunAnchorResult{}, errors.New("anchor publish failed")
			},
		},
		func() time.Time { return now },
		func() string { return "event-id" },
	)

	anchored, err := engine.AnchorCompletedRuns(context.Background(), 5)
	if err == nil {
		t.Fatalf("AnchorCompletedRuns() expected error, got nil")
	}
	if anchored != 0 {
		t.Fatalf("anchored=%d, want 0", anchored)
	}
	if repo.markAnchorCalls != 0 {
		t.Fatalf("markAnchorCalls=%d, want 0", repo.markAnchorCalls)
	}
}

func TestRunEngineAnchorCompletedRunsConflictIsIgnored(t *testing.T) {
	now := time.Date(2026, 3, 18, 12, 0, 0, 0, time.UTC)
	repo := &executionRepoMock{
		listRunsFn: func(_ context.Context, _ int) ([]ports.CompletedRunForAnchor, error) {
			return []ports.CompletedRunForAnchor{
				{RunID: "run-1", FinishedAt: now},
			}, nil
		},
		listEventsFn: func(_ context.Context, runID string) ([]domain.Event, error) {
			return []domain.Event{
				{
					ID:        "e1",
					RunID:     runID,
					EventType: domain.EventTypeRunCompleted,
					Payload:   json.RawMessage(`{}`),
					CreatedAt: now,
					Seq:       1,
				},
			}, nil
		},
		markAnchorFn: func(_ context.Context, _ ports.MarkRunAnchoredWithEventParams) error {
			return &domain.RunAnchorConflictError{
				RunID:  "run-1",
				Reason: "already anchored",
			}
		},
	}

	engine := NewRunEngineService(
		repo,
		ports.ExecutorRegistryMap{},
		nil,
		&anchorPublisherMock{},
		func() time.Time { return now },
		func() string { return "event-id" },
	)

	anchored, err := engine.AnchorCompletedRuns(context.Background(), 5)
	if err != nil {
		t.Fatalf("AnchorCompletedRuns() unexpected error: %v", err)
	}
	if anchored != 0 {
		t.Fatalf("anchored=%d, want 0", anchored)
	}
}

func TestBuildRunAnchorDigestDeterministicAndExcludesRunAnchored(t *testing.T) {
	now := time.Date(2026, 3, 18, 12, 30, 0, 0, time.UTC)
	events := []domain.Event{
		{
			ID:        "e1",
			RunID:     "run-1",
			EventType: domain.EventTypeRunCreated,
			Payload:   json.RawMessage(`{"b":2,"a":1}`),
			CreatedAt: now,
			Seq:       1,
		},
		{
			ID:        "e2",
			RunID:     "run-1",
			EventType: domain.EventTypeRunAnchored,
			Payload:   json.RawMessage(`{"anchor_tx_hash":"x"}`),
			CreatedAt: now.Add(time.Second),
			Seq:       2,
		},
	}

	firstBytes, firstHex, firstCount, err := buildRunAnchorDigest(events)
	if err != nil {
		t.Fatalf("first buildRunAnchorDigest() unexpected error: %v", err)
	}
	secondBytes, secondHex, secondCount, err := buildRunAnchorDigest(events)
	if err != nil {
		t.Fatalf("second buildRunAnchorDigest() unexpected error: %v", err)
	}
	if firstHex == "" || len(firstBytes) == 0 {
		t.Fatalf("digest is empty")
	}
	if firstHex != secondHex {
		t.Fatalf("digest is not deterministic: %q != %q", firstHex, secondHex)
	}
	if firstCount != 1 || secondCount != 1 {
		t.Fatalf("event_count=%d/%d, want 1 (run_anchored excluded)", firstCount, secondCount)
	}
	if string(firstBytes) != string(secondBytes) {
		t.Fatalf("digest bytes differ across identical input")
	}
}
