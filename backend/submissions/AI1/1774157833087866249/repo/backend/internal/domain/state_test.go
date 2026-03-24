package domain

import (
	"errors"
	"testing"
)

func TestNewRunInitialState(t *testing.T) {
	run, err := NewRun("run-1")
	if err != nil {
		t.Fatalf("NewRun() unexpected error: %v", err)
	}

	if got, want := run.Status(), RunStatusCreated; got != want {
		t.Fatalf("run initial status mismatch: got %q want %q", got, want)
	}
}

func TestRunTransitionMatrix(t *testing.T) {
	statuses := []RunStatus{
		RunStatusCreated,
		RunStatusRunning,
		RunStatusWaitingApproval,
		RunStatusCompleted,
		RunStatusFailed,
		RunStatusCancelled,
	}

	allowed := map[RunStatus]map[RunStatus]bool{
		RunStatusCreated: {
			RunStatusRunning: true,
		},
		RunStatusRunning: {
			RunStatusWaitingApproval: true,
			RunStatusCompleted:       true,
			RunStatusFailed:          true,
			RunStatusCancelled:       true,
		},
		RunStatusWaitingApproval: {
			RunStatusRunning:   true,
			RunStatusCancelled: true,
		},
		RunStatusCompleted: {},
		RunStatusFailed:    {},
		RunStatusCancelled: {},
	}

	for _, from := range statuses {
		for _, to := range statuses {
			name := string(from) + "->" + string(to)
			t.Run(name, func(t *testing.T) {
				wantAllowed := allowed[from][to]
				if got := CanTransitionRun(from, to); got != wantAllowed {
					t.Fatalf("CanTransitionRun(%q, %q) = %v, want %v", from, to, got, wantAllowed)
				}

				run, err := NewRunFromState("run-x", from)
				if err != nil {
					t.Fatalf("NewRunFromState() unexpected error: %v", err)
				}

				err = run.TransitionTo(to)
				if wantAllowed {
					if err != nil {
						t.Fatalf("TransitionTo(%q) unexpected error: %v", to, err)
					}
					if got := run.Status(); got != to {
						t.Fatalf("status mismatch after transition: got %q want %q", got, to)
					}
					return
				}

				if err == nil {
					t.Fatalf("TransitionTo(%q) expected error, got nil", to)
				}
				if !errors.Is(err, ErrInvalidTransition) {
					t.Fatalf("expected ErrInvalidTransition, got %v", err)
				}
				var terr *TransitionError
				if !errors.As(err, &terr) {
					t.Fatalf("expected TransitionError, got %T", err)
				}
			})
		}
	}
}

func TestNewStepInitialState(t *testing.T) {
	step, err := NewStep("step-1", 3)
	if err != nil {
		t.Fatalf("NewStep() unexpected error: %v", err)
	}

	if got, want := step.Status(), StepStatusPending; got != want {
		t.Fatalf("step initial status mismatch: got %q want %q", got, want)
	}
	if got, want := step.Attempt(), 0; got != want {
		t.Fatalf("step initial attempt mismatch: got %d want %d", got, want)
	}
	if got, want := step.MaxRetries(), 3; got != want {
		t.Fatalf("step max retries mismatch: got %d want %d", got, want)
	}
}

func TestStepTransitionMatrix(t *testing.T) {
	statuses := []StepStatus{
		StepStatusPending,
		StepStatusRunning,
		StepStatusWaitingApproval,
		StepStatusCompleted,
		StepStatusFailed,
		StepStatusRetrying,
	}

	allowed := map[StepStatus]map[StepStatus]bool{
		StepStatusPending: {
			StepStatusRunning: true,
		},
		StepStatusRunning: {
			StepStatusWaitingApproval: true,
			StepStatusCompleted:       true,
			StepStatusFailed:          true,
		},
		StepStatusWaitingApproval: {
			StepStatusRunning: true,
		},
		StepStatusCompleted: {},
		StepStatusFailed: {
			StepStatusRetrying: true,
		},
		StepStatusRetrying: {
			StepStatusPending: true,
		},
	}

	for _, from := range statuses {
		for _, to := range statuses {
			name := string(from) + "->" + string(to)
			t.Run(name, func(t *testing.T) {
				wantAllowed := allowed[from][to]
				if got := CanTransitionStep(from, to); got != wantAllowed {
					t.Fatalf("CanTransitionStep(%q, %q) = %v, want %v", from, to, got, wantAllowed)
				}

				step, err := NewStepFromState("step-x", from, 0, 3)
				if err != nil {
					t.Fatalf("NewStepFromState() unexpected error: %v", err)
				}

				err = step.TransitionTo(to)
				if wantAllowed {
					if err != nil {
						t.Fatalf("TransitionTo(%q) unexpected error: %v", to, err)
					}
					if got := step.Status(); got != to {
						t.Fatalf("status mismatch after transition: got %q want %q", got, to)
					}
					return
				}

				if err == nil {
					t.Fatalf("TransitionTo(%q) expected error, got nil", to)
				}
				if !errors.Is(err, ErrInvalidTransition) {
					t.Fatalf("expected ErrInvalidTransition, got %v", err)
				}
				var terr *TransitionError
				if !errors.As(err, &terr) {
					t.Fatalf("expected TransitionError, got %T", err)
				}
			})
		}
	}
}

