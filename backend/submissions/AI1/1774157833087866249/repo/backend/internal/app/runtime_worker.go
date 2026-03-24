package app

import (
	"context"
	"fmt"
	"time"
)

const (
	defaultRuntimeTickInterval  = 250 * time.Millisecond
	defaultRuntimeTickLimit     = 50
	defaultRuntimeRecoveryLimit = 200
	defaultRuntimeAnchorLimit   = 20
)

type RuntimeEngine interface {
	Tick(ctx context.Context, limit int) (int, error)
	RecoverStaleSteps(ctx context.Context, limit int) (int, error)
	AnchorCompletedRuns(ctx context.Context, limit int) (int, error)
}

type RuntimeWorkerConfig struct {
	TickInterval       time.Duration
	TickLimit          int
	RecoveryBatchLimit int
	AnchorBatchLimit   int
}

type RuntimeWorker struct {
	engine  RuntimeEngine
	config  RuntimeWorkerConfig
	onError func(error)
}

func NewRuntimeWorker(
	engine RuntimeEngine,
	config RuntimeWorkerConfig,
	onError func(error),
) *RuntimeWorker {
	if config.TickInterval <= 0 {
		config.TickInterval = defaultRuntimeTickInterval
	}
	if config.TickLimit <= 0 {
		config.TickLimit = defaultRuntimeTickLimit
	}
	if config.RecoveryBatchLimit <= 0 {
		config.RecoveryBatchLimit = defaultRuntimeRecoveryLimit
	}
	if config.AnchorBatchLimit <= 0 {
		config.AnchorBatchLimit = defaultRuntimeAnchorLimit
	}
	if onError == nil {
		onError = func(error) {}
	}

	return &RuntimeWorker{
		engine:  engine,
		config:  config,
		onError: onError,
	}
}

func (w *RuntimeWorker) Start(ctx context.Context) error {
	if _, err := w.engine.RecoverStaleSteps(ctx, w.config.RecoveryBatchLimit); err != nil {
		return fmt.Errorf("startup recovery failed: %w", err)
	}

	ticker := time.NewTicker(w.config.TickInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			if _, err := w.engine.Tick(ctx, w.config.TickLimit); err != nil {
				w.onError(err)
			}
			if _, err := w.engine.AnchorCompletedRuns(ctx, w.config.AnchorBatchLimit); err != nil {
				w.onError(err)
			}
		}
	}
}
