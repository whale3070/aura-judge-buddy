package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"acp/backend/internal/domain"
	"acp/backend/internal/ports"
)

func TestIntegrationCreateRunWithOnChainPolicySnapshot(t *testing.T) {
	db := openIntegrationDBOrSkip(t)
	resetSchema(t, db)

	repo := NewRunsRepository(db)
	now := time.Now().UTC()

	runID, err := repo.CreateRunWithPlanAndLedger(context.Background(), ports.CreateRunWithPlanAndLedgerParams{
		RunID:              "11111111-1111-1111-1111-111111111111",
		AgentID:            "agent-1",
		PolicyContractAddr: "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
		CreatedAt:          now,
		StartedAt:          now,
		BudgetID:           "22222222-2222-2222-2222-222222222222",
		Budget: domain.Budget{
			Currency:     "nanotons",
			MaxSpendNano: 5000000000,
			SpentNano:    0,
		},
		PolicySnapshot: domain.PolicySnapshot{
			PolicyContractAddr:    "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
			RequireApproval:       true,
			MaxSpendNano:          5000000000,
			AllowedExecutorHashes: []string{"abc"},
			FetchedAt:             now,
			PolicySeqno:           7,
		},
		Steps: []ports.RunStepInput{
			{
				ID:           "33333333-3333-3333-3333-333333333333",
				ClientStepID: "s1",
				Name:         "fetch",
				ExecutorType: "http",
				Input:        json.RawMessage(`{"url":"https://example.com"}`),
				MaxRetries:   1,
			},
		},
		RunCreatedEventID: "44444444-4444-4444-4444-444444444444",
		RunStartedEventID: "55555555-5555-5555-5555-555555555555",
	})
	if err != nil {
		t.Fatalf("CreateRunWithPlanAndLedger() unexpected error: %v", err)
	}
	if runID != "11111111-1111-1111-1111-111111111111" {
		t.Fatalf("runID=%q, want fixed id", runID)
	}

	assertCount(t, db, "SELECT COUNT(*) FROM policy_refs WHERE run_id = '11111111-1111-1111-1111-111111111111'", 1)
	assertCount(t, db, "SELECT COUNT(*) FROM policy_cache WHERE run_id = '11111111-1111-1111-1111-111111111111'", 1)
	assertCount(t, db, "SELECT COUNT(*) FROM pg_class WHERE relname = 'policies'", 0)
}

func TestIntegrationGetRunByIDReturnsTONFields(t *testing.T) {
	db := openIntegrationDBOrSkip(t)
	resetSchema(t, db)
	repo := NewRunsRepository(db)
	now := time.Now().UTC()

	_, err := repo.CreateRunWithPlanAndLedger(context.Background(), ports.CreateRunWithPlanAndLedgerParams{
		RunID:              "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
		AgentID:            "agent-1",
		PolicyContractAddr: "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
		CreatedAt:          now,
		StartedAt:          now,
		BudgetID:           "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
		Budget: domain.Budget{
			Currency:     "nanotons",
			MaxSpendNano: 123,
			SpentNano:    0,
		},
		PolicySnapshot: domain.PolicySnapshot{
			PolicyContractAddr:    "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
			RequireApproval:       false,
			MaxSpendNano:          123,
			AllowedExecutorHashes: []string{},
			FetchedAt:             now,
			PolicySeqno:           1,
		},
		Steps: []ports.RunStepInput{
			{ID: "cccccccc-cccc-cccc-cccc-cccccccccccc", Name: "fetch", ExecutorType: "http"},
		},
		RunCreatedEventID: "dddddddd-dddd-dddd-dddd-dddddddddddd",
		RunStartedEventID: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
	})
	if err != nil {
		t.Fatalf("CreateRunWithPlanAndLedger() unexpected error: %v", err)
	}

	got, err := repo.GetRunByID(context.Background(), "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	if err != nil {
		t.Fatalf("GetRunByID() unexpected error: %v", err)
	}
	if got.PolicyContractAddr == "" {
		t.Fatalf("PolicyContractAddr is empty")
	}
	if got.PolicySnapshot == nil {
		t.Fatalf("PolicySnapshot is nil")
	}
	if got.Budget.MaxSpendNano != 123 {
		t.Fatalf("max_spend_nano=%d, want 123", got.Budget.MaxSpendNano)
	}
}

