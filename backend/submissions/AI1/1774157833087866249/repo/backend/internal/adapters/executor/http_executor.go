package executor

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"acp/backend/internal/ports"
)

type HTTPExecutor struct {
	client *http.Client
}

func NewHTTPExecutor(timeout time.Duration) *HTTPExecutor {
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	return &HTTPExecutor{
		client: &http.Client{Timeout: timeout},
	}
}

type httpExecutorInput struct {
	URL    string `json:"url"`
	Method string `json:"method"`
}

func (e *HTTPExecutor) Execute(ctx context.Context, step ports.RunnableStep) (ports.ExecutionResult, error) {
	var input httpExecutorInput
	if len(step.Input) > 0 {
		if err := json.Unmarshal(step.Input, &input); err != nil {
			return ports.ExecutionResult{}, fmt.Errorf("decode http executor input: %w", err)
		}
	}

	if strings.TrimSpace(input.URL) == "" {
		return ports.ExecutionResult{}, fmt.Errorf("http executor input.url is required")
	}
	method := strings.ToUpper(strings.TrimSpace(input.Method))
	if method == "" {
		method = http.MethodGet
	}

	request, err := http.NewRequestWithContext(ctx, method, input.URL, nil)
	if err != nil {
		return ports.ExecutionResult{}, fmt.Errorf("build http request: %w", err)
	}

	response, err := e.client.Do(request)
	if err != nil {
		return ports.ExecutionResult{}, fmt.Errorf("execute http request: %w", err)
	}
	defer response.Body.Close()

	body, err := io.ReadAll(response.Body)
	if err != nil {
		return ports.ExecutionResult{}, fmt.Errorf("read http response body: %w", err)
	}

	payload, err := json.Marshal(map[string]any{
		"status_code": response.StatusCode,
		"body":        string(body),
	})
	if err != nil {
		return ports.ExecutionResult{}, fmt.Errorf("encode http payload: %w", err)
	}

	success := response.StatusCode >= 200 && response.StatusCode < 300
	result := ports.ExecutionResult{
		Success:  success,
		Payload:  payload,
		CostNano: 0,
	}
	if !success {
		result.ErrorMessage = fmt.Sprintf("http executor status=%d", response.StatusCode)
	}

	return result, nil
}
