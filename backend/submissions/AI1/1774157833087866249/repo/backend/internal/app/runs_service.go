package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"acp/backend/internal/domain"
	"acp/backend/internal/ports"
)

const createRunIdempotencyScope = "POST /runs"

type CreateRunStepRequest struct {
	ClientStepID string
	Name         string
	ExecutorType string
	Input        json.RawMessage
	MaxRetries   int
	IsFinancial  bool
	DependsOn    []string
}

type CreateRunRequest struct {
	AgentID            string
	PolicyContractAddr string
	Steps              []CreateRunStepRequest
	IdempotencyKey     string
}

type CreateRunResponse struct {
	RunID  string
	Status domain.RunStatus
}

type CancelRunResponse struct {
	RunID  string
	Status domain.RunStatus
}

type ApprovalActionResponse struct {
	ApprovalID string
	Status     domain.ApprovalStatus
}

type RunsService struct {
	repo         ports.RunsRepository
	policyReader ports.PolicyReader
	now          func() time.Time
	newID        func() string
}

func NewRunsService(
	repo ports.RunsRepository,
	policyReader ports.PolicyReader,
	now func() time.Time,
	newID func() string,
) *RunsService {
	if now == nil {
		now = func() time.Time { return time.Now().UTC() }
	}
	if newID == nil {
		newID = func() string { return uuid.NewString() }
	}
	return &RunsService{
		repo:         repo,
		policyReader: policyReader,
		now:          now,
		newID:        newID,
	}
}

func (s *RunsService) CreateRun(ctx context.Context, request CreateRunRequest) (CreateRunResponse, error) {
	if err := validateCreateRunRequest(request); err != nil {
		return CreateRunResponse{}, err
	}

	requestHash, err := computeCreateRunRequestHash(request)
	if err != nil {
		return CreateRunResponse{}, err
	}

	if strings.TrimSpace(request.IdempotencyKey) != "" {
		existing, err := s.repo.GetIdempotency(ctx, createRunIdempotencyScope, request.IdempotencyKey)
		if err != nil {
			return CreateRunResponse{}, err
		}
		if existing != nil {
			if existing.RequestHash != requestHash {
				return CreateRunResponse{}, &domain.PolicyViolationError{
					Reason: "idempotency key reuse with different payload",
				}
			}
			return CreateRunResponse{
				RunID:  existing.RunID,
				Status: domain.RunStatusRunning,
			}, nil
		}
	}

	if s.policyReader == nil {
		return CreateRunResponse{}, &domain.PolicyViolationError{
			Reason: "policy reader is not configured",
		}
	}

	onChainPolicy, err := s.policyReader.GetPolicy(ctx, request.PolicyContractAddr)
	if err != nil {
		return CreateRunResponse{}, &domain.PolicyViolationError{
			Reason: fmt.Sprintf("read on-chain policy: %v", err),
		}
	}

	now := s.now().UTC()
	runID := s.newID()
	params := ports.CreateRunWithPlanAndLedgerParams{
		RunID:              runID,
		AgentID:            request.AgentID,
		PolicyContractAddr: request.PolicyContractAddr,
		CreatedAt:          now,
		StartedAt:          now,
		BudgetID:           s.newID(),
		Budget: domain.Budget{
			Currency:     "nanotons",
			MaxSpendNano: onChainPolicy.MaxSpendNano,
			SpentNano:    0,
		},
		PolicySnapshot: domain.PolicySnapshot{
			PolicyContractAddr:    request.PolicyContractAddr,
			RequireApproval:       onChainPolicy.RequireApproval,
			MaxSpendNano:          onChainPolicy.MaxSpendNano,
			AllowedExecutorHashes: append([]string(nil), onChainPolicy.AllowedExecutorHashes...),
			FetchedAt:             onChainPolicy.FetchedAt.UTC(),
			PolicySeqno:           onChainPolicy.PolicySeqno,
		},
		Steps:             make([]ports.RunStepInput, 0, len(request.Steps)),
		RunCreatedEventID: s.newID(),
		RunStartedEventID: s.newID(),
	}
	for _, step := range request.Steps {
		input := step.Input
		if len(input) == 0 {
			input = json.RawMessage(`{}`)
		}
		params.Steps = append(params.Steps, ports.RunStepInput{
			ID:                     s.newID(),
			ClientStepID:           strings.TrimSpace(step.ClientStepID),
			Name:                   step.Name,
			ExecutorType:           step.ExecutorType,
			Input:                  input,
			MaxRetries:             step.MaxRetries,
			IsFinancial:            step.IsFinancial,
			DependsOnClientStepIDs: normalizeDependencyRefs(step.DependsOn),
		})
	}

	if strings.TrimSpace(request.IdempotencyKey) != "" {
		params.Idempotency = &ports.IdempotencyRecord{
			Scope:          createRunIdempotencyScope,
			IdempotencyKey: request.IdempotencyKey,
			RequestHash:    requestHash,
			CreatedAt:      now,
		}
	}

	createdRunID, err := s.repo.CreateRunWithPlanAndLedger(ctx, params)
	if err != nil {
		return CreateRunResponse{}, err
	}

	return CreateRunResponse{
		RunID:  createdRunID,
		Status: domain.RunStatusRunning,
	}, nil
}

