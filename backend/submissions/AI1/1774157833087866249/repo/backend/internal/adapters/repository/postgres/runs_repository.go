package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"

	"acp/backend/internal/domain"
	"acp/backend/internal/ports"
)

func NewRunsRepository(db *sql.DB) *RunLedgerRepository {
	return &RunLedgerRepository{db: db}
}

func (r *RunLedgerRepository) CreateRunWithPlanAndLedger(
	ctx context.Context,
	params ports.CreateRunWithPlanAndLedgerParams,
) (string, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("begin tx: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	if params.Idempotency != nil {
		existing, err := getIdempotencyInTx(ctx, tx, params.Idempotency.Scope, params.Idempotency.IdempotencyKey)
		if err != nil {
			return "", err
		}
		if existing != nil {
			if existing.RequestHash != params.Idempotency.RequestHash {
				return "", &domain.PolicyViolationError{
					Reason: "idempotency key reuse with different payload",
				}
			}
			if err := tx.Commit(); err != nil {
				return "", fmt.Errorf("commit tx: %w", err)
			}
			committed = true
			return existing.RunID, nil
		}
	}

	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO runs (
		     id,
		     agent_id,
		     status,
		     policy_contract_addr,
		     created_at,
		     started_at,
		     finished_at,
		     anchor_tx_hash,
		     anchor_digest,
		     anchored_at
		   )
		   VALUES ($1, $2, $3, $4, $5, NULL, NULL, NULL, NULL, NULL)`,
		params.RunID,
		params.AgentID,
		domain.RunStatusCreated,
		params.PolicyContractAddr,
		params.CreatedAt,
	); err != nil {
		return "", fmt.Errorf("insert run: %w", err)
	}

	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO budgets (
		     id,
		     run_id,
		     currency,
		     max_spend_nano,
		     spent_nano
		   )
		   VALUES ($1, $2, $3, $4, $5)`,
		params.BudgetID,
		params.RunID,
		params.Budget.Currency,
		params.Budget.MaxSpendNano,
		params.Budget.SpentNano,
	); err != nil {
		return "", fmt.Errorf("insert budget: %w", err)
	}

	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO policy_refs (
		     run_id,
		     policy_contract_addr,
		     source
		   )
		   VALUES ($1, $2, 'ton')`,
		params.RunID,
		params.PolicyContractAddr,
	); err != nil {
		return "", fmt.Errorf("insert policy reference: %w", err)
	}

	allowedHashes := params.PolicySnapshot.AllowedExecutorHashes
	if allowedHashes == nil {
		allowedHashes = []string{}
	}
	allowedExecutorsRaw, err := json.Marshal(allowedHashes)
	if err != nil {
		return "", fmt.Errorf("marshal policy snapshot allowlist: %w", err)
	}
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO policy_cache (
		     run_id,
		     policy_contract_addr,
		     max_spend_nano,
		     require_approval,
		     allowed_executor_hashes,
		     fetched_at,
		     policy_seqno
		   )
		   VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
		params.RunID,
		params.PolicyContractAddr,
		params.PolicySnapshot.MaxSpendNano,
		params.PolicySnapshot.RequireApproval,
		allowedExecutorsRaw,
		params.PolicySnapshot.FetchedAt,
		params.PolicySnapshot.PolicySeqno,
	); err != nil {
		return "", fmt.Errorf("insert policy cache: %w", err)
	}

	clientStepIDs := make(map[string]string, len(params.Steps))
	for _, step := range params.Steps {
		input := step.Input
		if len(input) == 0 {
			input = json.RawMessage(`{}`)
		}
		if _, err := tx.ExecContext(
			ctx,
			`INSERT INTO steps (
			     id,
			     run_id,
			     client_step_id,
			     name,
			     executor_type,
			     status,
			     attempt,
			     max_retries,
			     is_financial,
			     input,
			     created_at
			   )
			   VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9::jsonb, $10)`,
			step.ID,
			params.RunID,
			nullString(step.ClientStepID),
			step.Name,
			step.ExecutorType,
			domain.StepStatusPending,
			step.MaxRetries,
			step.IsFinancial,
			input,
			params.CreatedAt,
		); err != nil {
			return "", fmt.Errorf("insert step: %w", err)
		}
		if step.ClientStepID != "" {
			clientStepIDs[step.ClientStepID] = step.ID
		}
	}

	for _, step := range params.Steps {
		if len(step.DependsOnClientStepIDs) == 0 {
			continue
		}
		for _, dependency := range step.DependsOnClientStepIDs {
			dependsOnStepID, ok := clientStepIDs[dependency]
			if !ok {
				return "", &domain.PolicyViolationError{
					Reason: fmt.Sprintf("unknown dependency reference: %s", dependency),
				}
			}
			if _, err := tx.ExecContext(
				ctx,
				`INSERT INTO step_dependencies (
				     step_id,
				     depends_on_step_id
				   )
				   VALUES ($1, $2)`,
				step.ID,
				dependsOnStepID,
			); err != nil {
				return "", fmt.Errorf("insert step dependency: %w", err)
			}
		}
	}

	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO events (
		     id,
		     run_id,
		     step_id,
		     event_type,
		     payload,
		     created_at
		   )
		   VALUES ($1, $2, NULL, $3, '{}'::jsonb, $4)`,
		params.RunCreatedEventID,
		params.RunID,
		domain.EventTypeRunCreated,
		params.CreatedAt,
	); err != nil {
		return "", fmt.Errorf("insert run_created event: %w", err)
	}

	result, err := tx.ExecContext(
		ctx,
		`UPDATE runs
		   SET status = $1,
		       started_at = $2
		 WHERE id = $3
		   AND status = $4`,
		domain.RunStatusRunning,
		params.StartedAt,
		params.RunID,
		domain.RunStatusCreated,
	)
	if err != nil {
		return "", fmt.Errorf("update run status to running: %w", err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return "", fmt.Errorf("read run update rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return "", &domain.RunTransitionConflictError{
			RunID:        params.RunID,
			ExpectedFrom: domain.RunStatusCreated,
		}
	}

	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO events (
		     id,
		     run_id,
		     step_id,
		     event_type,
		     payload,
		     created_at
		   )
		   VALUES ($1, $2, NULL, $3, '{}'::jsonb, $4)`,
		params.RunStartedEventID,
		params.RunID,
		domain.EventTypeRunStarted,
		params.StartedAt,
	); err != nil {
		return "", fmt.Errorf("insert run_started event: %w", err)
	}

	if params.Idempotency != nil {
		_, err := tx.ExecContext(
			ctx,
			`INSERT INTO idempotency_keys (
			     scope,
			     idempotency_key,
			     request_hash,
			     run_id,
			     created_at
			   )
			   VALUES ($1, $2, $3, $4, $5)`,
			params.Idempotency.Scope,
			params.Idempotency.IdempotencyKey,
			params.Idempotency.RequestHash,
			params.RunID,
			params.Idempotency.CreatedAt,
		)
		if err != nil {
			if isUniqueViolation(err) {
				existing, lookupErr := getIdempotencyInTx(
					ctx,
					tx,
					params.Idempotency.Scope,
					params.Idempotency.IdempotencyKey,
				)
				if lookupErr != nil {
					return "", lookupErr
				}
				if existing == nil {
					return "", fmt.Errorf("idempotency unique conflict without row")
				}
				if existing.RequestHash != params.Idempotency.RequestHash {
					return "", &domain.PolicyViolationError{
						Reason: "idempotency key reuse with different payload",
					}
				}
				return existing.RunID, nil
			}
			return "", fmt.Errorf("insert idempotency key: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return "", fmt.Errorf("commit tx: %w", err)
	}
	committed = true

	return params.RunID, nil
}

func (r *RunLedgerRepository) GetRunByID(ctx context.Context, runID string) (ports.GetRunByIDResult, error) {
	row := r.db.QueryRowContext(
		ctx,
		`SELECT
		     r.id,
		     r.agent_id,
		     r.status,
		     r.policy_contract_addr,
		     r.created_at,
		     r.started_at,
		     r.finished_at,
		     r.anchor_tx_hash,
		     r.anchor_digest,
		     r.anchored_at,
		     b.currency,
		     b.max_spend_nano,
		     b.spent_nano,
		     pc.require_approval,
		     pc.max_spend_nano,
		     pc.allowed_executor_hashes,
		     pc.fetched_at,
		     pc.policy_seqno
		   FROM runs r
		   LEFT JOIN budgets b ON b.run_id = r.id
		   LEFT JOIN policy_cache pc ON pc.run_id = r.id
		  WHERE r.id = $1`,
		runID,
	)

	var (
		result                ports.GetRunByIDResult
		startedAt             sql.NullTime
		finishedAt            sql.NullTime
		anchoredAt            sql.NullTime
		status                string
		anchorTxHash          sql.NullString
		anchorDigest          sql.NullString
		policyRequireApproval sql.NullBool
		policyMaxSpendNano    sql.NullInt64
		policyFetchedAt       sql.NullTime
		policySeqno           sql.NullInt64
		allowedExecutorsDB    []byte
	)
	if err := row.Scan(
		&result.ID,
		&result.AgentID,
		&status,
		&result.PolicyContractAddr,
		&result.CreatedAt,
		&startedAt,
		&finishedAt,
		&anchorTxHash,
		&anchorDigest,
		&anchoredAt,
		&result.Budget.Currency,
		&result.Budget.MaxSpendNano,
		&result.Budget.SpentNano,
		&policyRequireApproval,
		&policyMaxSpendNano,
		&allowedExecutorsDB,
		&policyFetchedAt,
		&policySeqno,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ports.GetRunByIDResult{}, &domain.RunNotFoundError{RunID: runID}
		}
		return ports.GetRunByIDResult{}, fmt.Errorf("select run by id: %w", err)
	}

	result.Status = domain.RunStatus(status)
	if startedAt.Valid {
		value := startedAt.Time
		result.StartedAt = &value
	}
	if finishedAt.Valid {
		value := finishedAt.Time
		result.FinishedAt = &value
	}
	if anchorTxHash.Valid {
		value := anchorTxHash.String
		result.AnchorTxHash = &value
	}
	if anchorDigest.Valid {
		value := anchorDigest.String
		result.AnchorDigest = &value
	}
	if anchoredAt.Valid {
		value := anchoredAt.Time
		result.AnchoredAt = &value
	}

	if policyRequireApproval.Valid || policyMaxSpendNano.Valid || len(allowedExecutorsDB) > 0 || policyFetchedAt.Valid || policySeqno.Valid {
		snapshot := &domain.PolicySnapshot{
			PolicyContractAddr: result.PolicyContractAddr,
			RequireApproval:    policyRequireApproval.Valid && policyRequireApproval.Bool,
			MaxSpendNano:       policyMaxSpendNano.Int64,
			PolicySeqno:        policySeqno.Int64,
		}
		if len(allowedExecutorsDB) > 0 {
			if err := json.Unmarshal(allowedExecutorsDB, &snapshot.AllowedExecutorHashes); err != nil {
				return ports.GetRunByIDResult{}, fmt.Errorf("decode policy cache allowlist: %w", err)
			}
		} else {
			snapshot.AllowedExecutorHashes = []string{}
		}
		if policyFetchedAt.Valid {
			snapshot.FetchedAt = policyFetchedAt.Time
		}
		result.PolicySnapshot = snapshot
	}

	return result, nil
}

func (r *RunLedgerRepository) ClaimNextRunnableStep(
	ctx context.Context,
	params ports.ClaimNextRunnableStepParams,
) (*ports.RunnableStep, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	var (
		step       ports.RunnableStep
		stepStatus string
	)
	if err := tx.QueryRowContext(
		ctx,
		`SELECT
		     s.id,
		     s.run_id,
		     s.name,
		     s.executor_type,
		     s.status,
		     r.policy_contract_addr,
		     s.input,
		     s.attempt,
		     s.max_retries,
		     s.is_financial,
		     b.spent_nano
		   FROM steps s
		   JOIN runs r ON r.id = s.run_id
		   JOIN budgets b ON b.run_id = r.id
		  WHERE s.status = $1
		    AND r.status = $2
		    AND NOT EXISTS (
		      SELECT 1
		        FROM step_dependencies sd
		        JOIN steps deps ON deps.id = sd.depends_on_step_id
		       WHERE sd.step_id = s.id
		         AND deps.status <> $3
		    )
		  ORDER BY s.created_at ASC, s.id ASC
		  LIMIT 1
		  FOR UPDATE OF s, r, b SKIP LOCKED`,
		domain.StepStatusPending,
		domain.RunStatusRunning,
		domain.StepStatusCompleted,
	).Scan(
		&step.StepID,
		&step.RunID,
		&step.Name,
		&step.ExecutorType,
		&stepStatus,
		&step.PolicyContractAddr,
		&step.Input,
		&step.Attempt,
		&step.MaxRetries,
		&step.IsFinancial,
		&step.BudgetSpentNano,
	); err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("select runnable pending step: %w", err)
		}
		if err := tx.QueryRowContext(
			ctx,
			`SELECT
			     s.id,
			     s.run_id,
			     s.name,
			     s.executor_type,
			     s.status,
			     r.policy_contract_addr,
			     s.input,
			     s.attempt,
			     s.max_retries,
			     s.is_financial,
			     b.spent_nano
			   FROM steps s
			   JOIN runs r ON r.id = s.run_id
			   JOIN budgets b ON b.run_id = r.id
			   JOIN approvals a ON a.step_id = s.id
			  WHERE s.status = $1
			    AND r.status = $2
			    AND a.status = $3
			  ORDER BY s.created_at ASC, s.id ASC
			  LIMIT 1
			  FOR UPDATE OF s, r, b, a SKIP LOCKED`,
			domain.StepStatusRunning,
			domain.RunStatusRunning,
			domain.ApprovalStatusApproved,
		).Scan(
			&step.StepID,
			&step.RunID,
			&step.Name,
			&step.ExecutorType,
			&stepStatus,
			&step.PolicyContractAddr,
			&step.Input,
			&step.Attempt,
			&step.MaxRetries,
			&step.IsFinancial,
			&step.BudgetSpentNano,
		); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				if err := tx.Commit(); err != nil {
					return nil, fmt.Errorf("commit empty claim tx: %w", err)
				}
				committed = true
				return nil, nil
			}
			return nil, fmt.Errorf("select runnable approved step: %w", err)
		}
		step.ApprovalResolved = true
	}

	step.Status = stepStatus

	if stepStatus == string(domain.StepStatusPending) {
		result, err := tx.ExecContext(
			ctx,
			`UPDATE steps
			   SET status = $1,
			       started_at = $2
			 WHERE id = $3
			   AND status = $4`,
			domain.StepStatusRunning,
			params.Now,
			step.StepID,
			domain.StepStatusPending,
		)
		if err != nil {
			return nil, fmt.Errorf("update claimed step to running: %w", err)
		}
		rows, err := result.RowsAffected()
		if err != nil {
			return nil, fmt.Errorf("claimed step rows affected: %w", err)
		}
		if rows == 0 {
			return nil, &domain.TransitionError{
				Entity: "step",
				From:   string(domain.StepStatusPending),
				To:     string(domain.StepStatusRunning),
			}
		}

		eventID := params.StepStartedEventID
		if eventID == "" {
			eventID = uuid.NewString()
		}
		if _, err := tx.ExecContext(
			ctx,
			`INSERT INTO events (
			     id,
			     run_id,
			     step_id,
			     event_type,
			     payload,
			     created_at
			   )
			   VALUES ($1, $2, $3, $4, '{}'::jsonb, $5)`,
			eventID,
			step.RunID,
			step.StepID,
			domain.EventTypeStepStarted,
			params.Now,
		); err != nil {
			return nil, fmt.Errorf("insert step_started event: %w", err)
		}
		step.Status = string(domain.StepStatusRunning)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit claim tx: %w", err)
	}
	committed = true
	return &step, nil
}

func (r *RunLedgerRepository) ApplyPolicySnapshot(
	ctx context.Context,
	params ports.ApplyPolicySnapshotParams,
) error {
	allowedHashes := params.AllowedExecutorHashes
	if allowedHashes == nil {
		allowedHashes = []string{}
	}
	allowedHashesRaw, err := json.Marshal(allowedHashes)
	if err != nil {
		return fmt.Errorf("marshal policy snapshot allowlist: %w", err)
	}

	if _, err := r.db.ExecContext(
		ctx,
		`UPDATE budgets
		   SET max_spend_nano = $1
		 WHERE run_id = $2`,
		params.MaxSpendNano,
		params.RunID,
	); err != nil {
		return fmt.Errorf("update budget max_spend_nano: %w", err)
	}

	if _, err := r.db.ExecContext(
		ctx,
		`INSERT INTO policy_cache (
		     run_id,
		     policy_contract_addr,
		     max_spend_nano,
		     require_approval,
		     allowed_executor_hashes,
		     fetched_at,
		     policy_seqno
		   )
		   VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
		   ON CONFLICT (run_id)
		   DO UPDATE SET
		     policy_contract_addr = EXCLUDED.policy_contract_addr,
		     max_spend_nano = EXCLUDED.max_spend_nano,
		     require_approval = EXCLUDED.require_approval,
		     allowed_executor_hashes = EXCLUDED.allowed_executor_hashes,
		     fetched_at = EXCLUDED.fetched_at,
		     policy_seqno = EXCLUDED.policy_seqno`,
		params.RunID,
		params.PolicyContractAddr,
		params.MaxSpendNano,
		params.RequireApproval,
		allowedHashesRaw,
		params.FetchedAt,
		params.PolicySeqno,
	); err != nil {
		return fmt.Errorf("upsert policy cache: %w", err)
	}

	return nil
}

func (r *RunLedgerRepository) PutStepOnApprovalHold(
	ctx context.Context,
	params ports.PutStepOnApprovalHoldParams,
) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	stepUpdateResult, err := tx.ExecContext(
		ctx,
		`UPDATE steps
		   SET status = $1
		 WHERE id = $2
		   AND run_id = $3
		   AND status = $4`,
		domain.StepStatusWaitingApproval,
		params.StepID,
		params.RunID,
		domain.StepStatusRunning,
	)
	if err != nil {
		return fmt.Errorf("set step waiting_approval: %w", err)
	}
	stepRows, err := stepUpdateResult.RowsAffected()
	if err != nil {
		return fmt.Errorf("step waiting_approval rows affected: %w", err)
	}
	if stepRows == 0 {
		return &domain.ApprovalConflictError{
			ApprovalID: params.ApprovalID,
			Reason:     "step is not in running state",
		}
	}

	runUpdateResult, err := tx.ExecContext(
		ctx,
		`UPDATE runs
		   SET status = $1
		 WHERE id = $2
		   AND status = $3`,
		domain.RunStatusWaitingApproval,
		params.RunID,
		domain.RunStatusRunning,
	)
	if err != nil {
		return fmt.Errorf("set run waiting_approval: %w", err)
	}
	runRows, err := runUpdateResult.RowsAffected()
	if err != nil {
		return fmt.Errorf("run waiting_approval rows affected: %w", err)
	}
	if runRows == 0 {
		return &domain.TransitionError{
			Entity: "run",
			From:   string(domain.RunStatusRunning),
			To:     string(domain.RunStatusWaitingApproval),
		}
	}

	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO approvals (
		     id,
		     step_id,
		     status,
		     requested_at,
		     resolved_at
		   )
		   VALUES ($1, $2, $3, $4, NULL)`,
		params.ApprovalID,
		params.StepID,
		domain.ApprovalStatusPending,
		params.RequestedAt,
	); err != nil {
		return fmt.Errorf("insert approval row: %w", err)
	}

	approvalRequestedPayload, err := json.Marshal(map[string]any{
		"approval_id": params.ApprovalID,
	})
	if err != nil {
		return fmt.Errorf("encode approval_requested payload: %w", err)
	}

	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO events (
		     id,
		     run_id,
		     step_id,
		     event_type,
		     payload,
		     created_at
		   )
		   VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
		params.ApprovalRequestedEventID,
		params.RunID,
		params.StepID,
		domain.EventTypeApprovalRequested,
		approvalRequestedPayload,
		params.RequestedAt,
	); err != nil {
		return fmt.Errorf("insert approval_requested event: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit approval-hold tx: %w", err)
	}
	committed = true
	return nil
}

