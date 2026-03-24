package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"acp/backend/internal/domain"
	"acp/backend/internal/ports"
)

func TestIntegrationAtomicTransitionRunWithEventSuccess(t *testing.T) {
	db := openIntegrationDBOrSkip(t)
	resetSchema(t, db)

	repo := NewRunLedgerRepository(db)
	now := time.Now().UTC()

	mustExec(t, db, `
		INSERT INTO runs (id, agent_id, status, policy_contract_addr, created_at)
		VALUES ('11111111-1111-1111-1111-111111111111', 'agent-1', 'created', 'kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6', $1)
	`, now)

	seq, err := repo.AtomicTransitionRunWithEvent(context.Background(), ports.AtomicTransitionRunWithEventParams{
		RunID:        "11111111-1111-1111-1111-111111111111",
		ExpectedFrom: domain.RunStatusCreated,
		NextStatus:   domain.RunStatusRunning,
		EventID:      "22222222-2222-2222-2222-222222222222",
		EventType:    domain.EventTypeRunStarted,
		Payload:      json.RawMessage(`{"source":"integration"}`),
		CreatedAt:    now.Add(time.Second),
	})
	if err != nil {
		t.Fatalf("AtomicTransitionRunWithEvent() unexpected error: %v", err)
	}
	if seq <= 0 {
		t.Fatalf("expected positive event seq, got %d", seq)
	}

	var status string
	if err := db.QueryRow(`SELECT status FROM runs WHERE id = '11111111-1111-1111-1111-111111111111'`).Scan(&status); err != nil {
		t.Fatalf("query run status failed: %v", err)
	}
	if status != "running" {
		t.Fatalf("run status mismatch: got %q want %q", status, "running")
	}

	var eventCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM events WHERE run_id = '11111111-1111-1111-1111-111111111111'`).Scan(&eventCount); err != nil {
		t.Fatalf("query events count failed: %v", err)
	}
	if eventCount != 1 {
		t.Fatalf("event count mismatch: got %d want 1", eventCount)
	}
}

func TestIntegrationAtomicTransitionRunWithEventConflict(t *testing.T) {
	db := openIntegrationDBOrSkip(t)
	resetSchema(t, db)

	repo := NewRunLedgerRepository(db)
	now := time.Now().UTC()

	mustExec(t, db, `
		INSERT INTO runs (id, agent_id, status, policy_contract_addr, created_at)
		VALUES ('33333333-3333-3333-3333-333333333333', 'agent-2', 'running', 'kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6', $1)
	`, now)

	_, err := repo.AtomicTransitionRunWithEvent(context.Background(), ports.AtomicTransitionRunWithEventParams{
		RunID:        "33333333-3333-3333-3333-333333333333",
		ExpectedFrom: domain.RunStatusCreated,
		NextStatus:   domain.RunStatusCompleted,
		EventID:      "44444444-4444-4444-4444-444444444444",
		EventType:    domain.EventTypeRunCompleted,
		Payload:      json.RawMessage(`{}`),
		CreatedAt:    now.Add(time.Second),
	})
	if err == nil {
		t.Fatalf("AtomicTransitionRunWithEvent() expected error, got nil")
	}
	if !errors.Is(err, domain.ErrRunTransitionConflict) {
		t.Fatalf("expected ErrRunTransitionConflict, got %v", err)
	}

	var status string
	if err := db.QueryRow(`SELECT status FROM runs WHERE id = '33333333-3333-3333-3333-333333333333'`).Scan(&status); err != nil {
		t.Fatalf("query run status failed: %v", err)
	}
	if status != "running" {
		t.Fatalf("run status changed unexpectedly: got %q want %q", status, "running")
	}

	var eventCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM events WHERE run_id = '33333333-3333-3333-3333-333333333333'`).Scan(&eventCount); err != nil {
		t.Fatalf("query events count failed: %v", err)
	}
	if eventCount != 0 {
		t.Fatalf("event count mismatch: got %d want 0", eventCount)
	}
}