func (s *RunsService) GetRun(ctx context.Context, runID string) (ports.GetRunByIDResult, error) {
	if strings.TrimSpace(runID) == "" {
		return ports.GetRunByIDResult{}, &domain.InvalidInputError{
			Field:  "run_id",
			Reason: "must not be empty",
		}
	}
	return s.repo.GetRunByID(ctx, runID)
}

func (s *RunsService) ListRunSteps(ctx context.Context, runID string) ([]ports.StepRecord, error) {
	if strings.TrimSpace(runID) == "" {
		return nil, &domain.InvalidInputError{
			Field:  "run_id",
			Reason: "must not be empty",
		}
	}
	return s.repo.ListRunSteps(ctx, runID)
}

func (s *RunsService) GetStep(ctx context.Context, stepID string) (ports.StepRecord, error) {
	if strings.TrimSpace(stepID) == "" {
		return ports.StepRecord{}, &domain.InvalidInputError{
			Field:  "step_id",
			Reason: "must not be empty",
		}
	}
	return s.repo.GetStepByID(ctx, stepID)
}

func (s *RunsService) ListRunEvents(ctx context.Context, runID string, limit int) ([]domain.Event, error) {
	if strings.TrimSpace(runID) == "" {
		return nil, &domain.InvalidInputError{
			Field:  "run_id",
			Reason: "must not be empty",
		}
	}
	return s.repo.ListRunEventsOrdered(ctx, runID, limit)
}

func (s *RunsService) CancelRun(ctx context.Context, runID string) (CancelRunResponse, error) {
	if strings.TrimSpace(runID) == "" {
		return CancelRunResponse{}, &domain.InvalidInputError{
			Field:  "run_id",
			Reason: "must not be empty",
		}
	}
	if err := s.repo.CancelRunWithLedger(ctx, runID, s.newID(), s.now().UTC()); err != nil {
		return CancelRunResponse{}, err
	}
	return CancelRunResponse{
		RunID:  runID,
		Status: domain.RunStatusCancelled,
	}, nil
}

func (s *RunsService) ApproveAction(ctx context.Context, approvalID string) (ApprovalActionResponse, error) {
	if strings.TrimSpace(approvalID) == "" {
		return ApprovalActionResponse{}, &domain.InvalidInputError{
			Field:  "approval_id",
			Reason: "must not be empty",
		}
	}
	record, err := s.repo.ResolveApprovalApprove(ctx, ports.ResolveApprovalApproveParams{
		ApprovalID:              approvalID,
		ResolvedAt:              s.now().UTC(),
		ApprovalReceivedEventID: s.newID(),
	})
	if err != nil {
		return ApprovalActionResponse{}, err
	}
	return ApprovalActionResponse{
		ApprovalID: record.ID,
		Status:     record.Status,
	}, nil
}