func (r *RunLedgerRepository) CompleteStep(ctx context.Context, params ports.CompleteStepParams) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	if params.CostNano > 0 {
		budgetResult, err := tx.ExecContext(
			ctx,
			`UPDATE budgets
			   SET max_spend_nano = $1,
			       spent_nano = spent_nano + $2
			 WHERE run_id = $3
			   AND spent_nano + $2 <= $1`,
			params.MaxSpendNano,
			params.CostNano,
			params.RunID,
		)
		if err != nil {
			return fmt.Errorf("update budget spent: %w", err)
		}
		rows, err := budgetResult.RowsAffected()
		if err != nil {
			return fmt.Errorf("budget rows affected: %w", err)
		}
		if rows == 0 {
			return &domain.BudgetExceededError{RunID: params.RunID}
		}
	}

	output := params.Output
	if len(output) == 0 {
		output = json.RawMessage(`{}`)
	}

	stepResult, err := tx.ExecContext(
		ctx,
		`UPDATE steps
		   SET status = $1,
		       output = $2::jsonb,
		       finished_at = $3
		 WHERE id = $4
		   AND run_id = $5
		   AND status = $6`,
		domain.StepStatusCompleted,
		output,
		params.FinishedAt,
		params.StepID,
		params.RunID,
		domain.StepStatusRunning,
	)
	if err != nil {
		return fmt.Errorf("complete step: %w", err)
	}
	stepRows, err := stepResult.RowsAffected()
	if err != nil {
		return fmt.Errorf("complete step rows affected: %w", err)
	}
	if stepRows == 0 {
		return &domain.TransitionError{
			Entity: "step",
			From:   string(domain.StepStatusRunning),
			To:     string(domain.StepStatusCompleted),
		}
	}

	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO events (
		     id,
		     run_id,
		     step_id,
		     event_type,
		     payload,
		     created_at
		   )
		   VALUES ($1, $2, $3, $4, '{}'::jsonb, $5)`,
		params.StepCompletedEventID,
		params.RunID,
		params.StepID,
		domain.EventTypeStepCompleted,
		params.FinishedAt,
	); err != nil {
		return fmt.Errorf("insert step_completed event: %w", err)
	}

	var remaining int
	if err := tx.QueryRowContext(
		ctx,
		`SELECT COUNT(*)
		   FROM steps
		  WHERE run_id = $1
		    AND status <> $2`,
		params.RunID,
		domain.StepStatusCompleted,
	).Scan(&remaining); err != nil {
		return fmt.Errorf("count remaining steps: %w", err)
	}

	if remaining == 0 {
		runResult, err := tx.ExecContext(
			ctx,
			`UPDATE runs
			   SET status = $1,
			       finished_at = $2
			 WHERE id = $3
			   AND status = $4`,
			domain.RunStatusCompleted,
			params.FinishedAt,
			params.RunID,
			domain.RunStatusRunning,
		)
		if err != nil {
			return fmt.Errorf("complete run: %w", err)
		}
		runRows, err := runResult.RowsAffected()
		if err != nil {
			return fmt.Errorf("complete run rows affected: %w", err)
		}
		if runRows == 0 {
			return &domain.TransitionError{
				Entity: "run",
				From:   string(domain.RunStatusRunning),
				To:     string(domain.RunStatusCompleted),
			}
		}

		if _, err := tx.ExecContext(
			ctx,
			`INSERT INTO events (
			     id,
			     run_id,
			     step_id,
			     event_type,
			     payload,
			     created_at
			   )
			   VALUES ($1, $2, NULL, $3, '{}'::jsonb, $4)`,
			params.RunCompletedEventID,
			params.RunID,
			domain.EventTypeRunCompleted,
			params.FinishedAt,
		); err != nil {
			return fmt.Errorf("insert run_completed event: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit complete-step tx: %w", err)
	}
	committed = true
	return nil
}

func (r *RunLedgerRepository) RetryStep(ctx context.Context, params ports.RetryStepParams) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	stepFailedPayload, err := json.Marshal(map[string]any{"error": params.ErrorMessage})
	if err != nil {
		return fmt.Errorf("encode step_failed payload: %w", err)
	}

	toFailedResult, err := tx.ExecContext(
		ctx,
		`UPDATE steps
		   SET status = $1,
		       finished_at = $2
		 WHERE id = $3
		   AND run_id = $4
		   AND status = $5`,
		domain.StepStatusFailed,
		params.FailedAt,
		params.StepID,
		params.RunID,
		domain.StepStatusRunning,
	)
	if err != nil {
		return fmt.Errorf("set step failed for retry: %w", err)
	}
	toFailedRows, err := toFailedResult.RowsAffected()
	if err != nil {
		return fmt.Errorf("step failed rows affected: %w", err)
	}
	if toFailedRows == 0 {
		return &domain.TransitionError{
			Entity: "step",
			From:   string(domain.StepStatusRunning),
			To:     string(domain.StepStatusFailed),
		}
	}

	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO events (
		     id,
		     run_id,
		     step_id,
		     event_type,
		     payload,
		     created_at
		   )
		   VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
		params.StepFailedEventID,
		params.RunID,
		params.StepID,
		domain.EventTypeStepFailed,
		stepFailedPayload,
		params.FailedAt,
	); err != nil {
		return fmt.Errorf("insert step_failed event for retry: %w", err)
	}

	toRetryingResult, err := tx.ExecContext(
		ctx,
		`UPDATE steps
		   SET status = $1
		 WHERE id = $2
		   AND status = $3`,
		domain.StepStatusRetrying,
		params.StepID,
		domain.StepStatusFailed,
	)
	if err != nil {
		return fmt.Errorf("set step retrying: %w", err)
	}
	toRetryingRows, err := toRetryingResult.RowsAffected()
	if err != nil {
		return fmt.Errorf("step retrying rows affected: %w", err)
	}
	if toRetryingRows == 0 {
		return &domain.TransitionError{
			Entity: "step",
			From:   string(domain.StepStatusFailed),
			To:     string(domain.StepStatusRetrying),
		}
	}

	toPendingResult, err := tx.ExecContext(
		ctx,
		`UPDATE steps
		   SET status = $1,
		       attempt = attempt + 1,
		       started_at = NULL,
		       finished_at = NULL
		 WHERE id = $2
		   AND status = $3`,
		domain.StepStatusPending,
		params.StepID,
		domain.StepStatusRetrying,
	)
	if err != nil {
		return fmt.Errorf("set step pending after retry: %w", err)
	}
	toPendingRows, err := toPendingResult.RowsAffected()
	if err != nil {
		return fmt.Errorf("step pending rows affected: %w", err)
	}
	if toPendingRows == 0 {
		return &domain.TransitionError{
			Entity: "step",
			From:   string(domain.StepStatusRetrying),
			To:     string(domain.StepStatusPending),
		}
	}

	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO events (
		     id,
		     run_id,
		     step_id,
		     event_type,
		     payload,
		     created_at
		   )
		   VALUES ($1, $2, $3, $4, '{}'::jsonb, $5)`,
		params.StepRetriedEventID,
		params.RunID,
		params.StepID,
		domain.EventTypeStepRetried,
		params.FailedAt,
	); err != nil {
		return fmt.Errorf("insert step_retried event: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit retry-step tx: %w", err)
	}
	committed = true
	return nil
}

