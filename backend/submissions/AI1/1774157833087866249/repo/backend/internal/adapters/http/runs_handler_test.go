package http

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"acp/backend/internal/app"
	"acp/backend/internal/domain"
	"acp/backend/internal/ports"
)

type runsUseCaseMock struct {
	createFn  func(ctx context.Context, request app.CreateRunRequest) (app.CreateRunResponse, error)
	getFn     func(ctx context.Context, runID string) (ports.GetRunByIDResult, error)
	cancelFn  func(ctx context.Context, runID string) (app.CancelRunResponse, error)
	stepsFn   func(ctx context.Context, runID string) ([]ports.StepRecord, error)
	stepFn    func(ctx context.Context, stepID string) (ports.StepRecord, error)
	eventsFn  func(ctx context.Context, runID string, limit int) ([]domain.Event, error)
	approveFn func(ctx context.Context, approvalID string) (app.ApprovalActionResponse, error)
	rejectFn  func(ctx context.Context, approvalID string) (app.ApprovalActionResponse, error)
}

func (m *runsUseCaseMock) CreateRun(ctx context.Context, request app.CreateRunRequest) (app.CreateRunResponse, error) {
	if m.createFn == nil {
		return app.CreateRunResponse{}, nil
	}
	return m.createFn(ctx, request)
}

func (m *runsUseCaseMock) GetRun(ctx context.Context, runID string) (ports.GetRunByIDResult, error) {
	if m.getFn == nil {
		return ports.GetRunByIDResult{}, nil
	}
	return m.getFn(ctx, runID)
}

func (m *runsUseCaseMock) ListRunSteps(ctx context.Context, runID string) ([]ports.StepRecord, error) {
	if m.stepsFn == nil {
		return nil, nil
	}
	return m.stepsFn(ctx, runID)
}

func (m *runsUseCaseMock) GetStep(ctx context.Context, stepID string) (ports.StepRecord, error) {
	if m.stepFn == nil {
		return ports.StepRecord{}, nil
	}
	return m.stepFn(ctx, stepID)
}

func (m *runsUseCaseMock) ListRunEvents(ctx context.Context, runID string, limit int) ([]domain.Event, error) {
	if m.eventsFn == nil {
		return nil, nil
	}
	return m.eventsFn(ctx, runID, limit)
}

func (m *runsUseCaseMock) CancelRun(ctx context.Context, runID string) (app.CancelRunResponse, error) {
	if m.cancelFn == nil {
		return app.CancelRunResponse{}, nil
	}
	return m.cancelFn(ctx, runID)
}

func (m *runsUseCaseMock) ApproveAction(ctx context.Context, approvalID string) (app.ApprovalActionResponse, error) {
	if m.approveFn == nil {
		return app.ApprovalActionResponse{}, nil
	}
	return m.approveFn(ctx, approvalID)
}

func (m *runsUseCaseMock) RejectAction(ctx context.Context, approvalID string) (app.ApprovalActionResponse, error) {
	if m.rejectFn == nil {
		return app.ApprovalActionResponse{}, nil
	}
	return m.rejectFn(ctx, approvalID)
}

func TestAuthRequiredOnCoreRoutes(t *testing.T) {
	router := NewRouter(&runsUseCaseMock{}, "secret")
	routes := []struct {
		method string
		path   string
		body   string
	}{
		{http.MethodPost, "/runs", `{"agent_id":"a","policy_contract_addr":"kQC","steps":[{"name":"s","executor_type":"http"}]}`},
		{http.MethodGet, "/runs/run-1", ""},
		{http.MethodGet, "/runs/run-1/steps", ""},
		{http.MethodGet, "/steps/step-1", ""},
		{http.MethodGet, "/runs/run-1/events", ""},
		{http.MethodPost, "/approvals/appr-1/approve", ""},
		{http.MethodPost, "/approvals/appr-1/reject", ""},
		{http.MethodPost, "/runs/run-1/cancel", ""},
	}

	for _, route := range routes {
		req := httptest.NewRequest(route.method, route.path, bytes.NewBufferString(route.body))
		if route.body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		resp := httptest.NewRecorder()
		router.ServeHTTP(resp, req)
		if resp.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s status=%d, want %d", route.method, route.path, resp.Code, http.StatusUnauthorized)
		}
	}
}

