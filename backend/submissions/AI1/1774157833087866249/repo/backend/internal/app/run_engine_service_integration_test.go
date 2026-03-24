package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	adapterrepo "acp/backend/internal/adapters/repository/postgres"
	"acp/backend/internal/domain"
	"acp/backend/internal/ports"
)

func TestIntegrationRunEngineTickCompletesStep(t *testing.T) {
	db := openEngineIntegrationDBOrSkip(t)
	resetEngineSchema(t, db)
	repo := adapterrepo.NewRunsRepository(db)
	now := time.Now().UTC()

	if _, err := repo.CreateRunWithPlanAndLedger(context.Background(), ports.CreateRunWithPlanAndLedgerParams{
		RunID:              "11111111-1111-1111-1111-111111111111",
		AgentID:            "agent-1",
		PolicyContractAddr: "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
		CreatedAt:          now,
		StartedAt:          now,
		BudgetID:           "22222222-2222-2222-2222-222222222222",
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
				ID:           "33333333-3333-3333-3333-333333333333",
				Name:         "fetch",
				ExecutorType: domain.ExecutorTypeHTTP,
				Input:        json.RawMessage(`{"url":"https://example.com"}`),
			},
		},
		RunCreatedEventID: "44444444-4444-4444-4444-444444444444",
		RunStartedEventID: "55555555-5555-5555-5555-555555555555",
	}); err != nil {
		t.Fatalf("CreateRunWithPlanAndLedger failed: %v", err)
	}

	engine := NewRunEngineService(
		repo,
		ports.ExecutorRegistryMap{
			domain.ExecutorTypeHTTP: {
				Executor: &stepExecutorMock{
					executeFn: func(_ context.Context, _ ports.RunnableStep) (ports.ExecutionResult, error) {
						return ports.ExecutionResult{Success: true, Payload: json.RawMessage(`{"ok":true}`)}, nil
					},
				},
				Metadata: ports.ExecutorMetadata{EndpointHash: "h1"},
			},
		},
		&policyReaderMock{
			getPolicyFn: func(_ context.Context, _ string) (ports.OnChainPolicy, error) {
				return ports.OnChainPolicy{
					PolicyContractAddr:    "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
					MaxSpendNano:          1000,
					RequireApproval:       false,
					AllowedExecutorHashes: []string{"h1"},
					FetchedAt:             time.Now().UTC(),
				}, nil
			},
		},
		nil,
		nil,
		nil,
	)

	processed, err := engine.Tick(context.Background(), 5)
	if err != nil {
		t.Fatalf("Tick() failed: %v", err)
	}
	if processed != 1 {
		t.Fatalf("processed=%d, want 1", processed)
	}

	var runStatus string
	if err := db.QueryRow(`SELECT status FROM runs WHERE id = '11111111-1111-1111-1111-111111111111'`).Scan(&runStatus); err != nil {
		t.Fatalf("select run status failed: %v", err)
	}
	if runStatus != "completed" {
		t.Fatalf("run status=%q, want completed", runStatus)
	}
}