func (r *RunLedgerRepository) FailStepAndRun(ctx context.Context, params ports.FailStepAndRunParams) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	stepFailedPayload, err := json.Marshal(map[string]any{"error": params.ErrorMessage})
	if err != nil {
		return fmt.Errorf("encode failure payload: %w", err)
	}

	stepResult, err := tx.ExecContext(
		ctx,
		`UPDATE steps
		   SET status = $1,
		       finished_at = $2
		 WHERE id = $3
		   AND run_id = $4
		   AND status = $5`,
		domain.StepStatusFailed,
		params.FailedAt,
		params.StepID,
		params.RunID,
		domain.StepStatusRunning,
	)
	if err != nil {
		return fmt.Errorf("set step failed: %w", err)
	}
	stepRows, err := stepResult.RowsAffected()
	if err != nil {
		return fmt.Errorf("step failed rows affected: %w", err)
	}
	if stepRows == 0 {
		return &domain.TransitionError{
			Entity: "step",
			From:   string(domain.StepStatusRunning),
			To:     string(domain.StepStatusFailed),
		}
	}

	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO events (
		     id,
		     run_id,
		     step_id,
		     event_type,
		     payload,
		     created_at
		   )
		   VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
		params.StepFailedEventID,
		params.RunID,
		params.StepID,
		domain.EventTypeStepFailed,
		stepFailedPayload,
		params.FailedAt,
	); err != nil {
		return fmt.Errorf("insert step_failed event: %w", err)
	}

	runFailedPayload, err := json.Marshal(map[string]any{"reason": params.ErrorMessage})
	if err != nil {
		return fmt.Errorf("encode run_failed payload: %w", err)
	}

	runResult, err := tx.ExecContext(
		ctx,
		`UPDATE runs
		   SET status = $1,
		       finished_at = $2
		 WHERE id = $3
		   AND status = $4`,
		domain.RunStatusFailed,
		params.FailedAt,
		params.RunID,
		domain.RunStatusRunning,
	)
	if err != nil {
		return fmt.Errorf("set run failed: %w", err)
	}
	runRows, err := runResult.RowsAffected()
	if err != nil {
		return fmt.Errorf("run failed rows affected: %w", err)
	}
	if runRows == 0 {
		return &domain.TransitionError{
			Entity: "run",
			From:   string(domain.RunStatusRunning),
			To:     string(domain.RunStatusFailed),
		}
	}

	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO events (
		     id,
		     run_id,
		     step_id,
		     event_type,
		     payload,
		     created_at
		   )
		   VALUES ($1, $2, NULL, $3, $4::jsonb, $5)`,
		params.RunFailedEventID,
		params.RunID,
		domain.EventTypeRunFailed,
		runFailedPayload,
		params.FailedAt,
	); err != nil {
		return fmt.Errorf("insert run_failed event: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit fail-step-run tx: %w", err)
	}
	committed = true
	return nil
}

func (r *RunLedgerRepository) RecoverStaleRunningSteps(
	ctx context.Context,
	params ports.RecoverStaleRunningStepsParams,
) (int, error) {
	limit := params.Limit
	if limit <= 0 {
		limit = 1
	}

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

	rows, err := tx.QueryContext(
		ctx,
		`SELECT s.id, s.run_id
		   FROM steps s
		   JOIN runs r ON r.id = s.run_id
		  WHERE s.status = $1
		    AND r.status = $2
		  ORDER BY s.started_at ASC NULLS LAST, s.id ASC
		  LIMIT $3
		  FOR UPDATE OF s, r SKIP LOCKED`,
		domain.StepStatusRunning,
		domain.RunStatusRunning,
		limit,
	)
	if err != nil {
		return 0, fmt.Errorf("select stale running steps: %w", err)
	}

	type staleStep struct {
		stepID string
		runID  string
	}
	staleSteps := make([]staleStep, 0, limit)
	for rows.Next() {
		var item staleStep
		if err := rows.Scan(&item.stepID, &item.runID); err != nil {
			rows.Close()
			return 0, fmt.Errorf("scan stale running step: %w", err)
		}
		staleSteps = append(staleSteps, item)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return 0, fmt.Errorf("iterate stale running steps: %w", err)
	}
	if err := rows.Close(); err != nil {
		return 0, fmt.Errorf("close stale running steps rows: %w", err)
	}

	if len(staleSteps) == 0 {
		if err := tx.Commit(); err != nil {
			return 0, fmt.Errorf("commit empty recovery tx: %w", err)
		}
		committed = true
		return 0, nil
	}

	retryPayload, err := json.Marshal(map[string]any{"reason": "crash_recovery"})
	if err != nil {
		return 0, fmt.Errorf("encode crash recovery payload: %w", err)
	}

	recovered := 0
	for _, item := range staleSteps {
		result, err := tx.ExecContext(
			ctx,
			`UPDATE steps
			   SET status = $1,
			       started_at = NULL,
			       finished_at = NULL
			 WHERE id = $2
			   AND status = $3`,
			domain.StepStatusPending,
			item.stepID,
			domain.StepStatusRunning,
		)
		if err != nil {
			return recovered, fmt.Errorf("recover step to pending: %w", err)
		}
		rowsAffected, err := result.RowsAffected()
		if err != nil {
			return recovered, fmt.Errorf("recover step rows affected: %w", err)
		}
		if rowsAffected == 0 {
			continue
		}
		if _, err := tx.ExecContext(
			ctx,
			`INSERT INTO events (
			     id,
			     run_id,
			     step_id,
			     event_type,
			     payload,
			     created_at
			   )
			   VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
			uuid.NewString(),
			item.runID,
			item.stepID,
			domain.EventTypeStepRetried,
			retryPayload,
			params.Now,
		); err != nil {
			return recovered, fmt.Errorf("insert crash recovery step_retried event: %w", err)
		}
		recovered++
	}

	if err := tx.Commit(); err != nil {
		return recovered, fmt.Errorf("commit recovery tx: %w", err)
	}
	committed = true
	return recovered, nil
}