func TestCreateRunTONFirstPayload(t *testing.T) {
	var captured app.CreateRunRequest
	router := NewRouter(&runsUseCaseMock{
		createFn: func(_ context.Context, request app.CreateRunRequest) (app.CreateRunResponse, error) {
			captured = request
			return app.CreateRunResponse{RunID: "run-1", Status: domain.RunStatusRunning}, nil
		},
	}, "secret")

	req := httptest.NewRequest(http.MethodPost, "/runs", bytes.NewBufferString(`{
		"agent_id":"agent-1",
		"policy_contract_addr":"kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
		"steps":[{"name":"fetch","executor_type":"http","max_retries":1}]
	}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer secret")
	req.Header.Set("Idempotency-Key", "idem-1")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusCreated {
		t.Fatalf("status=%d, want %d, body=%s", resp.Code, http.StatusCreated, resp.Body.String())
	}
	if captured.PolicyContractAddr == "" {
		t.Fatalf("policy_contract_addr was not passed to use case")
	}
	if captured.IdempotencyKey != "idem-1" {
		t.Fatalf("idempotency key=%q, want idem-1", captured.IdempotencyKey)
	}
}

func TestGetRunResponseShapeTONFirst(t *testing.T) {
	now := time.Date(2026, 3, 18, 12, 0, 0, 0, time.UTC)
	anchorHash := "tx-hash"
	anchorDigest := "digest"
	router := NewRouter(&runsUseCaseMock{
		getFn: func(_ context.Context, _ string) (ports.GetRunByIDResult, error) {
			return ports.GetRunByIDResult{
				ID:                 "run-1",
				AgentID:            "agent-1",
				Status:             domain.RunStatusRunning,
				PolicyContractAddr: "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
				CreatedAt:          now,
				Budget: domain.Budget{
					Currency:     "nanotons",
					MaxSpendNano: 5000000000,
					SpentNano:    1000000000,
				},
				AnchorTxHash: &anchorHash,
				AnchorDigest: &anchorDigest,
			}, nil
		},
	}, "secret")

	req := httptest.NewRequest(http.MethodGet, "/runs/run-1", nil)
	req.Header.Set("Authorization", "Bearer secret")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("status=%d, want %d", resp.Code, http.StatusOK)
	}

	var body map[string]any
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if body["policy_contract_addr"] == nil {
		t.Fatalf("policy_contract_addr missing in response")
	}
	if body["anchor_explorer_url"] != "https://testnet.tonscan.org/tx/tx-hash" {
		t.Fatalf("anchor_explorer_url=%v, want https://testnet.tonscan.org/tx/tx-hash", body["anchor_explorer_url"])
	}
	budget, ok := body["budget"].(map[string]any)
	if !ok {
		t.Fatalf("budget is missing or invalid")
	}
	if budget["max_spend_nano"] != "5000000000" {
		t.Fatalf("max_spend_nano=%v, want 5000000000", budget["max_spend_nano"])
	}
	if budget["spent_nano"] != "1000000000" {
		t.Fatalf("spent_nano=%v, want 1000000000", budget["spent_nano"])
	}
}

func TestGetRunUsesConfiguredExplorerBaseURL(t *testing.T) {
	router := NewRouterWithConfig(&runsUseCaseMock{
		getFn: func(_ context.Context, _ string) (ports.GetRunByIDResult, error) {
			hash := "tx-custom"
			return ports.GetRunByIDResult{
				ID:                 "run-1",
				AgentID:            "agent-1",
				Status:             domain.RunStatusRunning,
				PolicyContractAddr: "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
				CreatedAt:          time.Now().UTC(),
				Budget: domain.Budget{
					Currency:     "nanotons",
					MaxSpendNano: 1,
					SpentNano:    0,
				},
				AnchorTxHash: &hash,
			}, nil
		},
	}, "secret", "https://example.explorer/tx")

	req := httptest.NewRequest(http.MethodGet, "/runs/run-1", nil)
	req.Header.Set("Authorization", "Bearer secret")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("status=%d, want %d", resp.Code, http.StatusOK)
	}
	var body map[string]any
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if body["anchor_explorer_url"] != "https://example.explorer/tx/tx-custom" {
		t.Fatalf("anchor_explorer_url=%v, want https://example.explorer/tx/tx-custom", body["anchor_explorer_url"])
	}
}

func TestDemoRoutesRemoved(t *testing.T) {
	router := NewRouter(&runsUseCaseMock{}, "secret")
	req := httptest.NewRequest(http.MethodPost, "/api/agents", bytes.NewBufferString(`{}`))
	req.Header.Set("Authorization", "Bearer secret")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	if resp.Code != http.StatusNotFound {
		t.Fatalf("status=%d, want %d", resp.Code, http.StatusNotFound)
	}
}
