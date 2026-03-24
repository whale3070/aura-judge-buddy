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

type runsRepoMock struct {
	createFn      func(ctx context.Context, params ports.CreateRunWithPlanAndLedgerParams) (string, error)
	getIDemFn     func(ctx context.Context, scope, key string) (*ports.IdempotencyLookupResult, error)
	getRunFn      func(ctx context.Context, runID string) (ports.GetRunByIDResult, error)
	listStepsFn   func(ctx context.Context, runID string) ([]ports.StepRecord, error)
	getStepFn     func(ctx context.Context, stepID string) (ports.StepRecord, error)
	listEventsFn  func(ctx context.Context, runID string, limit int) ([]domain.Event, error)
	cancelFn      func(ctx context.Context, runID string, eventID string, cancelledAt time.Time) error
	approveFn     func(ctx context.Context, params ports.ResolveApprovalApproveParams) (ports.ApprovalRecord, error)
	rejectFn      func(ctx context.Context, params ports.ResolveApprovalRejectParams) (ports.ApprovalRecord, error)
	createInvoked int
}

func (m *runsRepoMock) CreateRunWithPlanAndLedger(ctx context.Context, params ports.CreateRunWithPlanAndLedgerParams) (string, error) {
	m.createInvoked++
	if m.createFn == nil {
		return params.RunID, nil
	}
	return m.createFn(ctx, params)
}

func (m *runsRepoMock) GetRunByID(ctx context.Context, runID string) (ports.GetRunByIDResult, error) {
	if m.getRunFn == nil {
		return ports.GetRunByIDResult{}, nil
	}
	return m.getRunFn(ctx, runID)
}

func (m *runsRepoMock) ListRunSteps(ctx context.Context, runID string) ([]ports.StepRecord, error) {
	if m.listStepsFn == nil {
		return nil, nil
	}
	return m.listStepsFn(ctx, runID)
}

func (m *runsRepoMock) GetStepByID(ctx context.Context, stepID string) (ports.StepRecord, error) {
	if m.getStepFn == nil {
		return ports.StepRecord{}, nil
	}
	return m.getStepFn(ctx, stepID)
}

func (m *runsRepoMock) ListRunEventsOrdered(ctx context.Context, runID string, limit int) ([]domain.Event, error) {
	if m.listEventsFn == nil {
		return nil, nil
	}
	return m.listEventsFn(ctx, runID, limit)
}

func (m *runsRepoMock) ResolveApprovalApprove(ctx context.Context, params ports.ResolveApprovalApproveParams) (ports.ApprovalRecord, error) {
	if m.approveFn == nil {
		return ports.ApprovalRecord{}, nil
	}
	return m.approveFn(ctx, params)
}

func (m *runsRepoMock) ResolveApprovalReject(ctx context.Context, params ports.ResolveApprovalRejectParams) (ports.ApprovalRecord, error) {
	if m.rejectFn == nil {
		return ports.ApprovalRecord{}, nil
	}
	return m.rejectFn(ctx, params)
}

func (m *runsRepoMock) CancelRunWithLedger(ctx context.Context, runID string, eventID string, cancelledAt time.Time) error {
	if m.cancelFn == nil {
		return nil
	}
	return m.cancelFn(ctx, runID, eventID, cancelledAt)
}

func (m *runsRepoMock) GetIdempotency(ctx context.Context, scope, key string) (*ports.IdempotencyLookupResult, error) {
	if m.getIDemFn == nil {
		return nil, nil
	}
	return m.getIDemFn(ctx, scope, key)
}

type policyReaderMock struct {
	getPolicyFn func(ctx context.Context, contractAddr string) (ports.OnChainPolicy, error)
}

func (m *policyReaderMock) GetPolicy(ctx context.Context, contractAddr string) (ports.OnChainPolicy, error) {
	if m.getPolicyFn == nil {
		return ports.OnChainPolicy{}, nil
	}
	return m.getPolicyFn(ctx, contractAddr)
}

