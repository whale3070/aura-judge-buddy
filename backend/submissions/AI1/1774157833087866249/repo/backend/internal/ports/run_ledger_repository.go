package ports

import (
	"context"
	"encoding/json"
	"time"

	"acp/backend/internal/domain"
)

type AtomicTransitionRunWithEventParams struct {
	RunID        string
	ExpectedFrom domain.RunStatus
	NextStatus   domain.RunStatus
	EventID      string
	EventType    domain.EventType
	Payload      json.RawMessage
	CreatedAt    time.Time
}

type RunLedgerRepository interface {
	AtomicTransitionRunWithEvent(ctx context.Context, params AtomicTransitionRunWithEventParams) (int64, error)
	ListRunEventsOrdered(ctx context.Context, runID string, limit int) ([]domain.Event, error)
}
