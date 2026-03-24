package domain

type RunStatus string

const (
	RunStatusCreated         RunStatus = "created"
	RunStatusRunning         RunStatus = "running"
	RunStatusWaitingApproval RunStatus = "waiting_approval"
	RunStatusCompleted       RunStatus = "completed"
	RunStatusFailed          RunStatus = "failed"
	RunStatusCancelled       RunStatus = "cancelled"
)

var runAllowedTransitions = map[RunStatus]map[RunStatus]struct{}{
	RunStatusCreated: {
		RunStatusRunning: {},
	},
	RunStatusRunning: {
		RunStatusWaitingApproval: {},
		RunStatusCompleted:       {},
		RunStatusFailed:          {},
		RunStatusCancelled:       {},
	},
	RunStatusWaitingApproval: {
		RunStatusRunning:   {},
		RunStatusCancelled: {},
	},
	RunStatusCompleted: {},
	RunStatusFailed:    {},
	RunStatusCancelled: {},
}

type Run struct {
	id     string
	status RunStatus
}

func NewRun(id string) (*Run, error) {
	return &Run{
		id:     id,
		status: RunStatusCreated,
	}, nil
}

func NewRunFromState(id string, status RunStatus) (*Run, error) {
	if !isKnownRunStatus(status) {
		return nil, &TransitionError{
			Entity: "run",
			From:   string(status),
			To:     string(status),
		}
	}

	return &Run{
		id:     id,
		status: status,
	}, nil
}

func (r *Run) ID() string {
	return r.id
}

func (r *Run) Status() RunStatus {
	return r.status
}

func (r *Run) TransitionTo(next RunStatus) error {
	if !CanTransitionRun(r.status, next) {
		return &TransitionError{
			Entity: "run",
			From:   string(r.status),
			To:     string(next),
		}
	}

	r.status = next
	return nil
}

func CanTransitionRun(from, to RunStatus) bool {
	if _, ok := runAllowedTransitions[from]; !ok {
		return false
	}
	_, ok := runAllowedTransitions[from][to]
	return ok
}

func isKnownRunStatus(status RunStatus) bool {
	_, ok := runAllowedTransitions[status]
	return ok
}
