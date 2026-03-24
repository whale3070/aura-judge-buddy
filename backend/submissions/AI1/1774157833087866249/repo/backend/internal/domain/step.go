package domain

type StepStatus string

const (
	StepStatusPending         StepStatus = "pending"
	StepStatusRunning         StepStatus = "running"
	StepStatusWaitingApproval StepStatus = "waiting_approval"
	StepStatusCompleted       StepStatus = "completed"
	StepStatusFailed          StepStatus = "failed"
	StepStatusRetrying        StepStatus = "retrying"
)

var stepAllowedTransitions = map[StepStatus]map[StepStatus]struct{}{
	StepStatusPending: {
		StepStatusRunning: {},
	},
	StepStatusRunning: {
		StepStatusWaitingApproval: {},
		StepStatusCompleted:       {},
		StepStatusFailed:          {},
	},
	StepStatusWaitingApproval: {
		StepStatusRunning: {},
	},
	StepStatusCompleted: {},
	StepStatusFailed: {
		StepStatusRetrying: {},
	},
	StepStatusRetrying: {
		StepStatusPending: {},
	},
}

type Step struct {
	id         string
	status     StepStatus
	attempt    int
	maxRetries int
}

func NewStep(id string, maxRetries int) (*Step, error) {
	return NewStepFromState(id, StepStatusPending, 0, maxRetries)
}

func NewStepFromState(id string, status StepStatus, attempt, maxRetries int) (*Step, error) {
	if !isKnownStepStatus(status) {
		return nil, &TransitionError{
			Entity: "step",
			From:   string(status),
			To:     string(status),
		}
	}
	if attempt < 0 {
		return nil, &InvariantError{
			Entity: "step",
			Field:  "attempt",
			Value:  attempt,
		}
	}
	if maxRetries < 0 {
		return nil, &InvariantError{
			Entity: "step",
			Field:  "max_retries",
			Value:  maxRetries,
		}
	}

	return &Step{
		id:         id,
		status:     status,
		attempt:    attempt,
		maxRetries: maxRetries,
	}, nil
}

func (s *Step) ID() string {
	return s.id
}

func (s *Step) Status() StepStatus {
	return s.status
}

func (s *Step) Attempt() int {
	return s.attempt
}

func (s *Step) MaxRetries() int {
	return s.maxRetries
}

func (s *Step) TransitionTo(next StepStatus) error {
	if !CanTransitionStep(s.status, next) {
		return &TransitionError{
			Entity: "step",
			From:   string(s.status),
			To:     string(next),
		}
	}

	s.status = next
	return nil
}

func (s *Step) ScheduleRetry() error {
	if s.status != StepStatusFailed {
		return &RetryStateError{
			Status:     s.status,
			Attempt:    s.attempt,
			MaxRetries: s.maxRetries,
			Reason:     "step status must be failed before scheduling retry",
		}
	}
	if s.attempt >= s.maxRetries {
		return &RetryStateError{
			Status:     s.status,
			Attempt:    s.attempt,
			MaxRetries: s.maxRetries,
			Reason:     "retry limit exhausted",
		}
	}
	if err := s.TransitionTo(StepStatusRetrying); err != nil {
		return err
	}

	s.attempt++

	if err := s.TransitionTo(StepStatusPending); err != nil {
		return err
	}

	return nil
}

func (s *Step) IsTerminalFailure() bool {
	return s.status == StepStatusFailed && s.attempt >= s.maxRetries
}

func CanTransitionStep(from, to StepStatus) bool {
	if _, ok := stepAllowedTransitions[from]; !ok {
		return false
	}
	_, ok := stepAllowedTransitions[from][to]
	return ok
}

func isKnownStepStatus(status StepStatus) bool {
	_, ok := stepAllowedTransitions[status]
	return ok
}