func TestIntegrationApplyPolicySnapshotUpdatesBudgetAndCache(t *testing.T) {
	db := openIntegrationDBOrSkip(t)
	resetSchema(t, db)
	repo := NewRunsRepository(db)
	now := time.Now().UTC()

	_, err := repo.CreateRunWithPlanAndLedger(context.Background(), ports.CreateRunWithPlanAndLedgerParams{
		RunID:              "ffffffff-ffff-ffff-ffff-ffffffffffff",
		AgentID:            "agent-1",
		PolicyContractAddr: "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
		CreatedAt:          now,
		StartedAt:          now,
		BudgetID:           "12121212-1212-1212-1212-121212121212",
		Budget: domain.Budget{
			Currency:     "nanotons",
			MaxSpendNano: 100,
			SpentNano:    0,
		},
		PolicySnapshot: domain.PolicySnapshot{
			PolicyContractAddr:    "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
			RequireApproval:       false,
			MaxSpendNano:          100,
			AllowedExecutorHashes: []string{},
			FetchedAt:             now,
			PolicySeqno:           1,
		},
		Steps: []ports.RunStepInput{
			{ID: "13131313-1313-1313-1313-131313131313", Name: "fetch", ExecutorType: "http"},
		},
		RunCreatedEventID: "14141414-1414-1414-1414-141414141414",
		RunStartedEventID: "15151515-1515-1515-1515-151515151515",
	})
	if err != nil {
		t.Fatalf("CreateRunWithPlanAndLedger() unexpected error: %v", err)
	}

	err = repo.ApplyPolicySnapshot(context.Background(), ports.ApplyPolicySnapshotParams{
		RunID:                 "ffffffff-ffff-ffff-ffff-ffffffffffff",
		PolicyContractAddr:    "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
		MaxSpendNano:          777,
		RequireApproval:       true,
		AllowedExecutorHashes: []string{"h1", "h2"},
		FetchedAt:             now.Add(time.Second),
		PolicySeqno:           2,
	})
	if err != nil {
		t.Fatalf("ApplyPolicySnapshot() unexpected error: %v", err)
	}

	var maxSpend int64
	if err := db.QueryRow(`SELECT max_spend_nano FROM budgets WHERE run_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'`).Scan(&maxSpend); err != nil {
		t.Fatalf("select max_spend_nano: %v", err)
	}
	if maxSpend != 777 {
		t.Fatalf("max_spend_nano=%d, want 777", maxSpend)
	}
}

func TestIntegrationGetRunByIDNotFound(t *testing.T) {
	db := openIntegrationDBOrSkip(t)
	resetSchema(t, db)
	repo := NewRunsRepository(db)

	_, err := repo.GetRunByID(context.Background(), "00000000-0000-0000-0000-000000000000")
	if err == nil {
		t.Fatalf("GetRunByID() expected error, got nil")
	}
	if !errors.Is(err, domain.ErrRunNotFound) {
		t.Fatalf("expected ErrRunNotFound, got %v", err)
	}
}