func (r *RunLedgerRepository) ListCompletedUnanchoredRuns(
	ctx context.Context,
	limit int,
) ([]ports.CompletedRunForAnchor, error) {
	if limit <= 0 {
		limit = 1
	}

	rows, err := r.db.QueryContext(
		ctx,
		`SELECT id, finished_at
		   FROM runs
		  WHERE status = $1
		    AND anchor_tx_hash IS NULL
		    AND finished_at IS NOT NULL
		  ORDER BY finished_at ASC, id ASC
		  LIMIT $2`,
		domain.RunStatusCompleted,
		limit,
	)
	if err != nil {
		return nil, fmt.Errorf("select completed unanchored runs: %w", err)
	}
	defer rows.Close()

	runs := make([]ports.CompletedRunForAnchor, 0, limit)
	for rows.Next() {
		var row ports.CompletedRunForAnchor
		if err := rows.Scan(&row.RunID, &row.FinishedAt); err != nil {
			return nil, fmt.Errorf("scan completed unanchored run: %w", err)
		}
		runs = append(runs, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate completed unanchored runs: %w", err)
	}
	return runs, nil
}

func (r *RunLedgerRepository) MarkRunAnchoredWithEvent(
	ctx context.Context,
	params ports.MarkRunAnchoredWithEventParams,
) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
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
		   SET anchor_tx_hash = $1,
		       anchor_digest = $2,
		       anchored_at = $3
		 WHERE id = $4
		   AND status = $5
		   AND anchor_tx_hash IS NULL`,
		params.AnchorTxHash,
		params.AnchorDigest,
		params.AnchoredAt,
		params.RunID,
		domain.RunStatusCompleted,
	)
	if err != nil {
		return fmt.Errorf("update run anchor fields: %w", err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("run anchor rows affected: %w", err)
	}
	if rowsAffected == 0 {
		var (
			status       string
			anchorTxHash sql.NullString
		)
		if err := tx.QueryRowContext(
			ctx,
			`SELECT status, anchor_tx_hash
			   FROM runs
			  WHERE id = $1`,
			params.RunID,
		).Scan(&status, &anchorTxHash); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return &domain.RunNotFoundError{RunID: params.RunID}
			}
			return fmt.Errorf("select run status for anchor conflict: %w", err)
		}
		if anchorTxHash.Valid && anchorTxHash.String != "" {
			return &domain.RunAnchorConflictError{
				RunID:  params.RunID,
				Reason: "run already anchored",
			}
		}
		return &domain.RunAnchorConflictError{
			RunID:  params.RunID,
			Reason: fmt.Sprintf("run status %q is not eligible for anchoring", status),
		}
	}

	payload, err := json.Marshal(map[string]any{
		"run_id":         params.RunID,
		"anchor_tx_hash": params.AnchorTxHash,
		"anchor_digest":  params.AnchorDigest,
		"explorer_url":   params.ExplorerURL,
	})
	if err != nil {
		return fmt.Errorf("encode run_anchored payload: %w", err)
	}

	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO events (
		     id,
		     run_id,
		     step_id,
		     event_type,
		     payload,
		     created_at
		   )
		   VALUES ($1, $2, NULL, $3, $4::jsonb, $5)`,
		params.RunAnchoredEventID,
		params.RunID,
		domain.EventTypeRunAnchored,
		payload,
		params.AnchoredAt,
	); err != nil {
		return fmt.Errorf("insert run_anchored event: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit run anchoring tx: %w", err)
	}
	committed = true
	return nil
}