func TestIntegrationRunEngineTickApprovalHold(t *testing.T) {
	db := openEngineIntegrationDBOrSkip(t)
	resetEngineSchema(t, db)
	repo := adapterrepo.NewRunsRepository(db)
	now := time.Now().UTC()

	if _, err := repo.CreateRunWithPlanAndLedger(context.Background(), ports.CreateRunWithPlanAndLedgerParams{
		RunID:              "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
		AgentID:            "agent-1",
		PolicyContractAddr: "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
		CreatedAt:          now,
		StartedAt:          now,
		BudgetID:           "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
		Budget: domain.Budget{
			Currency:     "nanotons",
			MaxSpendNano: 1000,
			SpentNano:    0,
		},
		PolicySnapshot: domain.PolicySnapshot{
			PolicyContractAddr:    "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
			RequireApproval:       true,
			MaxSpendNano:          1000,
			AllowedExecutorHashes: []string{"h2"},
			FetchedAt:             now,
			PolicySeqno:           1,
		},
		Steps: []ports.RunStepInput{
			{
				ID:           "cccccccc-cccc-cccc-cccc-cccccccccccc",
				Name:         "trade",
				ExecutorType: domain.ExecutorTypeTonTransaction,
				IsFinancial:  true,
			},
		},
		RunCreatedEventID: "dddddddd-dddd-dddd-dddd-dddddddddddd",
		RunStartedEventID: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
	}); err != nil {
		t.Fatalf("CreateRunWithPlanAndLedger failed: %v", err)
	}

	engine := NewRunEngineService(
		repo,
		ports.ExecutorRegistryMap{
			domain.ExecutorTypeTonTransaction: {
				Executor: &stepExecutorMock{},
				Metadata: ports.ExecutorMetadata{EndpointHash: "h2"},
			},
		},
		&policyReaderMock{
			getPolicyFn: func(_ context.Context, _ string) (ports.OnChainPolicy, error) {
				return ports.OnChainPolicy{
					PolicyContractAddr:    "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
					MaxSpendNano:          1000,
					RequireApproval:       true,
					AllowedExecutorHashes: []string{"h2"},
					FetchedAt:             time.Now().UTC(),
				}, nil
			},
		},
		nil,
		nil,
		nil,
	)

	processed, err := engine.Tick(context.Background(), 1)
	if err != nil {
		t.Fatalf("Tick() failed: %v", err)
	}
	if processed != 1 {
		t.Fatalf("processed=%d, want 1", processed)
	}

	var (
		runStatus  string
		stepStatus string
	)
	if err := db.QueryRow(`SELECT status FROM runs WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'`).Scan(&runStatus); err != nil {
		t.Fatalf("select run status failed: %v", err)
	}
	if err := db.QueryRow(`SELECT status FROM steps WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'`).Scan(&stepStatus); err != nil {
		t.Fatalf("select step status failed: %v", err)
	}
	if runStatus != "waiting_approval" {
		t.Fatalf("run status=%q, want waiting_approval", runStatus)
	}
	if stepStatus != "waiting_approval" {
		t.Fatalf("step status=%q, want waiting_approval", stepStatus)
	}

	var payloadRaw []byte
	if err := db.QueryRow(
		`SELECT payload
		   FROM events
		  WHERE run_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
		    AND event_type = 'approval_requested'
		  ORDER BY seq DESC
		  LIMIT 1`,
	).Scan(&payloadRaw); err != nil {
		t.Fatalf("select approval_requested payload failed: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(payloadRaw, &payload); err != nil {
		t.Fatalf("decode approval_requested payload failed: %v", err)
	}
	approvalID, _ := payload["approval_id"].(string)
	if approvalID == "" {
		t.Fatalf("approval_requested payload must include approval_id")
	}
}

func TestIntegrationRunEngineAnchorCompletedRuns(t *testing.T) {
	db := openEngineIntegrationDBOrSkip(t)
	resetEngineSchema(t, db)
	repo := adapterrepo.NewRunsRepository(db)
	now := time.Now().UTC()

	runID := "12121212-1212-1212-1212-121212121212"
	stepID := "34343434-3434-3434-3434-343434343434"
	if _, err := repo.CreateRunWithPlanAndLedger(context.Background(), ports.CreateRunWithPlanAndLedgerParams{
		RunID:              runID,
		AgentID:            "agent-1",
		PolicyContractAddr: "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
		CreatedAt:          now,
		StartedAt:          now,
		BudgetID:           "56565656-5656-5656-5656-565656565656",
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
				Name:         "done",
				ExecutorType: domain.ExecutorTypeHTTP,
			},
		},
		RunCreatedEventID: "78787878-7878-7878-7878-787878787878",
		RunStartedEventID: "90909090-9090-9090-9090-909090909090",
	}); err != nil {
		t.Fatalf("CreateRunWithPlanAndLedger failed: %v", err)
	}

	claimed, err := repo.ClaimNextRunnableStep(context.Background(), ports.ClaimNextRunnableStepParams{
		Now:                now.Add(500 * time.Millisecond),
		StepStartedEventID: "aaaaaaa0-aaaa-aaaa-aaaa-aaaaaaaaaaa0",
	})
	if err != nil {
		t.Fatalf("ClaimNextRunnableStep failed: %v", err)
	}
	if claimed == nil || claimed.StepID != stepID {
		t.Fatalf("claimed step mismatch, got %#v", claimed)
	}

	if err := repo.CompleteStep(context.Background(), ports.CompleteStepParams{
		RunID:                runID,
		StepID:               stepID,
		FinishedAt:           now.Add(time.Second),
		Output:               json.RawMessage(`{"ok":true}`),
		CostNano:             0,
		MaxSpendNano:         1000,
		StepCompletedEventID: "aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
		RunCompletedEventID:  "aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
	}); err != nil {
		t.Fatalf("CompleteStep failed: %v", err)
	}

	engine := NewRunEngineService(
		repo,
		ports.ExecutorRegistryMap{},
		nil,
		&anchorPublisherMock{
			publishFn: func(_ context.Context, _ ports.PublishRunAnchorRequest) (ports.PublishRunAnchorResult, error) {
				return ports.PublishRunAnchorResult{
					TxHash:      "anchor-hash-1",
					ExplorerURL: "https://testnet.tonscan.org/tx/anchor-hash-1",
				}, nil
			},
		},
		nil,
		nil,
	)

	anchored, err := engine.AnchorCompletedRuns(context.Background(), 5)
	if err != nil {
		t.Fatalf("AnchorCompletedRuns() failed: %v", err)
	}
	if anchored != 1 {
		t.Fatalf("anchored=%d, want 1", anchored)
	}

	var (
		anchorTxHash string
		anchorDigest string
	)
	if err := db.QueryRow(`SELECT anchor_tx_hash, anchor_digest FROM runs WHERE id = $1`, runID).Scan(&anchorTxHash, &anchorDigest); err != nil {
		t.Fatalf("select anchor fields failed: %v", err)
	}
	if anchorTxHash == "" || anchorDigest == "" {
		t.Fatalf("anchor fields are not set")
	}
}

func openEngineIntegrationDBOrSkip(t *testing.T) *sql.DB {
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

func resetEngineSchema(t *testing.T, db *sql.DB) {
	t.Helper()
	migrationsDir := getEngineMigrationsDir(t)
	if _, err := db.Exec(`DROP TABLE IF EXISTS policy_cache, policy_refs, idempotency_keys, step_dependencies, executors, approvals, policies, budgets, events, steps, runs CASCADE`); err != nil {
		t.Fatalf("drop schema failed: %v", err)
	}
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
			t.Fatalf("read migration %q: %v", name, err)
		}
		if _, err := db.Exec(string(sqlText)); err != nil {
			t.Fatalf("apply migration %q: %v", name, err)
		}
	}
}

func getEngineMigrationsDir(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatalf("runtime.Caller failed")
	}
	root := filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", ".."))
	return filepath.Join(root, "db", "migrations")
}
