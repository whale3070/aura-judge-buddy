package executor

import (
	"context"
	"encoding/json"
	"fmt"

	"acp/backend/internal/ports"
)

type TonMockExecutor struct{}

func NewTonMockExecutor() *TonMockExecutor {
	return &TonMockExecutor{}
}

type tonMockInput struct {
	AmountNano int64 `json:"amount_nano"`
	CostNano   int64 `json:"cost_nano"`
	MockFail   bool  `json:"mock_fail"`
}

func (e *TonMockExecutor) Execute(_ context.Context, step ports.RunnableStep) (ports.ExecutionResult, error) {
	var input tonMockInput
	if len(step.Input) > 0 {
		if err := json.Unmarshal(step.Input, &input); err != nil {
			return ports.ExecutionResult{}, fmt.Errorf("decode ton mock input: %w", err)
		}
	}

	cost := input.CostNano
	if cost <= 0 {
		cost = input.AmountNano
	}
	if cost < 0 {
		cost = 0
	}

	if input.MockFail {
		return ports.ExecutionResult{
			Success:      false,
			CostNano:     cost,
			ErrorMessage: "ton mock execution failed",
		}, nil
	}

	payload, err := json.Marshal(map[string]any{
		"mock":      true,
		"tx_ref":    fmt.Sprintf("mock-tx-%s", step.StepID),
		"cost_nano": cost,
	})
	if err != nil {
		return ports.ExecutionResult{}, fmt.Errorf("encode ton mock payload: %w", err)
	}

	return ports.ExecutionResult{
		Success:  true,
		Payload:  payload,
		CostNano: cost,
	}, nil
}
