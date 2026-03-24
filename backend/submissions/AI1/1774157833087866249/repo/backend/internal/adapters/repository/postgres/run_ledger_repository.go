package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"acp/backend/internal/domain"
	"acp/backend/internal/ports"
)

type RunLedgerRepository struct {
	db *sql.DB
}

func NewRunLedgerRepository(db *sql.DB) *RunLedgerRepository {
	return &RunLedgerRepository{db: db}
}

func (r *RunLedgerRepository) AtomicTransitionRunWithEvent(
	ctx context.Context,
	params ports.AtomicTransitionRunWithEventParams,
) (int64, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("begin tx: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	result, err := tx.ExecContext(
		ctx,
		`UPDATE runs
		   SET status = $1
		 WHERE id = $2
		   AND status = $3`,
		params.NextStatus,
		params.RunID,
		params.ExpectedFrom,
	)
	if err != nil {
		return 0, fmt.Errorf("update run status: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("read update rows affected: %w", err)
	}
	if rowsAffected == 0 {
		var exists bool
		if err := tx.QueryRowContext(
			ctx,
			`SELECT EXISTS(SELECT 1 FROM runs WHERE id = $1)`,
			params.RunID,
		).Scan(&exists); err != nil {
			return 0, fmt.Errorf("check run existence: %w", err)
		}
		if !exists {
			return 0, &domain.RunNotFoundError{RunID: params.RunID}
		}
		return 0, &domain.RunTransitionConflictError{
			RunID:        params.RunID,
			ExpectedFrom: params.ExpectedFrom,
		}
	}

	payload := params.Payload
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}

	var seq int64
	if err := tx.QueryRowContext(
		ctx,
		`INSERT INTO events (
		     id,
		     run_id,
		     step_id,
		     event_type,
		     payload,
		     created_at
		   )
		   VALUES ($1, $2, NULL, $3, $4::jsonb, $5)
		   RETURNING seq`,
		params.EventID,
		params.RunID,
		params.EventType,
		payload,
		params.CreatedAt,
	).Scan(&seq); err != nil {
		return 0, fmt.Errorf("insert event: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit tx: %w", err)
	}
	committed = true

	return seq, nil
}

func (r *RunLedgerRepository) ListRunEventsOrdered(
	ctx context.Context,
	runID string,
	limit int,
) ([]domain.Event, error) {
	if limit <= 0 {
		limit = 100
	}

	rows, err := r.db.QueryContext(
		ctx,
		`SELECT id, run_id, step_id, event_type, payload, created_at, seq
		   FROM events
		  WHERE run_id = $1
		  ORDER BY seq ASC
		  LIMIT $2`,
		runID,
		limit,
	)
	if err != nil {
		return nil, fmt.Errorf("select ordered events: %w", err)
	}
	defer rows.Close()

	events := make([]domain.Event, 0, limit)
	for rows.Next() {
		var (
			event      domain.Event
			stepID     sql.NullString
			eventType  string
			payloadRaw []byte
		)
		if err := rows.Scan(
			&event.ID,
			&event.RunID,
			&stepID,
			&eventType,
			&payloadRaw,
			&event.CreatedAt,
			&event.Seq,
		); err != nil {
			return nil, fmt.Errorf("scan event row: %w", err)
		}

		if stepID.Valid {
			s := stepID.String
			event.StepID = &s
		}
		event.EventType = domain.EventType(eventType)
		event.Payload = json.RawMessage(payloadRaw)
		events = append(events, event)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate event rows: %w", err)
	}

	if len(events) == 0 {
		var exists bool
		if err := r.db.QueryRowContext(
			ctx,
			`SELECT EXISTS(SELECT 1 FROM runs WHERE id = $1)`,
			runID,
		).Scan(&exists); err != nil {
			return nil, fmt.Errorf("check run existence for events: %w", err)
		}
		if !exists {
			return nil, &domain.RunNotFoundError{RunID: runID}
		}
	}

	return events, nil
}

func (r *RunLedgerRepository) ListRunEventsForAnchor(ctx context.Context, runID string) ([]domain.Event, error) {
	rows, err := r.db.QueryContext(
		ctx,
		`SELECT id, run_id, step_id, event_type, payload, created_at, seq
		   FROM events
		  WHERE run_id = $1
		  ORDER BY seq ASC`,
		runID,
	)
	if err != nil {
		return nil, fmt.Errorf("select anchor events: %w", err)
	}
	defer rows.Close()

	events := make([]domain.Event, 0, 64)
	for rows.Next() {
		var (
			event      domain.Event
			stepID     sql.NullString
			eventType  string
			payloadRaw []byte
		)
		if err := rows.Scan(
			&event.ID,
			&event.RunID,
			&stepID,
			&eventType,
			&payloadRaw,
			&event.CreatedAt,
			&event.Seq,
		); err != nil {
			return nil, fmt.Errorf("scan anchor event row: %w", err)
		}

		if stepID.Valid {
			s := stepID.String
			event.StepID = &s
		}
		event.EventType = domain.EventType(eventType)
		event.Payload = json.RawMessage(payloadRaw)
		events = append(events, event)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate anchor event rows: %w", err)
	}

	if len(events) == 0 {
		var exists bool
		if err := r.db.QueryRowContext(
			ctx,
			`SELECT EXISTS(SELECT 1 FROM runs WHERE id = $1)`,
			runID,
		).Scan(&exists); err != nil {
			return nil, fmt.Errorf("check run existence for anchor events: %w", err)
		}
		if !exists {
			return nil, &domain.RunNotFoundError{RunID: runID}
		}
	}

	return events, nil
}