func TestIntegrationAtomicTransitionRunWithEventRollbackOnInsertFailure(t *testing.T) {
	db := openIntegrationDBOrSkip(t)
	resetSchema(t, db)

	repo := NewRunLedgerRepository(db)
	now := time.Now().UTC()

	mustExec(t, db, `
		INSERT INTO runs (id, agent_id, status, policy_contract_addr, created_at)
		VALUES ('55555555-5555-5555-5555-555555555555', 'agent-3', 'created', 'kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6', $1)
	`, now)

	_, err := repo.AtomicTransitionRunWithEvent(context.Background(), ports.AtomicTransitionRunWithEventParams{
		RunID:        "55555555-5555-5555-5555-555555555555",
		ExpectedFrom: domain.RunStatusCreated,
		NextStatus:   domain.RunStatusRunning,
		EventID:      "66666666-6666-6666-6666-666666666666",
		EventType:    domain.EventType("invalid_event"),
		Payload:      json.RawMessage(`{}`),
		CreatedAt:    now.Add(time.Second),
	})
	if err == nil {
		t.Fatalf("AtomicTransitionRunWithEvent() expected error, got nil")
	}

	var status string
	if err := db.QueryRow(`SELECT status FROM runs WHERE id = '55555555-5555-5555-5555-555555555555'`).Scan(&status); err != nil {
		t.Fatalf("query run status failed: %v", err)
	}
	if status != "created" {
		t.Fatalf("run status changed unexpectedly after rollback: got %q want %q", status, "created")
	}

	var eventCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM events WHERE run_id = '55555555-5555-5555-5555-555555555555'`).Scan(&eventCount); err != nil {
		t.Fatalf("query events count failed: %v", err)
	}
	if eventCount != 0 {
		t.Fatalf("event count mismatch: got %d want 0", eventCount)
	}
}

func TestIntegrationListRunEventsOrdered(t *testing.T) {
	db := openIntegrationDBOrSkip(t)
	resetSchema(t, db)

	repo := NewRunLedgerRepository(db)
	now := time.Now().UTC()

	mustExec(t, db, `
		INSERT INTO runs (id, agent_id, status, policy_contract_addr, created_at)
		VALUES ('77777777-7777-7777-7777-777777777777', 'agent-4', 'created', 'kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6', $1)
	`, now)

	firstSeq, err := repo.AtomicTransitionRunWithEvent(context.Background(), ports.AtomicTransitionRunWithEventParams{
		RunID:        "77777777-7777-7777-7777-777777777777",
		ExpectedFrom: domain.RunStatusCreated,
		NextStatus:   domain.RunStatusRunning,
		EventID:      "88888888-8888-8888-8888-888888888888",
		EventType:    domain.EventTypeRunStarted,
		Payload:      json.RawMessage(`{"n":1}`),
		CreatedAt:    now.Add(time.Second),
	})
	if err != nil {
		t.Fatalf("first AtomicTransitionRunWithEvent() unexpected error: %v", err)
	}

	secondSeq, err := repo.AtomicTransitionRunWithEvent(context.Background(), ports.AtomicTransitionRunWithEventParams{
		RunID:        "77777777-7777-7777-7777-777777777777",
		ExpectedFrom: domain.RunStatusRunning,
		NextStatus:   domain.RunStatusFailed,
		EventID:      "99999999-9999-9999-9999-999999999999",
		EventType:    domain.EventTypeRunFailed,
		Payload:      json.RawMessage(`{"n":2}`),
		CreatedAt:    now.Add(2 * time.Second),
	})
	if err != nil {
		t.Fatalf("second AtomicTransitionRunWithEvent() unexpected error: %v", err)
	}

	events, err := repo.ListRunEventsOrdered(context.Background(), "77777777-7777-7777-7777-777777777777", 10)
	if err != nil {
		t.Fatalf("ListRunEventsOrdered() unexpected error: %v", err)
	}
	if len(events) != 2 {
		t.Fatalf("events length mismatch: got %d want 2", len(events))
	}
	if events[0].Seq != firstSeq || events[1].Seq != secondSeq {
		t.Fatalf("seq mismatch: got [%d,%d] want [%d,%d]", events[0].Seq, events[1].Seq, firstSeq, secondSeq)
	}
	if events[0].Seq >= events[1].Seq {
		t.Fatalf("events are not ordered by seq ASC: [%d,%d]", events[0].Seq, events[1].Seq)
	}
	if events[0].EventType != domain.EventTypeRunStarted {
		t.Fatalf("events[0].EventType=%q, want %q", events[0].EventType, domain.EventTypeRunStarted)
	}
	if events[1].EventType != domain.EventTypeRunFailed {
		t.Fatalf("events[1].EventType=%q, want %q", events[1].EventType, domain.EventTypeRunFailed)
	}
}

func openIntegrationDBOrSkip(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("ACP_TEST_PG_DSN")
	if dsn == "" {
		t.Skip("ACP_TEST_PG_DSN is not set; skipping integration test")
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("sql.Open() failed: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	if err := db.Ping(); err != nil {
		t.Fatalf("db.Ping() failed: %v", err)
	}
	return db
}

func resetSchema(t *testing.T, db *sql.DB) {
	t.Helper()

	migrationsDir := getMigrationsDir(t)
	mustExec(t, db, `DROP TABLE IF EXISTS policy_cache, policy_refs, idempotency_keys, step_dependencies, executors, approvals, policies, budgets, events, steps, runs CASCADE`)

	for _, name := range []string{
		"0001_core_tables.up.sql",
		"0002_core_indexes_constraints.up.sql",
		"0003_events_ordering_and_type_constraints.up.sql",
		"0004_idempotency_keys.up.sql",
		"0005_step_dependencies.up.sql",
		"0006_step_financial_flag.up.sql",
		"0010_policy_contract_additive.up.sql",
		"0011_policy_contract_cutover.up.sql",
		"0012_run_anchored_event_contract.up.sql",
	} {
		sqlText, err := os.ReadFile(filepath.Join(migrationsDir, name))
		if err != nil {
			t.Fatalf("ReadFile(%q) failed: %v", name, err)
		}
		if _, err := db.Exec(string(sqlText)); err != nil {
			t.Fatalf("applying migration %q failed: %v", name, err)
		}
	}
}

func getMigrationsDir(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatalf("runtime.Caller() failed")
	}
	root := filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", "..", "..", ".."))
	return filepath.Join(root, "db", "migrations")
}

func mustExec(t *testing.T, db *sql.DB, query string, args ...any) {
	t.Helper()
	if _, err := db.Exec(query, args...); err != nil {
		t.Fatalf("Exec failed for query %q: %v", query, err)
	}
}