func TestIntegrationAnchorQueueAndMarkRunAnchored(t *testing.T) {
	db := openIntegrationDBOrSkip(t)
	resetSchema(t, db)
	repo := NewRunsRepository(db)
	now := time.Now().UTC()

	runID := "99999999-9999-9999-9999-999999999999"
	stepID := "88888888-8888-8888-8888-888888888888"
	_, err := repo.CreateRunWithPlanAndLedger(context.Background(), ports.CreateRunWithPlanAndLedgerParams{
		RunID:              runID,
		AgentID:            "agent-1",
		PolicyContractAddr: "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
		CreatedAt:          now,
		StartedAt:          now,
		BudgetID:           "77777777-7777-7777-7777-777777777777",
		Budget: domain.Budget{
			Currency:     "nanotons",
			MaxSpendNano: 1000,
			SpentNano:    0,
		},
		PolicySnapshot: domain.PolicySnapshot{
			PolicyContractAddr:    "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
			RequireApproval:       false,
			MaxSpendNano:          1000,
			AllowedExecutorHashes: []string{},
			FetchedAt:             now,
			PolicySeqno:           1,
		},
		Steps: []ports.RunStepInput{
			{
				ID:           stepID,
				Name:         "finalize",
				ExecutorType: "http",
				Input:        json.RawMessage(`{"ok":true}`),
			},
		},
		RunCreatedEventID: "66666666-6666-6666-6666-666666666666",
		RunStartedEventID: "55555555-5555-5555-5555-555555555555",
	})
	if err != nil {
		t.Fatalf("CreateRunWithPlanAndLedger() unexpected error: %v", err)
	}

	claimed, err := repo.ClaimNextRunnableStep(context.Background(), ports.ClaimNextRunnableStepParams{
		Now:                now.Add(500 * time.Millisecond),
		StepStartedEventID: "12121212-3434-5656-7878-909090909090",
	})
	if err != nil {
		t.Fatalf("ClaimNextRunnableStep() unexpected error: %v", err)
	}
	if claimed == nil || claimed.StepID != stepID {
		t.Fatalf("claimed step mismatch, got %#v", claimed)
	}

	if err := repo.CompleteStep(context.Background(), ports.CompleteStepParams{
		RunID:                runID,
		StepID:               stepID,
		FinishedAt:           now.Add(time.Second),
		Output:               json.RawMessage(`{"done":true}`),
		CostNano:             0,
		MaxSpendNano:         1000,
		StepCompletedEventID: "44444444-4444-4444-4444-444444444444",
		RunCompletedEventID:  "33333333-3333-3333-3333-333333333333",
	}); err != nil {
		t.Fatalf("CompleteStep() unexpected error: %v", err)
	}

	candidates, err := repo.ListCompletedUnanchoredRuns(context.Background(), 10)
	if err != nil {
		t.Fatalf("ListCompletedUnanchoredRuns() unexpected error: %v", err)
	}
	if len(candidates) != 1 {
		t.Fatalf("completed-unanchored candidates=%d, want 1", len(candidates))
	}
	if candidates[0].RunID != runID {
		t.Fatalf("candidate run_id=%q, want %q", candidates[0].RunID, runID)
	}

	events, err := repo.ListRunEventsForAnchor(context.Background(), runID)
	if err != nil {
		t.Fatalf("ListRunEventsForAnchor() unexpected error: %v", err)
	}
	if len(events) < 3 {
		t.Fatalf("events length=%d, want >=3", len(events))
	}
	if events[len(events)-1].EventType != domain.EventTypeRunCompleted {
		t.Fatalf("last event=%q, want %q", events[len(events)-1].EventType, domain.EventTypeRunCompleted)
	}

	if err := repo.MarkRunAnchoredWithEvent(context.Background(), ports.MarkRunAnchoredWithEventParams{
		RunID:              runID,
		AnchorTxHash:       "abcd1234",
		AnchorDigest:       "deadbeef",
		AnchoredAt:         now.Add(2 * time.Second),
		RunAnchoredEventID: "22222222-2222-2222-2222-222222222222",
		ExplorerURL:        "https://testnet.tonscan.org/tx/abcd1234",
	}); err != nil {
		t.Fatalf("MarkRunAnchoredWithEvent() unexpected error: %v", err)
	}

	var (
		anchorTxHash string
		anchorDigest string
	)
	if err := db.QueryRow(
		`SELECT anchor_tx_hash, anchor_digest FROM runs WHERE id = $1`,
		runID,
	).Scan(&anchorTxHash, &anchorDigest); err != nil {
		t.Fatalf("select run anchor fields failed: %v", err)
	}
	if anchorTxHash != "abcd1234" {
		t.Fatalf("anchor_tx_hash=%q, want abcd1234", anchorTxHash)
	}
	if anchorDigest != "deadbeef" {
		t.Fatalf("anchor_digest=%q, want deadbeef", anchorDigest)
	}

	assertCount(t, db, `SELECT COUNT(*) FROM events WHERE run_id = '`+runID+`' AND event_type = 'run_anchored'`, 1)

	var runAnchoredPayloadRaw []byte
	if err := db.QueryRow(
		`SELECT payload
		   FROM events
		  WHERE run_id = $1
		    AND event_type = 'run_anchored'
		  ORDER BY seq DESC
		  LIMIT 1`,
		runID,
	).Scan(&runAnchoredPayloadRaw); err != nil {
		t.Fatalf("select run_anchored payload failed: %v", err)
	}
	var runAnchoredPayload map[string]any
	if err := json.Unmarshal(runAnchoredPayloadRaw, &runAnchoredPayload); err != nil {
		t.Fatalf("decode run_anchored payload failed: %v", err)
	}
	if runAnchoredPayload["run_id"] != runID {
		t.Fatalf("run_anchored payload run_id=%v, want %s", runAnchoredPayload["run_id"], runID)
	}

	err = repo.MarkRunAnchoredWithEvent(context.Background(), ports.MarkRunAnchoredWithEventParams{
		RunID:              runID,
		AnchorTxHash:       "zzz",
		AnchorDigest:       "zzz",
		AnchoredAt:         now.Add(3 * time.Second),
		RunAnchoredEventID: "11111111-1111-1111-1111-111111111111",
	})
	if err == nil {
		t.Fatalf("second MarkRunAnchoredWithEvent() expected conflict error")
	}
	if !errors.Is(err, domain.ErrRunAnchorConflict) {
		t.Fatalf("expected ErrRunAnchorConflict, got %v", err)
	}
	assertCount(t, db, `SELECT COUNT(*) FROM events WHERE run_id = '`+runID+`' AND event_type = 'run_anchored'`, 1)
}

