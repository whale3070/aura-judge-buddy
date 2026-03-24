package domain

import (
	"errors"
	"testing"
)

func TestValidateEventType(t *testing.T) {
	validTypes := []EventType{
		EventTypeRunCreated,
		EventTypeRunStarted,
		EventTypeStepStarted,
		EventTypeStepCompleted,
		EventTypeStepFailed,
		EventTypeStepRetried,
		EventTypeApprovalRequested,
		EventTypeApprovalReceived,
		EventTypeRunCompleted,
		EventTypeRunFailed,
		EventTypeRunCancelled,
		EventTypeRunAnchored,
	}

	for _, eventType := range validTypes {
		eventType := eventType
		t.Run(string(eventType), func(t *testing.T) {
			if err := ValidateEventType(eventType); err != nil {
				t.Fatalf("ValidateEventType(%q) unexpected error: %v", eventType, err)
			}
		})
	}

	t.Run("invalid_event_type", func(t *testing.T) {
		err := ValidateEventType(EventType("invalid_event"))
		if err == nil {
			t.Fatalf("ValidateEventType() expected error, got nil")
		}
		if !errors.Is(err, ErrInvalidEventType) {
			t.Fatalf("expected ErrInvalidEventType, got %v", err)
		}
		var typed *InvalidEventTypeError
		if !errors.As(err, &typed) {
			t.Fatalf("expected InvalidEventTypeError, got %T", err)
		}
	})
}
