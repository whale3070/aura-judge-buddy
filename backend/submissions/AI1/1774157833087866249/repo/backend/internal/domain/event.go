package domain

import (
	"encoding/json"
	"time"
)

type EventType string

const (
	EventTypeRunCreated        EventType = "run_created"
	EventTypeRunStarted        EventType = "run_started"
	EventTypeStepStarted       EventType = "step_started"
	EventTypeStepCompleted     EventType = "step_completed"
	EventTypeStepFailed        EventType = "step_failed"
	EventTypeStepRetried       EventType = "step_retried"
	EventTypeApprovalRequested EventType = "approval_requested"
	EventTypeApprovalReceived  EventType = "approval_received"
	EventTypeRunCompleted      EventType = "run_completed"
	EventTypeRunFailed         EventType = "run_failed"
	EventTypeRunCancelled      EventType = "run_cancelled"
	EventTypeRunAnchored       EventType = "run_anchored"
)

var knownEventTypes = map[EventType]struct{}{
	EventTypeRunCreated:        {},
	EventTypeRunStarted:        {},
	EventTypeStepStarted:       {},
	EventTypeStepCompleted:     {},
	EventTypeStepFailed:        {},
	EventTypeStepRetried:       {},
	EventTypeApprovalRequested: {},
	EventTypeApprovalReceived:  {},
	EventTypeRunCompleted:      {},
	EventTypeRunFailed:         {},
	EventTypeRunCancelled:      {},
	EventTypeRunAnchored:       {},
}

func ValidateEventType(eventType EventType) error {
	if _, ok := knownEventTypes[eventType]; !ok {
		return &InvalidEventTypeError{
			EventType: string(eventType),
		}
	}
	return nil
}

type Event struct {
	ID        string
	RunID     string
	StepID    *string
	EventType EventType
	Payload   json.RawMessage
	CreatedAt time.Time
	Seq       int64
}
