package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"acp/backend/internal/domain"
	"acp/backend/internal/ports"
)

type RunEngineService struct {
	repo         ports.ExecutionRepository
	executors    ports.ExecutorRegistry
	policyReader ports.PolicyReader
	anchor       ports.AnchorPublisher
	now          func() time.Time
	newID        func() string
}

func NewRunEngineService(
	repo ports.ExecutionRepository,
	executors ports.ExecutorRegistry,
	policyReader ports.PolicyReader,
	anchor ports.AnchorPublisher,
	now func() time.Time,
	newID func() string,
) *RunEngineService {
	if now == nil {
		now = func() time.Time { return time.Now().UTC() }
	}
	if newID == nil {
		newID = func() string { return uuid.NewString() }
	}
	return &RunEngineService{
		repo:         repo,
		executors:    executors,
		policyReader: policyReader,
		anchor:       anchor,
		now:          now,
		newID:        newID,
	}
}

func (s *RunEngineService) Tick(ctx context.Context, limit int) (int, error) {
	if limit <= 0 {
		limit = 1
	}

	processed := 0
	for i := 0; i < limit; i++ {
		now := s.now().UTC()
		step, err := s.repo.ClaimNextRunnableStep(ctx, ports.ClaimNextRunnableStepParams{
			Now:                now,
			StepStartedEventID: s.newID(),
		})
		if err != nil {
			return processed, err
		}
		if step == nil {
			return processed, nil
		}
		processed++

		if s.policyReader == nil {
			if err := s.failStepAndRun(ctx, *step, now, "policy_violation: policy reader is not configured"); err != nil {
				return processed, err
			}
			continue
		}

		policy, err := s.policyReader.GetPolicy(ctx, step.PolicyContractAddr)
		if err != nil {
			if failErr := s.failStepAndRun(
				ctx,
				*step,
				now,
				fmt.Sprintf("policy_violation: read policy failed: %v", err),
			); failErr != nil {
				return processed, failErr
			}
			continue
		}

		if err := s.repo.ApplyPolicySnapshot(ctx, ports.ApplyPolicySnapshotParams{
			RunID:                 step.RunID,
			PolicyContractAddr:    policy.PolicyContractAddr,
			MaxSpendNano:          policy.MaxSpendNano,
			RequireApproval:       policy.RequireApproval,
			AllowedExecutorHashes: append([]string(nil), policy.AllowedExecutorHashes...),
			FetchedAt:             policy.FetchedAt.UTC(),
			PolicySeqno:           policy.PolicySeqno,
		}); err != nil {
			return processed, err
		}

		executor, ok := s.executors.Get(step.ExecutorType)
		if !ok {
			if err := s.failStepAndRun(
				ctx,
				*step,
				now,
				fmt.Sprintf("unsupported executor type: %s", step.ExecutorType),
			); err != nil {
				return processed, err
			}
			continue
		}

		metadata, metaOK := s.executors.Metadata(step.ExecutorType)
		if !metaOK {
			if err := s.failStepAndRun(
				ctx,
				*step,
				now,
				fmt.Sprintf("policy_violation: missing executor metadata for %s", step.ExecutorType),
			); err != nil {
				return processed, err
			}
			continue
		}

		if !isExecutorAllowed(policy.AllowedExecutorHashes, metadata.Endpoint, metadata.EndpointHash) {
			if err := s.failStepAndRun(
				ctx,
				*step,
				now,
				fmt.Sprintf("policy_violation: executor endpoint is not allowlisted (%s)", step.ExecutorType),
			); err != nil {
				return processed, err
			}
			continue
		}

		if policy.RequireApproval && step.IsFinancial && !step.ApprovalResolved {
			if err := s.repo.PutStepOnApprovalHold(ctx, ports.PutStepOnApprovalHoldParams{
				RunID:                    step.RunID,
				StepID:                   step.StepID,
				ApprovalID:               s.newID(),
				RequestedAt:              now,
				ApprovalRequestedEventID: s.newID(),
			}); err != nil {
				return processed, err
			}
			continue
		}

		result, execErr := executor.Execute(ctx, *step)
		if execErr != nil {
			result.Success = false
			if result.ErrorMessage == "" {
				result.ErrorMessage = execErr.Error()
			}
		}
		if !result.Success {
			if err := s.handleFailure(ctx, *step, now, result.ErrorMessage); err != nil {
				return processed, err
			}
			continue
		}

		if step.IsFinancial && result.CostNano <= 0 {
			if err := s.failStepAndRun(
				ctx,
				*step,
				now,
				"policy_violation: financial_step_requires_positive_cost",
			); err != nil {
				return processed, err
			}
			continue
		}

		if step.IsFinancial && step.BudgetSpentNano+result.CostNano > policy.MaxSpendNano {
			if err := s.failStepAndRun(ctx, *step, now, "budget_exceeded"); err != nil {
				return processed, err
			}
			continue
		}

		payload := result.Payload
		if len(payload) == 0 {
			payload = json.RawMessage(`{}`)
		}

		costNano := int64(0)
		if step.IsFinancial {
			costNano = result.CostNano
		}

		err = s.repo.CompleteStep(ctx, ports.CompleteStepParams{
			RunID:                step.RunID,
			StepID:               step.StepID,
			FinishedAt:           now,
			Output:               payload,
			CostNano:             costNano,
			MaxSpendNano:         policy.MaxSpendNano,
			StepCompletedEventID: s.newID(),
			RunCompletedEventID:  s.newID(),
		})
		if err != nil {
			if errors.Is(err, domain.ErrBudgetExceeded) {
				if failErr := s.failStepAndRun(ctx, *step, now, "budget_exceeded"); failErr != nil {
					return processed, failErr
				}
				continue
			}
			return processed, err
		}
	}

	return processed, nil
}

