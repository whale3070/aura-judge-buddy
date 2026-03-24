package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	adapteranchor "acp/backend/internal/adapters/anchor"
	adapterexecutor "acp/backend/internal/adapters/executor"
	adapterhttp "acp/backend/internal/adapters/http"
	adapterpolicy "acp/backend/internal/adapters/policy"
	"acp/backend/internal/adapters/repository/postgres"
	"acp/backend/internal/app"
	"acp/backend/internal/domain"
	"acp/backend/internal/ports"
)

func main() {
	if err := run(); err != nil {
		log.Fatalf("acp-server failed: %v", err)
	}
}

func run() error {
	rootCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	dsn := strings.TrimSpace(os.Getenv("ACP_DATABASE_DSN"))
	if dsn == "" {
		return fmt.Errorf("ACP_DATABASE_DSN is required")
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer db.Close()

	if err := db.PingContext(rootCtx); err != nil {
		return fmt.Errorf("ping database: %w", err)
	}

	repo := postgres.NewRunsRepository(db)
	tonLiteConfigURL := getEnvString("ACP_TON_LITE_CONFIG_URL", "https://ton.org/testnet-global.config.json")
	basePolicyReader, err := adapterpolicy.NewTONPolicyReaderFromConfigURL(
		rootCtx,
		tonLiteConfigURL,
	)
	if err != nil {
		return fmt.Errorf("create ton policy reader: %w", err)
	}
	policyReader := adapterpolicy.NewCachedPolicyReader(
		basePolicyReader,
		time.Duration(getEnvInt("ACP_POLICY_CACHE_TTL_SEC", 30))*time.Second,
		nil,
	)
	tonExecutor, err := newTONStepExecutor(rootCtx, tonLiteConfigURL)
	if err != nil {
		return err
	}
	anchorPublisher, err := newRunAnchorPublisher(rootCtx, tonLiteConfigURL)
	if err != nil {
		return err
	}

	runsService := app.NewRunsService(repo, policyReader, nil, nil)

	router, err := adapterhttp.NewRouterFromEnv(runsService)
	if err != nil {
		return fmt.Errorf("create router: %w", err)
	}

	runEngine := app.NewRunEngineService(
		repo,
		ports.ExecutorRegistryMap{
			domain.ExecutorTypeHTTP: {
				Executor: adapterexecutor.NewHTTPExecutor(time.Duration(getEnvInt("ACP_HTTP_EXECUTOR_TIMEOUT_MS", 5000)) * time.Millisecond),
				Metadata: ports.ExecutorMetadata{
					Endpoint:     getEnvString("ACP_EXECUTOR_HTTP_ENDPOINT", "acp://executor/http"),
					EndpointHash: adapterexecutor.HashEndpoint(getEnvString("ACP_EXECUTOR_HTTP_ENDPOINT", "acp://executor/http")),
				},
			},
			domain.ExecutorTypeTonTransaction: {
				Executor: tonExecutor,
				Metadata: ports.ExecutorMetadata{
					Endpoint:     getEnvString("ACP_EXECUTOR_TON_ENDPOINT", "acp://executor/ton_transaction"),
					EndpointHash: adapterexecutor.HashEndpoint(getEnvString("ACP_EXECUTOR_TON_ENDPOINT", "acp://executor/ton_transaction")),
				},
			},
			domain.ExecutorTypeAgent: {
				Executor: adapterexecutor.NewHTTPExecutor(time.Duration(getEnvInt("ACP_HTTP_EXECUTOR_TIMEOUT_MS", 5000)) * time.Millisecond),
				Metadata: ports.ExecutorMetadata{
					Endpoint:     getEnvString("ACP_EXECUTOR_AGENT_ENDPOINT", "acp://executor/agent"),
					EndpointHash: adapterexecutor.HashEndpoint(getEnvString("ACP_EXECUTOR_AGENT_ENDPOINT", "acp://executor/agent")),
				},
			},
		},
		policyReader,
		anchorPublisher,
		nil,
		nil,
	)
	worker := app.NewRuntimeWorker(
		runEngine,
		app.RuntimeWorkerConfig{
			TickInterval:       time.Duration(getEnvInt("ACP_RUNTIME_TICK_INTERVAL_MS", 250)) * time.Millisecond,
			TickLimit:          getEnvInt("ACP_RUNTIME_TICK_LIMIT", 50),
			RecoveryBatchLimit: getEnvInt("ACP_RUNTIME_RECOVERY_BATCH_LIMIT", 200),
			AnchorBatchLimit:   getEnvInt("ACP_RUNTIME_ANCHOR_BATCH_LIMIT", 20),
		},
		func(err error) {
			log.Printf("runtime worker tick error: %v", err)
		},
	)

	workerErrCh := make(chan error, 1)
	go func() {
		workerErrCh <- worker.Start(rootCtx)
	}()

	server := &http.Server{
		Addr:    getEnvString("ACP_HTTP_ADDR", ":8080"),
		Handler: router,
	}

	httpErrCh := make(chan error, 1)
	go func() {
		err := server.ListenAndServe()
		if errors.Is(err, http.ErrServerClosed) {
			httpErrCh <- nil
			return
		}
		httpErrCh <- err
	}()

	select {
	case <-rootCtx.Done():
	case err := <-workerErrCh:
		if err != nil {
			stop()
			_ = shutdownHTTPServer(server)
			return fmt.Errorf("runtime worker stopped: %w", err)
		}
	case err := <-httpErrCh:
		if err != nil {
			stop()
			return fmt.Errorf("http server stopped: %w", err)
		}
	}

	if err := shutdownHTTPServer(server); err != nil {
		return err
	}

	select {
	case err := <-workerErrCh:
		if err != nil {
			return fmt.Errorf("runtime worker shutdown: %w", err)
		}
	case <-time.After(2 * time.Second):
		return fmt.Errorf("runtime worker shutdown timeout")
	}

	return nil
}

func newTONStepExecutor(ctx context.Context, tonLiteConfigURL string) (ports.StepExecutor, error) {
	mode := strings.TrimSpace(strings.ToLower(getEnvString("ACP_TON_EXECUTOR_MODE", "real")))
	switch mode {
	case "mock":
		return adapterexecutor.NewTonMockExecutor(), nil
	case "real":
		mnemonic := strings.TrimSpace(os.Getenv("ACP_TON_MNEMONIC"))
		if mnemonic == "" {
			return nil, fmt.Errorf("ACP_TON_MNEMONIC is required when ACP_TON_EXECUTOR_MODE=real")
		}
		explorerBaseURL := getEnvString("ACP_TON_EXPLORER_TX_BASE_URL", "https://testnet.tonscan.org/tx")
		executor, err := adapterexecutor.NewTONTransferExecutorFromConfigURL(
			ctx,
			tonLiteConfigURL,
			mnemonic,
			explorerBaseURL,
		)
		if err != nil {
			return nil, fmt.Errorf("create ton transfer executor: %w", err)
		}
		return executor, nil
	default:
		return nil, fmt.Errorf("unsupported ACP_TON_EXECUTOR_MODE=%q (supported: real,mock)", mode)
	}
}

func newRunAnchorPublisher(ctx context.Context, tonLiteConfigURL string) (ports.AnchorPublisher, error) {
	mode := strings.TrimSpace(strings.ToLower(getEnvString("ACP_TON_EXECUTOR_MODE", "real")))
	explorerBaseURL := getEnvString("ACP_TON_EXPLORER_TX_BASE_URL", "https://testnet.tonscan.org/tx")

	switch mode {
	case "mock":
		return adapteranchor.NewMockAnchorPublisher(explorerBaseURL), nil
	case "real":
		mnemonic := strings.TrimSpace(os.Getenv("ACP_TON_MNEMONIC"))
		if mnemonic == "" {
			return nil, fmt.Errorf("ACP_TON_MNEMONIC is required when ACP_TON_EXECUTOR_MODE=real")
		}
		amountNano := int64(getEnvInt("ACP_TON_ANCHOR_AMOUNT_NANO", 1000000))
		publisher, err := adapteranchor.NewTONAnchorPublisherFromConfigURL(
			ctx,
			tonLiteConfigURL,
			mnemonic,
			amountNano,
			explorerBaseURL,
		)
		if err != nil {
			return nil, fmt.Errorf("create ton anchor publisher: %w", err)
		}
		return publisher, nil
	default:
		return nil, fmt.Errorf("unsupported ACP_TON_EXECUTOR_MODE=%q (supported: real,mock)", mode)
	}
}

func shutdownHTTPServer(server *http.Server) error {
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shutdown http server: %w", err)
	}
	return nil
}

func getEnvString(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func getEnvInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
