package executor

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"acp/backend/internal/ports"
)

func TestHTTPExecutor(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()

	executor := NewHTTPExecutor(2 * time.Second)
	result, err := executor.Execute(context.Background(), ports.RunnableStep{
		Input: json.RawMessage(`{"url":"` + server.URL + `"}`),
	})
	if err != nil {
		t.Fatalf("Execute() unexpected error: %v", err)
	}
	if !result.Success {
		t.Fatalf("expected success result")
	}
	if len(result.Payload) == 0 {
		t.Fatalf("payload is empty")
	}
}

func TestTonMockExecutor(t *testing.T) {
	executor := NewTonMockExecutor()

	t.Run("success", func(t *testing.T) {
		result, err := executor.Execute(context.Background(), ports.RunnableStep{
			StepID: "step-1",
			Input:  json.RawMessage(`{"amount_nano":2}`),
		})
		if err != nil {
			t.Fatalf("Execute() unexpected error: %v", err)
		}
		if !result.Success {
			t.Fatalf("expected success")
		}
		if result.CostNano != 2 {
			t.Fatalf("cost_nano=%v, want 2", result.CostNano)
		}
	})

	t.Run("failure", func(t *testing.T) {
		result, err := executor.Execute(context.Background(), ports.RunnableStep{
			StepID: "step-2",
			Input:  json.RawMessage(`{"cost_nano":3,"mock_fail":true}`),
		})
		if err != nil {
			t.Fatalf("Execute() unexpected error: %v", err)
		}
		if result.Success {
			t.Fatalf("expected failure")
		}
		if result.CostNano != 3 {
			t.Fatalf("cost_nano=%v, want 3", result.CostNano)
		}
	})
}