func TestIntegrationRecoverStaleRunningSteps(t *testing.T) {
	db := openIntegrationDBOrSkip(t)
	resetSchema(t, db)
	repo := NewRunsRepository(db)
	now := time.Now().UTC()

	runID := "21212121-2121-2121-2121-212121212121"
	stepID := "43434343-4343-4343-4343-434343434343"
	_, err := repo.CreateRunWithPlanAndLedger(context.Background(), ports.CreateRunWithPlanAndLedgerParams{
		RunID:              runID,
		AgentID:            "agent-1",
		PolicyContractAddr: "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
		CreatedAt:          now,
		StartedAt:          now,
		BudgetID:           "65656565-6565-6565-6565-656565656565",
		Budget: domain.Budget{
			Currency:     "nanotons",
			MaxSpendNano: 1000,
			SpentNano:    0,
		},
		PolicySnapshot: domain.PolicySnapshot{
			PolicyContractAddr:    "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
			RequireApproval:       false,
			MaxSpendNano:          1000,
			AllowedExecutorHashes: []string{"h1"},
			FetchedAt:             now,
			PolicySeqno:           1,
		},
		Steps: []ports.RunStepInput{
			{
				ID:           stepID,
				ClientStepID: "slow_step",
				Name:         "slow_step",
				ExecutorType: "http",
				Input:        json.RawMessage(`{"url":"https://httpbin.org/delay/20"}`),
				MaxRetries:   2,
			},
		},
		RunCreatedEventID: "76767676-7676-7676-7676-767676767676",
		RunStartedEventID: "87878787-8787-8787-8787-878787878787",
	})
	if err != nil {
		t.Fatalf("CreateRunWithPlanAndLedger() unexpected error: %v", err)
	}

	claimed, err := repo.ClaimNextRunnableStep(context.Background(), ports.ClaimNextRunnableStepParams{
		Now:                now.Add(time.Second),
		StepStartedEventID: "98989898-9898-9898-9898-989898989898",
	})
	if err != nil {
		t.Fatalf("ClaimNextRunnableStep() unexpected error: %v", err)
	}
	if claimed == nil || claimed.StepID != stepID {
		t.Fatalf("expected claimed step %q, got %#v", stepID, claimed)
	}

	recovered, err := repo.RecoverStaleRunningSteps(context.Background(), ports.RecoverStaleRunningStepsParams{
		Now:   now.Add(2 * time.Second),
		Limit: 10,
	})
	if err != nil {
		t.Fatalf("RecoverStaleRunningSteps() unexpected error: %v", err)
	}
	if recovered != 1 {
		t.Fatalf("recovered=%d, want 1", recovered)
	}

	var (
		status     string
		attempt    int
		startedAt  sql.NullTime
		finishedAt sql.NullTime
	)
	if err := db.QueryRow(
		`SELECT status, attempt, started_at, finished_at
		   FROM steps
		  WHERE id = $1`,
		stepID,
	).Scan(&status, &attempt, &startedAt, &finishedAt); err != nil {
		t.Fatalf("select recovered step state failed: %v", err)
	}
	if status != "pending" {
		t.Fatalf("step status=%q, want pending", status)
	}
	if attempt != 0 {
		t.Fatalf("step attempt=%d, want 0", attempt)
	}
	if startedAt.Valid {
		t.Fatalf("step started_at must be NULL after recovery")
	}
	if finishedAt.Valid {
		t.Fatalf("step finished_at must be NULL after recovery")
	}

	var payloadRaw []byte
	if err := db.QueryRow(
		`SELECT payload
		   FROM events
		  WHERE run_id = $1
		    AND step_id = $2
		    AND event_type = 'step_retried'
		  ORDER BY seq DESC
		  LIMIT 1`,
		runID,
		stepID,
	).Scan(&payloadRaw); err != nil {
		t.Fatalf("select recovery retry payload failed: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(payloadRaw, &payload); err != nil {
		t.Fatalf("decode recovery payload failed: %v", err)
	}
	if payload["reason"] != "crash_recovery" {
		t.Fatalf("step_retried reason=%v, want crash_recovery", payload["reason"])
	}
}

func assertCount(t *testing.T, db *sql.DB, query string, want int) {
	t.Helper()
	var got int
	if err := db.QueryRow(query).Scan(&got); err != nil {
		t.Fatalf("query count failed: %v", err)
	}
	if got != want {
		t.Fatalf("count=%d, want %d for query: %s", got, want, query)
	}
}
