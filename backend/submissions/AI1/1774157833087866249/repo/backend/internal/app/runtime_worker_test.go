package app

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type runtimeEngineMock struct {
	mu           sync.Mutex
	recoverCalls int
	tickCalls    int
	anchorCalls  int
	recoverErr   error
	tickErr      error
	anchorErr    error
	tickSignal   chan struct{}
	anchorSignal chan struct{}
}

func (m *runtimeEngineMock) Tick(_ context.Context, _ int) (int, error) {
	m.mu.Lock()
	m.tickCalls++
	signal := m.tickSignal
	err := m.tickErr
	m.mu.Unlock()

	if signal != nil {
		select {
		case signal <- struct{}{}:
		default:
		}
	}
	if err != nil {
		return 0, err
	}
	return 1, nil
}

func (m *runtimeEngineMock) RecoverStaleSteps(_ context.Context, _ int) (int, error) {
	m.mu.Lock()
	m.recoverCalls++
	err := m.recoverErr
	m.mu.Unlock()
	if err != nil {
		return 0, err
	}
	return 1, nil
}

func (m *runtimeEngineMock) AnchorCompletedRuns(_ context.Context, _ int) (int, error) {
	m.mu.Lock()
	m.anchorCalls++
	signal := m.anchorSignal
	err := m.anchorErr
	m.mu.Unlock()
	if signal != nil {
		select {
		case signal <- struct{}{}:
		default:
		}
	}
	if err != nil {
		return 0, err
	}
	return 1, nil
}

func (m *runtimeEngineMock) snapshot() (recoverCalls int, tickCalls int, anchorCalls int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.recoverCalls, m.tickCalls, m.anchorCalls
}

func TestRuntimeWorkerStartRunsRecoveryAndTicks(t *testing.T) {
	engine := &runtimeEngineMock{
		tickSignal: make(chan struct{}, 10),
	}
	worker := NewRuntimeWorker(engine, RuntimeWorkerConfig{
		TickInterval:       10 * time.Millisecond,
		TickLimit:          2,
		RecoveryBatchLimit: 5,
		AnchorBatchLimit:   3,
	}, nil)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan error, 1)
	go func() {
		done <- worker.Start(ctx)
	}()

	select {
	case <-engine.tickSignal:
	case <-time.After(300 * time.Millisecond):
		t.Fatalf("expected at least one tick call")
	}

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Start() unexpected error: %v", err)
		}
	case <-time.After(300 * time.Millisecond):
		t.Fatalf("worker did not stop after context cancel")
	}

	recoverCalls, tickCalls, anchorCalls := engine.snapshot()
	if recoverCalls != 1 {
		t.Fatalf("recoverCalls=%d, want 1", recoverCalls)
	}
	if tickCalls == 0 {
		t.Fatalf("tickCalls=%d, want >0", tickCalls)
	}
	if anchorCalls == 0 {
		t.Fatalf("anchorCalls=%d, want >0", anchorCalls)
	}
}

func TestRuntimeWorkerStartFailsOnRecoveryError(t *testing.T) {
	engine := &runtimeEngineMock{
		recoverErr: errors.New("db unavailable"),
	}
	worker := NewRuntimeWorker(engine, RuntimeWorkerConfig{
		TickInterval:       10 * time.Millisecond,
		TickLimit:          1,
		RecoveryBatchLimit: 1,
		AnchorBatchLimit:   1,
	}, nil)

	err := worker.Start(context.Background())
	if err == nil {
		t.Fatalf("Start() expected error, got nil")
	}
}

func TestRuntimeWorkerTickErrorsAreReportedAndLoopContinues(t *testing.T) {
	engine := &runtimeEngineMock{
		tickErr:    errors.New("tick failed"),
		tickSignal: make(chan struct{}, 10),
	}
	var reported atomic.Int32
	worker := NewRuntimeWorker(engine, RuntimeWorkerConfig{
		TickInterval:       10 * time.Millisecond,
		TickLimit:          1,
		RecoveryBatchLimit: 1,
		AnchorBatchLimit:   1,
	}, func(error) {
		reported.Add(1)
	})

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- worker.Start(ctx)
	}()

	select {
	case <-engine.tickSignal:
	case <-time.After(300 * time.Millisecond):
		t.Fatalf("expected at least one tick call")
	}

	time.Sleep(40 * time.Millisecond)
	cancel()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Start() unexpected error: %v", err)
		}
	case <-time.After(300 * time.Millisecond):
		t.Fatalf("worker did not stop after context cancel")
	}

	if reported.Load() == 0 {
		t.Fatalf("expected onError callback to be called")
	}
}