func (s *RunsService) RejectAction(ctx context.Context, approvalID string) (ApprovalActionResponse, error) {
	if strings.TrimSpace(approvalID) == "" {
		return ApprovalActionResponse{}, &domain.InvalidInputError{
			Field:  "approval_id",
			Reason: "must not be empty",
		}
	}
	record, err := s.repo.ResolveApprovalReject(ctx, ports.ResolveApprovalRejectParams{
		ApprovalID:              approvalID,
		ResolvedAt:              s.now().UTC(),
		ApprovalReceivedEventID: s.newID(),
		StepFailedEventID:       s.newID(),
		RunFailedEventID:        s.newID(),
	})
	if err != nil {
		return ApprovalActionResponse{}, err
	}
	return ApprovalActionResponse{
		ApprovalID: record.ID,
		Status:     record.Status,
	}, nil
}

func validateCreateRunRequest(request CreateRunRequest) error {
	if strings.TrimSpace(request.AgentID) == "" {
		return &domain.InvalidInputError{
			Field:  "agent_id",
			Reason: "must not be empty",
		}
	}
	if strings.TrimSpace(request.PolicyContractAddr) == "" {
		return &domain.InvalidInputError{
			Field:  "policy_contract_addr",
			Reason: "must not be empty",
		}
	}
	if len(request.Steps) == 0 {
		return &domain.InvalidInputError{
			Field:  "steps",
			Reason: "must contain at least one step",
		}
	}

	hasDependencies := false
	clientIDSet := make(map[string]struct{}, len(request.Steps))

	for i, step := range request.Steps {
		fieldPrefix := fmt.Sprintf("steps[%d]", i)
		if strings.TrimSpace(step.Name) == "" {
			return &domain.InvalidInputError{
				Field:  fieldPrefix + ".name",
				Reason: "must not be empty",
			}
		}
		step.ClientStepID = strings.TrimSpace(step.ClientStepID)
		if step.ClientStepID != "" {
			if _, exists := clientIDSet[step.ClientStepID]; exists {
				return &domain.InvalidInputError{
					Field:  fieldPrefix + ".client_step_id",
					Reason: "must be unique within run",
				}
			}
			clientIDSet[step.ClientStepID] = struct{}{}
		}
		if !domain.IsKnownExecutorType(step.ExecutorType) {
			return &domain.InvalidInputError{
				Field:  fieldPrefix + ".executor_type",
				Reason: "unsupported executor type",
			}
		}
		if step.MaxRetries < 0 {
			return &domain.InvariantError{
				Entity: "step",
				Field:  "max_retries",
				Value:  step.MaxRetries,
			}
		}
		if len(step.Input) > 0 {
			var payload any
			if err := json.Unmarshal(step.Input, &payload); err != nil {
				return &domain.InvalidInputError{
					Field:  fieldPrefix + ".input",
					Reason: "must be valid JSON object",
				}
			}
			if _, ok := payload.(map[string]any); !ok {
				return &domain.InvalidInputError{
					Field:  fieldPrefix + ".input",
					Reason: "must be JSON object",
				}
			}
		}
		if len(step.DependsOn) > 0 {
			hasDependencies = true
			seenDependsOn := make(map[string]struct{}, len(step.DependsOn))
			for depIndex, dep := range step.DependsOn {
				dep = strings.TrimSpace(dep)
				if dep == "" {
					return &domain.InvalidInputError{
						Field:  fmt.Sprintf("%s.depends_on[%d]", fieldPrefix, depIndex),
						Reason: "must not be empty",
					}
				}
				if _, exists := seenDependsOn[dep]; exists {
					return &domain.InvalidInputError{
						Field:  fieldPrefix + ".depends_on",
						Reason: "duplicate dependency reference",
					}
				}
				seenDependsOn[dep] = struct{}{}
			}
		}
	}

	if hasDependencies {
		for i, step := range request.Steps {
			if strings.TrimSpace(step.ClientStepID) == "" {
				return &domain.InvalidInputError{
					Field:  fmt.Sprintf("steps[%d].client_step_id", i),
					Reason: "required when depends_on is used in run",
				}
			}
		}
		for i, step := range request.Steps {
			selfID := strings.TrimSpace(step.ClientStepID)
			for depIndex, dep := range step.DependsOn {
				dep = strings.TrimSpace(dep)
				if _, exists := clientIDSet[dep]; !exists {
					return &domain.InvalidInputError{
						Field:  fmt.Sprintf("steps[%d].depends_on[%d]", i, depIndex),
						Reason: "references unknown client_step_id",
					}
				}
				if dep == selfID {
					return &domain.InvalidInputError{
						Field:  fmt.Sprintf("steps[%d].depends_on[%d]", i, depIndex),
						Reason: "self dependency is not allowed",
					}
				}
			}
		}
		if hasDependencyCycle(request.Steps) {
			return &domain.InvalidInputError{
				Field:  "steps.depends_on",
				Reason: "dependency graph must be acyclic",
			}
		}
	}

	return nil
}