func TestCreateRunTONPolicyContractRequired(t *testing.T) {
	svc := NewRunsService(&runsRepoMock{}, &policyReaderMock{}, time.Now, func() string { return "id-1" })
	_, err := svc.CreateRun(context.Background(), CreateRunRequest{
		AgentID: "agent-1",
		Steps: []CreateRunStepRequest{
			{Name: "fetch", ExecutorType: domain.ExecutorTypeHTTP},
		},
	})
	if err == nil || !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected invalid input for missing policy_contract_addr, got %v", err)
	}
}

func TestCreateRunReadsPolicyAndPersistsSnapshot(t *testing.T) {
	repo := &runsRepoMock{
		createFn: func(_ context.Context, params ports.CreateRunWithPlanAndLedgerParams) (string, error) {
			if params.PolicyContractAddr == "" {
				t.Fatalf("policy contract addr not propagated")
			}
			if params.Budget.MaxSpendNano != 5000000000 {
				t.Fatalf("budget max=%d, want 5000000000", params.Budget.MaxSpendNano)
			}
			if !params.PolicySnapshot.RequireApproval {
				t.Fatalf("policy snapshot require_approval=false, want true")
			}
			return params.RunID, nil
		},
	}
	reader := &policyReaderMock{
		getPolicyFn: func(_ context.Context, _ string) (ports.OnChainPolicy, error) {
			return ports.OnChainPolicy{
				PolicyContractAddr:    "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
				MaxSpendNano:          5000000000,
				RequireApproval:       true,
				AllowedExecutorHashes: []string{"abc"},
				FetchedAt:             time.Date(2026, 3, 18, 10, 0, 0, 0, time.UTC),
				PolicySeqno:           1,
			}, nil
		},
	}
	idValues := []string{"run-1", "budget-1", "step-1", "evt-1", "evt-2"}
	svc := NewRunsService(repo, reader, func() time.Time { return time.Date(2026, 3, 18, 10, 0, 0, 0, time.UTC) }, func() string {
		v := idValues[0]
		idValues = idValues[1:]
		return v
	})

	_, err := svc.CreateRun(context.Background(), CreateRunRequest{
		AgentID:            "agent-1",
		PolicyContractAddr: "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
		Steps: []CreateRunStepRequest{
			{
				Name:         "fetch",
				ExecutorType: domain.ExecutorTypeHTTP,
				Input:        json.RawMessage(`{"url":"https://example.com"}`),
			},
		},
	})
	if err != nil {
		t.Fatalf("CreateRun() unexpected error: %v", err)
	}
	if repo.createInvoked != 1 {
		t.Fatalf("CreateRunWithPlanAndLedger calls=%d, want 1", repo.createInvoked)
	}
}

func TestCreateRunIdempotencyReplay(t *testing.T) {
	request := CreateRunRequest{
		AgentID:            "agent-1",
		PolicyContractAddr: "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
		Steps: []CreateRunStepRequest{
			{Name: "fetch", ExecutorType: domain.ExecutorTypeHTTP},
		},
		IdempotencyKey: "idem-1",
	}
	hash, err := computeCreateRunRequestHash(request)
	if err != nil {
		t.Fatalf("compute hash: %v", err)
	}

	repo := &runsRepoMock{
		getIDemFn: func(_ context.Context, _ string, _ string) (*ports.IdempotencyLookupResult, error) {
			return &ports.IdempotencyLookupResult{
				RequestHash: hash,
				RunID:       "run-existing",
			}, nil
		},
	}
	svc := NewRunsService(repo, &policyReaderMock{}, time.Now, func() string { return "unused" })

	response, err := svc.CreateRun(context.Background(), request)
	if err != nil {
		t.Fatalf("CreateRun() unexpected error: %v", err)
	}
	if response.RunID != "run-existing" {
		t.Fatalf("run_id=%q, want run-existing", response.RunID)
	}
	if repo.createInvoked != 0 {
		t.Fatalf("CreateRunWithPlanAndLedger called unexpectedly")
	}
}
