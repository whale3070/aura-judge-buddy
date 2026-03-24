package domain

import (
	"errors"
	"fmt"
)

var (
	ErrInvalidTransition     = errors.New("invalid state transition")
	ErrInvalidRetryState     = errors.New("invalid retry state")
	ErrInvalidInvariant      = errors.New("invalid invariant")
	ErrInvalidInput          = errors.New("invalid input")
	ErrInvalidEventType      = errors.New("invalid event type")
	ErrRunTransitionConflict = errors.New("run transition conflict")
	ErrRunNotFound           = errors.New("run not found")
	ErrStepNotFound          = errors.New("step not found")
	ErrApprovalNotFound      = errors.New("approval not found")
	ErrApprovalConflict      = errors.New("approval conflict")
	ErrBudgetExceeded        = errors.New("budget exceeded")
	ErrPolicyViolation       = errors.New("policy violation")
	ErrRunCancelled          = errors.New("run cancelled")
	ErrRunAnchorConflict     = errors.New("run anchor conflict")
)

type TransitionError struct {
	Entity string
	From   string
	To     string
}

func (e *TransitionError) Error() string {
	return fmt.Sprintf("%s transition %q -> %q is not allowed", e.Entity, e.From, e.To)
}

func (e *TransitionError) Unwrap() error {
	return ErrInvalidTransition
}

type RetryStateError struct {
	Status     StepStatus
	Attempt    int
	MaxRetries int
	Reason     string
}

func (e *RetryStateError) Error() string {
	return fmt.Sprintf(
		"retry is not allowed for status=%q attempt=%d max_retries=%d: %s",
		e.Status,
		e.Attempt,
		e.MaxRetries,
		e.Reason,
	)
}

func (e *RetryStateError) Unwrap() error {
	return ErrInvalidRetryState
}

type InvariantError struct {
	Entity string
	Field  string
	Value  int
}

func (e *InvariantError) Error() string {
	return fmt.Sprintf("%s invariant violated: %s=%d", e.Entity, e.Field, e.Value)
}

func (e *InvariantError) Unwrap() error {
	return ErrInvalidInvariant
}

type InvalidInputError struct {
	Field  string
	Reason string
}

func (e *InvalidInputError) Error() string {
	return fmt.Sprintf("invalid input: %s (%s)", e.Field, e.Reason)
}

func (e *InvalidInputError) Unwrap() error {
	return ErrInvalidInput
}

type InvalidEventTypeError struct {
	EventType string
}

func (e *InvalidEventTypeError) Error() string {
	return fmt.Sprintf("invalid event type: %q", e.EventType)
}

func (e *InvalidEventTypeError) Unwrap() error {
	return ErrInvalidEventType
}

type RunTransitionConflictError struct {
	RunID        string
	ExpectedFrom RunStatus
}

func (e *RunTransitionConflictError) Error() string {
	return fmt.Sprintf(
		"run transition conflict for run_id=%q expected_from=%q",
		e.RunID,
		e.ExpectedFrom,
	)
}

func (e *RunTransitionConflictError) Unwrap() error {
	return ErrRunTransitionConflict
}

type RunNotFoundError struct {
	RunID string
}

func (e *RunNotFoundError) Error() string {
	return fmt.Sprintf("run not found: %q", e.RunID)
}

func (e *RunNotFoundError) Unwrap() error {
	return ErrRunNotFound
}

type StepNotFoundError struct {
	StepID string
}

func (e *StepNotFoundError) Error() string {
	return fmt.Sprintf("step not found: %q", e.StepID)
}

func (e *StepNotFoundError) Unwrap() error {
	return ErrStepNotFound
}

type ApprovalNotFoundError struct {
	ApprovalID string
}

func (e *ApprovalNotFoundError) Error() string {
	return fmt.Sprintf("approval not found: %q", e.ApprovalID)
}

func (e *ApprovalNotFoundError) Unwrap() error {
	return ErrApprovalNotFound
}

type ApprovalConflictError struct {
	ApprovalID string
	Reason     string
}

func (e *ApprovalConflictError) Error() string {
	return fmt.Sprintf("approval conflict for %q: %s", e.ApprovalID, e.Reason)
}

func (e *ApprovalConflictError) Unwrap() error {
	return ErrApprovalConflict
}

type BudgetExceededError struct {
	RunID string
}

func (e *BudgetExceededError) Error() string {
	return fmt.Sprintf("budget exceeded for run: %q", e.RunID)
}

func (e *BudgetExceededError) Unwrap() error {
	return ErrBudgetExceeded
}

type PolicyViolationError struct {
	Reason string
}

func (e *PolicyViolationError) Error() string {
	return fmt.Sprintf("policy violation: %s", e.Reason)
}

func (e *PolicyViolationError) Unwrap() error {
	return ErrPolicyViolation
}

type RunCancelledError struct {
	RunID string
}

func (e *RunCancelledError) Error() string {
	return fmt.Sprintf("run is cancelled or terminal: %q", e.RunID)
}

func (e *RunCancelledError) Unwrap() error {
	return ErrRunCancelled
}

type RunAnchorConflictError struct {
	RunID  string
	Reason string
}

func (e *RunAnchorConflictError) Error() string {
	return fmt.Sprintf("run anchor conflict for %q: %s", e.RunID, e.Reason)
}

func (e *RunAnchorConflictError) Unwrap() error {
	return ErrRunAnchorConflict
}