func TestScheduleRetry(t *testing.T) {
	t.Run("succeeds_and_moves_failed_retrying_pending", func(t *testing.T) {
		step, err := NewStepFromState("step-r1", StepStatusFailed, 0, 2)
		if err != nil {
			t.Fatalf("NewStepFromState() unexpected error: %v", err)
		}

		if err := step.ScheduleRetry(); err != nil {
			t.Fatalf("ScheduleRetry() unexpected error: %v", err)
		}

		if got, want := step.Status(), StepStatusPending; got != want {
			t.Fatalf("status mismatch after retry schedule: got %q want %q", got, want)
		}
		if got, want := step.Attempt(), 1; got != want {
			t.Fatalf("attempt mismatch after retry schedule: got %d want %d", got, want)
		}
	})

	t.Run("fails_when_not_failed_state", func(t *testing.T) {
		step, err := NewStepFromState("step-r2", StepStatusRunning, 0, 2)
		if err != nil {
			t.Fatalf("NewStepFromState() unexpected error: %v", err)
		}

		err = step.ScheduleRetry()
		if err == nil {
			t.Fatalf("ScheduleRetry() expected error, got nil")
		}
		if !errors.Is(err, ErrInvalidRetryState) {
			t.Fatalf("expected ErrInvalidRetryState, got %v", err)
		}
		var rerr *RetryStateError
		if !errors.As(err, &rerr) {
			t.Fatalf("expected RetryStateError, got %T", err)
		}
	})

	t.Run("fails_when_retry_exhausted", func(t *testing.T) {
		step, err := NewStepFromState("step-r3", StepStatusFailed, 2, 2)
		if err != nil {
			t.Fatalf("NewStepFromState() unexpected error: %v", err)
		}

		err = step.ScheduleRetry()
		if err == nil {
			t.Fatalf("ScheduleRetry() expected error, got nil")
		}
		if !errors.Is(err, ErrInvalidRetryState) {
			t.Fatalf("expected ErrInvalidRetryState, got %v", err)
		}
		if got, want := step.Status(), StepStatusFailed; got != want {
			t.Fatalf("status changed unexpectedly: got %q want %q", got, want)
		}
		if got, want := step.Attempt(), 2; got != want {
			t.Fatalf("attempt changed unexpectedly: got %d want %d", got, want)
		}
	})
}

func TestStepTerminalFailureCondition(t *testing.T) {
	tests := []struct {
		name       string
		status     StepStatus
		attempt    int
		maxRetries int
		want       bool
	}{
		{
			name:       "failed_and_equal_to_max",
			status:     StepStatusFailed,
			attempt:    3,
			maxRetries: 3,
			want:       true,
		},
		{
			name:       "failed_and_above_max",
			status:     StepStatusFailed,
			attempt:    4,
			maxRetries: 3,
			want:       true,
		},
		{
			name:       "failed_but_retry_available",
			status:     StepStatusFailed,
			attempt:    1,
			maxRetries: 3,
			want:       false,
		},
		{
			name:       "non_failed_state",
			status:     StepStatusRunning,
			attempt:    3,
			maxRetries: 3,
			want:       false,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			step, err := NewStepFromState("step-t", tt.status, tt.attempt, tt.maxRetries)
			if err != nil {
				t.Fatalf("NewStepFromState() unexpected error: %v", err)
			}

			if got := step.IsTerminalFailure(); got != tt.want {
				t.Fatalf("IsTerminalFailure() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestStepInvariants(t *testing.T) {
	tests := []struct {
		name       string
		status     StepStatus
		attempt    int
		maxRetries int
	}{
		{
			name:       "negative_attempt",
			status:     StepStatusPending,
			attempt:    -1,
			maxRetries: 3,
		},
		{
			name:       "negative_max_retries",
			status:     StepStatusPending,
			attempt:    0,
			maxRetries: -1,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			_, err := NewStepFromState("step-i", tt.status, tt.attempt, tt.maxRetries)
			if err == nil {
				t.Fatalf("NewStepFromState() expected error, got nil")
			}
			if !errors.Is(err, ErrInvalidInvariant) {
				t.Fatalf("expected ErrInvalidInvariant, got %v", err)
			}
			var ierr *InvariantError
			if !errors.As(err, &ierr) {
				t.Fatalf("expected InvariantError, got %T", err)
			}
		})
	}
}
