package domain

import (
	"errors"
	"testing"
)

func TestLookupErrorsAreTyped(t *testing.T) {
	t.Run("step_not_found", func(t *testing.T) {
		err := &StepNotFoundError{StepID: "step-1"}
		if !errors.Is(err, ErrStepNotFound) {
			t.Fatalf("expected ErrStepNotFound, got %v", err)
		}
		var typed *StepNotFoundError
		if !errors.As(err, &typed) {
			t.Fatalf("errors.As(*StepNotFoundError) failed")
		}
	})

	t.Run("approval_not_found", func(t *testing.T) {
		err := &ApprovalNotFoundError{ApprovalID: "appr-1"}
		if !errors.Is(err, ErrApprovalNotFound) {
			t.Fatalf("expected ErrApprovalNotFound, got %v", err)
		}
		var typed *ApprovalNotFoundError
		if !errors.As(err, &typed) {
			t.Fatalf("errors.As(*ApprovalNotFoundError) failed")
		}
	})

	t.Run("approval_conflict", func(t *testing.T) {
		err := &ApprovalConflictError{ApprovalID: "appr-1", Reason: "already resolved"}
		if !errors.Is(err, ErrApprovalConflict) {
			t.Fatalf("expected ErrApprovalConflict, got %v", err)
		}
		var typed *ApprovalConflictError
		if !errors.As(err, &typed) {
			t.Fatalf("errors.As(*ApprovalConflictError) failed")
		}
	})
}