func (s *RunEngineService) RecoverStaleSteps(ctx context.Context, limit int) (int, error) {
	if limit <= 0 {
		limit = 1
	}
	return s.repo.RecoverStaleRunningSteps(ctx, ports.RecoverStaleRunningStepsParams{
		Now:   s.now().UTC(),
		Limit: limit,
	})
}

func (s *RunEngineService) AnchorCompletedRuns(ctx context.Context, limit int) (int, error) {
	if limit <= 0 {
		limit = 1
	}
	if s.anchor == nil {
		return 0, nil
	}

	runs, err := s.repo.ListCompletedUnanchoredRuns(ctx, limit)
	if err != nil {
		return 0, err
	}

	anchored := 0
	for _, run := range runs {
		events, err := s.repo.ListRunEventsForAnchor(ctx, run.RunID)
		if err != nil {
			return anchored, err
		}
		digestBytes, digestHex, eventCount, err := buildRunAnchorDigest(events)
		if err != nil {
			return anchored, err
		}

		result, err := s.anchor.PublishRunAnchor(ctx, ports.PublishRunAnchorRequest{
			RunID:          run.RunID,
			Digest:         digestBytes,
			DigestHex:      digestHex,
			EventCount:     eventCount,
			CompletedAtUTC: run.FinishedAt.UTC(),
		})
		if err != nil {
			// Async retry semantics: run remains completed+unanchored and will be retried on next loop.
			return anchored, err
		}

		err = s.repo.MarkRunAnchoredWithEvent(ctx, ports.MarkRunAnchoredWithEventParams{
			RunID:              run.RunID,
			AnchorTxHash:       result.TxHash,
			AnchorDigest:       digestHex,
			AnchoredAt:         s.now().UTC(),
			RunAnchoredEventID: s.newID(),
			ExplorerURL:        result.ExplorerURL,
		})
		if err != nil {
			if errors.Is(err, domain.ErrRunAnchorConflict) {
				continue
			}
			return anchored, err
		}
		anchored++
	}

	return anchored, nil
}

func (s *RunEngineService) handleFailure(
	ctx context.Context,
	step ports.RunnableStep,
	now time.Time,
	errorMessage string,
) error {
	if errorMessage == "" {
		errorMessage = "executor failure"
	}

	if step.Attempt < step.MaxRetries {
		return s.repo.RetryStep(ctx, ports.RetryStepParams{
			RunID:              step.RunID,
			StepID:             step.StepID,
			FailedAt:           now,
			ErrorMessage:       errorMessage,
			StepFailedEventID:  s.newID(),
			StepRetriedEventID: s.newID(),
		})
	}

	return s.failStepAndRun(ctx, step, now, errorMessage)
}

func (s *RunEngineService) failStepAndRun(
	ctx context.Context,
	step ports.RunnableStep,
	now time.Time,
	errorMessage string,
) error {
	return s.repo.FailStepAndRun(ctx, ports.FailStepAndRunParams{
		RunID:             step.RunID,
		StepID:            step.StepID,
		FailedAt:          now,
		ErrorMessage:      errorMessage,
		StepFailedEventID: s.newID(),
		RunFailedEventID:  s.newID(),
	})
}

func isExecutorAllowed(allowedHashes []string, endpoint string, endpointHash string) bool {
	if len(allowedHashes) == 0 {
		return true
	}
	canonical := strings.TrimSpace(strings.ToLower(endpointHash))
	if canonical == "" {
		canonical = hashExecutorEndpoint(endpoint)
	}
	if canonical == "" {
		return false
	}
	for _, allowed := range allowedHashes {
		if strings.TrimSpace(strings.ToLower(allowed)) == canonical {
			return true
		}
	}
	return false
}

func hashExecutorEndpoint(endpoint string) string {
	normalized := strings.TrimSpace(strings.ToLower(endpoint))
	if normalized == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(normalized))
	return hex.EncodeToString(sum[:])
}

func buildRunAnchorDigest(events []domain.Event) ([]byte, string, int, error) {
	type digestEvent struct {
		Seq       int64  `json:"seq"`
		EventType string `json:"event_type"`
		StepID    string `json:"step_id,omitempty"`
		Payload   any    `json:"payload"`
		CreatedAt string `json:"created_at"`
	}

	serialized := make([]digestEvent, 0, len(events))
	for _, event := range events {
		if event.EventType == domain.EventTypeRunAnchored {
			continue
		}
		payload := map[string]any{}
		if len(event.Payload) > 0 {
			if err := json.Unmarshal(event.Payload, &payload); err != nil {
				return nil, "", 0, fmt.Errorf("decode event payload for digest run_id=%s seq=%d: %w", event.RunID, event.Seq, err)
			}
		}
		row := digestEvent{
			Seq:       event.Seq,
			EventType: string(event.EventType),
			Payload:   payload,
			CreatedAt: event.CreatedAt.UTC().Format(time.RFC3339Nano),
		}
		if event.StepID != nil {
			row.StepID = *event.StepID
		}
		serialized = append(serialized, row)
	}

	raw, err := json.Marshal(serialized)
	if err != nil {
		return nil, "", 0, fmt.Errorf("marshal digest event stream: %w", err)
	}
	sum := sha256.Sum256(raw)
	return sum[:], hex.EncodeToString(sum[:]), len(serialized), nil
}
