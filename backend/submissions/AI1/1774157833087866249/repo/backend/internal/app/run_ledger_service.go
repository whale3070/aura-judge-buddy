package app

import (
	"context"

	"acp/backend/internal/domain"
	"acp/backend/internal/ports"
)

type RunLedgerService struct {
	repo ports.RunLedgerRepository
}

func NewRunLedgerService(repo ports.RunLedgerRepository) *RunLedgerService {
	return &RunLedgerService{repo: repo}
}

func (s *RunLedgerService) AtomicTransitionRunWithEvent(
	ctx context.Context,
	params ports.AtomicTransitionRunWithEventParams,
) (int64, error) {
	if !domain.CanTransitionRun(params.ExpectedFrom, params.NextStatus) {
		return 0, &domain.TransitionError{
			Entity: "run",
			From:   string(params.ExpectedFrom),
			To:     string(params.NextStatus),
		}
	}
	if err := domain.ValidateEventType(params.EventType); err != nil {
		return 0, err
	}
	return s.repo.AtomicTransitionRunWithEvent(ctx, params)
}

func (s *RunLedgerService) ListRunEventsOrdered(
	ctx context.Context,
	runID string,
	limit int,
) ([]domain.Event, error) {
	return s.repo.ListRunEventsOrdered(ctx, runID, limit)
}
