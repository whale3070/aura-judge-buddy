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

type runLedgerRepositoryMock struct {
	transitionFn func(ctx context.Context, params ports.AtomicTransitionRunWithEventParams) (int64, error)
	listFn       func(ctx context.Context, runID string, limit int) ([]domain.Event, error)
	calls        int
}

func (m *runLedgerRepositoryMock) AtomicTransitionRunWithEvent(
	ctx context.Context,
	params ports.AtomicTransitionRunWithEventParams,
) (int64, error) {
	m.calls++
	if m.transitionFn == nil {
		return 0, nil
	}
	return m.transitionFn(ctx, params)
}

func (m *runLedgerRepositoryMock) ListRunEventsOrdered(
	ctx context.Context,
	runID string,
	limit int,
) ([]domain.Event, error) {
	if m.listFn == nil {
		return nil, nil
	}
	return m.listFn(ctx, runID, limit)
}

func TestRunLedgerServiceAtomicTransitionRunWithEvent(t *testing.T) {
	baseParams := ports.AtomicTransitionRunWithEventParams{
		RunID:        "run-1",
		ExpectedFrom: domain.RunStatusCreated,
		NextStatus:   domain.RunStatusRunning,
		EventID:      "event-1",
		EventType:    domain.EventTypeRunStarted,
		Payload:      json.RawMessage(`{"k":"v"}`),
		CreatedAt:    time.Now().UTC(),
	}

	t.Run("valid_transition_and_event", func(t *testing.T) {
		repo := &runLedgerRepositoryMock{
			transitionFn: func(_ context.Context, _ ports.AtomicTransitionRunWithEventParams) (int64, error) {
				return 42, nil
			},
		}
		svc := NewRunLedgerService(repo)

		seq, err := svc.AtomicTransitionRunWithEvent(context.Background(), baseParams)
		if err != nil {
			t.Fatalf("AtomicTransitionRunWithEvent() unexpected error: %v", err)
		}
		if seq != 42 {
			t.Fatalf("AtomicTransitionRunWithEvent() seq=%d, want 42", seq)
		}
		if repo.calls != 1 {
			t.Fatalf("repo call count=%d, want 1", repo.calls)
		}
	})

	t.Run("invalid_transition", func(t *testing.T) {
		repo := &runLedgerRepositoryMock{}
		svc := NewRunLedgerService(repo)

		params := baseParams
		params.ExpectedFrom = domain.RunStatusCreated
		params.NextStatus = domain.RunStatusCompleted

		_, err := svc.AtomicTransitionRunWithEvent(context.Background(), params)
		if err == nil {
			t.Fatalf("AtomicTransitionRunWithEvent() expected error, got nil")
		}
		if !errors.Is(err, domain.ErrInvalidTransition) {
			t.Fatalf("expected ErrInvalidTransition, got %v", err)
		}
		if repo.calls != 0 {
			t.Fatalf("repo should not be called, got %d calls", repo.calls)
		}
	})

	t.Run("invalid_event_type", func(t *testing.T) {
		repo := &runLedgerRepositoryMock{}
		svc := NewRunLedgerService(repo)

		params := baseParams
		params.EventType = domain.EventType("invalid_event")

		_, err := svc.AtomicTransitionRunWithEvent(context.Background(), params)
		if err == nil {
			t.Fatalf("AtomicTransitionRunWithEvent() expected error, got nil")
		}
		if !errors.Is(err, domain.ErrInvalidEventType) {
			t.Fatalf("expected ErrInvalidEventType, got %v", err)
		}
		if repo.calls != 0 {
			t.Fatalf("repo should not be called, got %d calls", repo.calls)
		}
	})

	t.Run("repository_conflict_error_passthrough", func(t *testing.T) {
		repo := &runLedgerRepositoryMock{
			transitionFn: func(_ context.Context, _ ports.AtomicTransitionRunWithEventParams) (int64, error) {
				return 0, &domain.RunTransitionConflictError{
					RunID:        "run-1",
					ExpectedFrom: domain.RunStatusCreated,
				}
			},
		}
		svc := NewRunLedgerService(repo)

		_, err := svc.AtomicTransitionRunWithEvent(context.Background(), baseParams)
		if err == nil {
			t.Fatalf("AtomicTransitionRunWithEvent() expected error, got nil")
		}
		if !errors.Is(err, domain.ErrRunTransitionConflict) {
			t.Fatalf("expected ErrRunTransitionConflict, got %v", err)
		}
		if repo.calls != 1 {
			t.Fatalf("repo call count=%d, want 1", repo.calls)
		}
	})
}