func (r *RunLedgerRepository) ListRunSteps(ctx context.Context, runID string) ([]ports.StepRecord, error) {
	rows, err := r.db.QueryContext(
		ctx,
		`SELECT
		     id,
		     run_id,
		     client_step_id,
		     name,
		     executor_type,
		     status,
		     attempt,
		     max_retries,
		     is_financial,
		     input,
		     output,
		     created_at,
		     started_at,
		     finished_at
		   FROM steps
		  WHERE run_id = $1
		  ORDER BY created_at ASC, id ASC`,
		runID,
	)
	if err != nil {
		return nil, fmt.Errorf("select run steps: %w", err)
	}
	defer rows.Close()

	steps := make([]ports.StepRecord, 0)
	for rows.Next() {
		var (
			record     ports.StepRecord
			status     string
			outputRaw  []byte
			clientID   sql.NullString
			startedAt  sql.NullTime
			finishedAt sql.NullTime
		)
		if err := rows.Scan(
			&record.ID,
			&record.RunID,
			&clientID,
			&record.Name,
			&record.ExecutorType,
			&status,
			&record.Attempt,
			&record.MaxRetries,
			&record.IsFinancial,
			&record.Input,
			&outputRaw,
			&record.CreatedAt,
			&startedAt,
			&finishedAt,
		); err != nil {
			return nil, fmt.Errorf("scan run step row: %w", err)
		}
		if clientID.Valid {
			record.ClientStepID = clientID.String
		}
		record.Status = domain.StepStatus(status)
		if len(outputRaw) > 0 {
			record.Output = json.RawMessage(outputRaw)
		}
		if startedAt.Valid {
			value := startedAt.Time
			record.StartedAt = &value
		}
		if finishedAt.Valid {
			value := finishedAt.Time
			record.FinishedAt = &value
		}
		steps = append(steps, record)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate run steps: %w", err)
	}

	if len(steps) == 0 {
		var exists bool
		if err := r.db.QueryRowContext(
			ctx,
			`SELECT EXISTS(SELECT 1 FROM runs WHERE id = $1)`,
			runID,
		).Scan(&exists); err != nil {
			return nil, fmt.Errorf("check run existence for steps: %w", err)
		}
		if !exists {
			return nil, &domain.RunNotFoundError{RunID: runID}
		}
	}

	return steps, nil
}