type createRunHashPayload struct {
	AgentID            string              `json:"agent_id"`
	PolicyContractAddr string              `json:"policy_contract_addr"`
	Steps              []createRunHashStep `json:"steps"`
}

type createRunHashStep struct {
	ClientStepID string   `json:"client_step_id,omitempty"`
	Name         string   `json:"name"`
	ExecutorType string   `json:"executor_type"`
	Input        any      `json:"input"`
	MaxRetries   int      `json:"max_retries"`
	IsFinancial  bool     `json:"is_financial"`
	DependsOn    []string `json:"depends_on,omitempty"`
}

func computeCreateRunRequestHash(request CreateRunRequest) (string, error) {
	payload := createRunHashPayload{
		AgentID:            request.AgentID,
		PolicyContractAddr: request.PolicyContractAddr,
		Steps:              make([]createRunHashStep, 0, len(request.Steps)),
	}

	for i, step := range request.Steps {
		var input any = map[string]any{}
		if len(step.Input) > 0 {
			if err := json.Unmarshal(step.Input, &input); err != nil {
				return "", &domain.InvalidInputError{
					Field:  fmt.Sprintf("steps[%d].input", i),
					Reason: "must be valid JSON object",
				}
			}
			if _, ok := input.(map[string]any); !ok {
				return "", &domain.InvalidInputError{
					Field:  fmt.Sprintf("steps[%d].input", i),
					Reason: "must be JSON object",
				}
			}
		}

		payload.Steps = append(payload.Steps, createRunHashStep{
			ClientStepID: strings.TrimSpace(step.ClientStepID),
			Name:         step.Name,
			ExecutorType: step.ExecutorType,
			Input:        input,
			MaxRetries:   step.MaxRetries,
			IsFinancial:  step.IsFinancial,
			DependsOn:    normalizeDependencyRefs(step.DependsOn),
		})
	}

	encoded, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal create run hash payload: %w", err)
	}

	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:]), nil
}

func hasDependencyCycle(steps []CreateRunStepRequest) bool {
	edges := make(map[string][]string, len(steps))
	indegree := make(map[string]int, len(steps))

	for _, step := range steps {
		stepID := strings.TrimSpace(step.ClientStepID)
		if stepID == "" {
			continue
		}
		if _, exists := indegree[stepID]; !exists {
			indegree[stepID] = 0
		}
		for _, dep := range step.DependsOn {
			dep = strings.TrimSpace(dep)
			if dep == "" {
				continue
			}
			edges[dep] = append(edges[dep], stepID)
			indegree[stepID]++
		}
	}

	queue := make([]string, 0, len(indegree))
	for node, degree := range indegree {
		if degree == 0 {
			queue = append(queue, node)
		}
	}

	visited := 0
	for len(queue) > 0 {
		node := queue[0]
		queue = queue[1:]
		visited++

		for _, dependent := range edges[node] {
			indegree[dependent]--
			if indegree[dependent] == 0 {
				queue = append(queue, dependent)
			}
		}
	}

	return visited != len(indegree)
}

func normalizeDependencyRefs(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	normalized := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		normalized = append(normalized, trimmed)
	}
	return normalized
}