func (r *RunLedgerRepository) GetStepByID(ctx context.Context, stepID string) (ports.StepRecord, error) {
	var (
		record     ports.StepRecord
		status     string
		outputRaw  []byte
		clientID   sql.NullString
		startedAt  sql.NullTime
		finishedAt sql.NullTime
	)
	if err := r.db.QueryRowContext(
		ctx,
		`SELECT
		     id,
		     run_id,
		     client_step_id,
		     name,
		     executor_type,
		     status,
		     attempt,
		     max_retries,
		     is_financial,
		     input,
		     output,
		     created_at,
		     started_at,
		     finished_at
		   FROM steps
		  WHERE id = $1`,
		stepID,
	).Scan(
		&record.ID,
		&record.RunID,
		&clientID,
		&record.Name,
		&record.ExecutorType,
		&status,
		&record.Attempt,
		&record.MaxRetries,
		&record.IsFinancial,
		&record.Input,
		&outputRaw,
		&record.CreatedAt,
		&startedAt,
		&finishedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ports.StepRecord{}, &domain.StepNotFoundError{StepID: stepID}
		}
		return ports.StepRecord{}, fmt.Errorf("select step by id: %w", err)
	}
	if clientID.Valid {
		record.ClientStepID = clientID.String
	}
	record.Status = domain.StepStatus(status)
	if len(outputRaw) > 0 {
		record.Output = json.RawMessage(outputRaw)
	}
	if startedAt.Valid {
		value := startedAt.Time
		record.StartedAt = &value
	}
	if finishedAt.Valid {
		value := finishedAt.Time
		record.FinishedAt = &value
	}
	return record, nil
}

func (r *RunLedgerRepository) CancelRunWithLedger(
	ctx context.Context,
	runID string,
	eventID string,
	cancelledAt time.Time,
) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
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
		   SET status = $1,
		       finished_at = $2
		 WHERE id = $3
		   AND status IN ($4, $5)`,
		domain.RunStatusCancelled,
		cancelledAt,
		runID,
		domain.RunStatusRunning,
		domain.RunStatusWaitingApproval,
	)
	if err != nil {
		return fmt.Errorf("update run to cancelled: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read cancel rows affected: %w", err)
	}
	if rowsAffected == 0 {
		var status string
		err := tx.QueryRowContext(ctx, `SELECT status FROM runs WHERE id = $1`, runID).Scan(&status)
		if errors.Is(err, sql.ErrNoRows) {
			return &domain.RunNotFoundError{RunID: runID}
		}
		if err != nil {
			return fmt.Errorf("select run status for cancel conflict: %w", err)
		}
		return &domain.RunCancelledError{RunID: runID}
	}

	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO events (
		     id,
		     run_id,
		     step_id,
		     event_type,
		     payload,
		     created_at
		   )
		   VALUES ($1, $2, NULL, $3, '{}'::jsonb, $4)`,
		eventID,
		runID,
		domain.EventTypeRunCancelled,
		cancelledAt,
	); err != nil {
		return fmt.Errorf("insert run_cancelled event: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}
	committed = true
	return nil
}

func (r *RunLedgerRepository) ResolveApprovalApprove(
	ctx context.Context,
	params ports.ResolveApprovalApproveParams,
) (ports.ApprovalRecord, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return ports.ApprovalRecord{}, fmt.Errorf("begin tx: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	contextRow, err := loadApprovalContext(ctx, tx, params.ApprovalID)
	if err != nil {
		return ports.ApprovalRecord{}, err
	}
	if contextRow.approvalStatus != domain.ApprovalStatusPending ||
		contextRow.stepStatus != domain.StepStatusWaitingApproval ||
		contextRow.runStatus != domain.RunStatusWaitingApproval {
		return ports.ApprovalRecord{}, &domain.ApprovalConflictError{
			ApprovalID: params.ApprovalID,
			Reason:     "approval/step/run must be pending/waiting_approval/waiting_approval",
		}
	}

	if err := updateApprovalStatus(
		ctx,
		tx,
		params.ApprovalID,
		domain.ApprovalStatusPending,
		domain.ApprovalStatusApproved,
		params.ResolvedAt,
	); err != nil {
		return ports.ApprovalRecord{}, err
	}
	if err := updateStepStatus(
		ctx,
		tx,
		contextRow.stepID,
		domain.StepStatusWaitingApproval,
		domain.StepStatusRunning,
		params.ResolvedAt,
		false,
	); err != nil {
		return ports.ApprovalRecord{}, err
	}
	if err := updateRunStatus(
		ctx,
		tx,
		contextRow.runID,
		domain.RunStatusWaitingApproval,
		domain.RunStatusRunning,
		params.ResolvedAt,
		false,
	); err != nil {
		return ports.ApprovalRecord{}, err
	}

	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO events (
		     id,
		     run_id,
		     step_id,
		     event_type,
		     payload,
		     created_at
		   )
		   VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
		params.ApprovalReceivedEventID,
		contextRow.runID,
		contextRow.stepID,
		domain.EventTypeApprovalReceived,
		`{"decision":"approved"}`,
		params.ResolvedAt,
	); err != nil {
		return ports.ApprovalRecord{}, fmt.Errorf("insert approval_received event: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return ports.ApprovalRecord{}, fmt.Errorf("commit tx: %w", err)
	}
	committed = true

	return ports.ApprovalRecord{
		ID:     params.ApprovalID,
		StepID: contextRow.stepID,
		Status: domain.ApprovalStatusApproved,
	}, nil
}

func (r *RunLedgerRepository) ResolveApprovalReject(
	ctx context.Context,
	params ports.ResolveApprovalRejectParams,
) (ports.ApprovalRecord, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return ports.ApprovalRecord{}, fmt.Errorf("begin tx: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	contextRow, err := loadApprovalContext(ctx, tx, params.ApprovalID)
	if err != nil {
		return ports.ApprovalRecord{}, err
	}
	if contextRow.approvalStatus != domain.ApprovalStatusPending ||
		contextRow.stepStatus != domain.StepStatusWaitingApproval ||
		contextRow.runStatus != domain.RunStatusWaitingApproval {
		return ports.ApprovalRecord{}, &domain.ApprovalConflictError{
			ApprovalID: params.ApprovalID,
			Reason:     "approval/step/run must be pending/waiting_approval/waiting_approval",
		}
	}

	if err := updateApprovalStatus(
		ctx,
		tx,
		params.ApprovalID,
		domain.ApprovalStatusPending,
		domain.ApprovalStatusRejected,
		params.ResolvedAt,
	); err != nil {
		return ports.ApprovalRecord{}, err
	}
	if err := updateStepStatus(
		ctx,
		tx,
		contextRow.stepID,
		domain.StepStatusWaitingApproval,
		domain.StepStatusFailed,
		params.ResolvedAt,
		true,
	); err != nil {
		return ports.ApprovalRecord{}, err
	}
	if err := updateRunStatus(
		ctx,
		tx,
		contextRow.runID,
		domain.RunStatusWaitingApproval,
		domain.RunStatusFailed,
		params.ResolvedAt,
		true,
	); err != nil {
		return ports.ApprovalRecord{}, err
	}

	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO events (
		     id,
		     run_id,
		     step_id,
		     event_type,
		     payload,
		     created_at
		   )
		   VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
		params.ApprovalReceivedEventID,
		contextRow.runID,
		contextRow.stepID,
		domain.EventTypeApprovalReceived,
		`{"decision":"rejected"}`,
		params.ResolvedAt,
	); err != nil {
		return ports.ApprovalRecord{}, fmt.Errorf("insert approval_received event(rejected): %w", err)
	}
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO events (
		     id,
		     run_id,
		     step_id,
		     event_type,
		     payload,
		     created_at
		   )
		   VALUES ($1, $2, $3, $4, '{}'::jsonb, $5)`,
		params.StepFailedEventID,
		contextRow.runID,
		contextRow.stepID,
		domain.EventTypeStepFailed,
		params.ResolvedAt,
	); err != nil {
		return ports.ApprovalRecord{}, fmt.Errorf("insert step_failed event: %w", err)
	}
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO events (
		     id,
		     run_id,
		     step_id,
		     event_type,
		     payload,
		     created_at
		   )
		   VALUES ($1, $2, NULL, $3, '{}'::jsonb, $4)`,
		params.RunFailedEventID,
		contextRow.runID,
		domain.EventTypeRunFailed,
		params.ResolvedAt,
	); err != nil {
		return ports.ApprovalRecord{}, fmt.Errorf("insert run_failed event: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return ports.ApprovalRecord{}, fmt.Errorf("commit tx: %w", err)
	}
	committed = true

	return ports.ApprovalRecord{
		ID:     params.ApprovalID,
		StepID: contextRow.stepID,
		Status: domain.ApprovalStatusRejected,
	}, nil
}

func (r *RunLedgerRepository) GetIdempotency(
	ctx context.Context,
	scope string,
	key string,
) (*ports.IdempotencyLookupResult, error) {
	return getIdempotency(ctx, r.db, scope, key)
}

func getIdempotency(
	ctx context.Context,
	db *sql.DB,
	scope string,
	key string,
) (*ports.IdempotencyLookupResult, error) {
	row := db.QueryRowContext(
		ctx,
		`SELECT request_hash, run_id
		   FROM idempotency_keys
		  WHERE scope = $1
		    AND idempotency_key = $2`,
		scope,
		key,
	)

	var result ports.IdempotencyLookupResult
	if err := row.Scan(&result.RequestHash, &result.RunID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("select idempotency key: %w", err)
	}

	return &result, nil
}

func getIdempotencyInTx(
	ctx context.Context,
	tx *sql.Tx,
	scope string,
	key string,
) (*ports.IdempotencyLookupResult, error) {
	row := tx.QueryRowContext(
		ctx,
		`SELECT request_hash, run_id
		   FROM idempotency_keys
		  WHERE scope = $1
		    AND idempotency_key = $2`,
		scope,
		key,
	)
	var result ports.IdempotencyLookupResult
	if err := row.Scan(&result.RequestHash, &result.RunID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("select idempotency key in tx: %w", err)
	}
	return &result, nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return false
}

func nullString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

type approvalContextRow struct {
	stepID         string
	runID          string
	approvalStatus domain.ApprovalStatus
	stepStatus     domain.StepStatus
	runStatus      domain.RunStatus
}

func loadApprovalContext(ctx context.Context, tx *sql.Tx, approvalID string) (approvalContextRow, error) {
	var (
		row            approvalContextRow
		approvalStatus string
		stepStatus     string
		runStatus      string
	)
	if err := tx.QueryRowContext(
		ctx,
		`SELECT
		     a.step_id,
		     s.run_id,
		     a.status,
		     s.status,
		     r.status
		   FROM approvals a
		   JOIN steps s ON s.id = a.step_id
		   JOIN runs r ON r.id = s.run_id
		  WHERE a.id = $1
		  FOR UPDATE OF a, s, r`,
		approvalID,
	).Scan(
		&row.stepID,
		&row.runID,
		&approvalStatus,
		&stepStatus,
		&runStatus,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return approvalContextRow{}, &domain.ApprovalNotFoundError{ApprovalID: approvalID}
		}
		return approvalContextRow{}, fmt.Errorf("load approval context: %w", err)
	}
	row.approvalStatus = domain.ApprovalStatus(approvalStatus)
	row.stepStatus = domain.StepStatus(stepStatus)
	row.runStatus = domain.RunStatus(runStatus)
	return row, nil
}

func updateApprovalStatus(
	ctx context.Context,
	tx *sql.Tx,
	approvalID string,
	expected domain.ApprovalStatus,
	next domain.ApprovalStatus,
	resolvedAt time.Time,
) error {
	result, err := tx.ExecContext(
		ctx,
		`UPDATE approvals
		   SET status = $1,
		       resolved_at = $2
		 WHERE id = $3
		   AND status = $4`,
		next,
		resolvedAt,
		approvalID,
		expected,
	)
	if err != nil {
		return fmt.Errorf("update approval status: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("approval rows affected: %w", err)
	}
	if rows == 0 {
		return &domain.ApprovalConflictError{
			ApprovalID: approvalID,
			Reason:     "approval status changed concurrently",
		}
	}
	return nil
}

func updateStepStatus(
	ctx context.Context,
	tx *sql.Tx,
	stepID string,
	expected domain.StepStatus,
	next domain.StepStatus,
	timestamp time.Time,
	setFinishedAt bool,
) error {
	query := `UPDATE steps
	           SET status = $1
	         WHERE id = $2
	           AND status = $3`
	args := []any{next, stepID, expected}
	if setFinishedAt {
		query = `UPDATE steps
		           SET status = $1,
		               finished_at = $2
		         WHERE id = $3
		           AND status = $4`
		args = []any{next, timestamp, stepID, expected}
	}
	result, err := tx.ExecContext(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("update step status: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("step rows affected: %w", err)
	}
	if rows == 0 {
		return &domain.ApprovalConflictError{
			ApprovalID: stepID,
			Reason:     "step status changed concurrently",
		}
	}
	return nil
}

func updateRunStatus(
	ctx context.Context,
	tx *sql.Tx,
	runID string,
	expected domain.RunStatus,
	next domain.RunStatus,
	timestamp time.Time,
	setFinishedAt bool,
) error {
	query := `UPDATE runs
	           SET status = $1
	         WHERE id = $2
	           AND status = $3`
	args := []any{next, runID, expected}
	if setFinishedAt {
		query = `UPDATE runs
		           SET status = $1,
		               finished_at = $2
		         WHERE id = $3
		           AND status = $4`
		args = []any{next, timestamp, runID, expected}
	}
	result, err := tx.ExecContext(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("update run status: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("run rows affected: %w", err)
	}
	if rows == 0 {
		return &domain.ApprovalConflictError{
			ApprovalID: runID,
			Reason:     "run status changed concurrently",
		}
	}
	return nil
}
