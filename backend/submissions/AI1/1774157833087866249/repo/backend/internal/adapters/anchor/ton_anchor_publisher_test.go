package anchor

import (
	"context"
	"encoding/hex"
	"errors"
	"testing"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"acp/backend/internal/ports"
)

type anchorWalletMock struct {
	walletAddress *address.Address
	sendFn        func(ctx context.Context, message *wallet.Message) (*tlb.Transaction, *ton.BlockIDExt, error)
}

func (m *anchorWalletMock) WalletAddress() *address.Address {
	return m.walletAddress
}

func (m *anchorWalletMock) SendWaitTransaction(
	ctx context.Context,
	message *wallet.Message,
) (*tlb.Transaction, *ton.BlockIDExt, error) {
	if m.sendFn == nil {
		return &tlb.Transaction{
			Hash: []byte{0xaa, 0xbb, 0xcc},
		}, nil, nil
	}
	return m.sendFn(ctx, message)
}

func TestBuildAnchorPayload(t *testing.T) {
	digest := make([]byte, 32)
	for i := 0; i < len(digest); i++ {
		digest[i] = byte(i)
	}

	cell, err := buildAnchorPayload("run-123", digest, 5, 1700000000)
	if err != nil {
		t.Fatalf("buildAnchorPayload() unexpected error: %v", err)
	}
	parser := cell.BeginParse()

	magic := parser.MustLoadUInt(32)
	if magic != anchorPayloadMagic {
		t.Fatalf("magic=%x, want=%x", magic, anchorPayloadMagic)
	}
	runIDLength := parser.MustLoadUInt(16)
	runIDBytes, err := parser.LoadSlice(uint(runIDLength) * 8)
	if err != nil {
		t.Fatalf("LoadSlice(run_id) failed: %v", err)
	}
	runID := string(runIDBytes)
	if runID != "run-123" {
		t.Fatalf("run_id=%q, want run-123", runID)
	}
	gotDigest, err := parser.LoadSlice(256)
	if err != nil {
		t.Fatalf("LoadSlice(256) failed: %v", err)
	}
	if hex.EncodeToString(gotDigest) != hex.EncodeToString(digest) {
		t.Fatalf("digest mismatch")
	}
	eventCount := parser.MustLoadUInt(32)
	if eventCount != 5 {
		t.Fatalf("event_count=%d, want=5", eventCount)
	}
	completedAt := parser.MustLoadInt(64)
	if completedAt != 1700000000 {
		t.Fatalf("completed_at=%d, want=1700000000", completedAt)
	}
}

func TestTONAnchorPublisherSuccess(t *testing.T) {
	digest := make([]byte, 32)
	for i := range digest {
		digest[i] = byte(i + 1)
	}
	w := &anchorWalletMock{
		walletAddress: address.MustParseAddr("EQANrdEh_lJ10saEhhft5-qjQrOAwSArR244rXwrGwI8_V1l"),
		sendFn: func(_ context.Context, _ *wallet.Message) (*tlb.Transaction, *ton.BlockIDExt, error) {
			return &tlb.Transaction{
				Hash: []byte{0x01, 0x02, 0x03},
			}, nil, nil
		},
	}
	publisher, err := NewTONAnchorPublisher(w, 1_000_000, "https://testnet.tonscan.org/tx")
	if err != nil {
		t.Fatalf("NewTONAnchorPublisher() unexpected error: %v", err)
	}

	result, err := publisher.PublishRunAnchor(context.Background(), ports.PublishRunAnchorRequest{
		RunID:          "run-1",
		Digest:         digest,
		DigestHex:      hex.EncodeToString(digest),
		EventCount:     3,
		CompletedAtUTC: time.Unix(1700000000, 0).UTC(),
	})
	if err != nil {
		t.Fatalf("PublishRunAnchor() unexpected error: %v", err)
	}
	if result.TxHash == "" {
		t.Fatalf("TxHash is empty")
	}
	if result.ExplorerURL == "" {
		t.Fatalf("ExplorerURL is empty")
	}
}

func TestTONAnchorPublisherValidationAndFailure(t *testing.T) {
	w := &anchorWalletMock{
		walletAddress: address.MustParseAddr("EQANrdEh_lJ10saEhhft5-qjQrOAwSArR244rXwrGwI8_V1l"),
		sendFn: func(_ context.Context, _ *wallet.Message) (*tlb.Transaction, *ton.BlockIDExt, error) {
			return nil, nil, errors.New("send failed")
		},
	}
	publisher, err := NewTONAnchorPublisher(w, 1_000_000, "https://testnet.tonscan.org/tx")
	if err != nil {
		t.Fatalf("NewTONAnchorPublisher() unexpected error: %v", err)
	}

	_, err = publisher.PublishRunAnchor(context.Background(), ports.PublishRunAnchorRequest{
		RunID:          "run-1",
		Digest:         []byte{1, 2},
		EventCount:     1,
		CompletedAtUTC: time.Now().UTC(),
	})
	if err == nil {
		t.Fatalf("expected digest validation error")
	}

	digest := make([]byte, 32)
	_, err = publisher.PublishRunAnchor(context.Background(), ports.PublishRunAnchorRequest{
		RunID:          "run-1",
		Digest:         digest,
		EventCount:     1,
		CompletedAtUTC: time.Now().UTC(),
	})
	if err == nil {
		t.Fatalf("expected publish failure")
	}
}

func TestMockAnchorPublisherDeterministic(t *testing.T) {
	digest := make([]byte, 32)
	digest[0] = 0x42
	publisher := NewMockAnchorPublisher("https://testnet.tonscan.org/tx")

	first, err := publisher.PublishRunAnchor(context.Background(), ports.PublishRunAnchorRequest{
		RunID:          "run-1",
		Digest:         digest,
		EventCount:     2,
		CompletedAtUTC: time.Unix(1700000000, 0).UTC(),
	})
	if err != nil {
		t.Fatalf("first PublishRunAnchor() unexpected error: %v", err)
	}
	second, err := publisher.PublishRunAnchor(context.Background(), ports.PublishRunAnchorRequest{
		RunID:          "run-1",
		Digest:         digest,
		EventCount:     2,
		CompletedAtUTC: time.Unix(1700000000, 0).UTC(),
	})
	if err != nil {
		t.Fatalf("second PublishRunAnchor() unexpected error: %v", err)
	}
	if first.TxHash != second.TxHash {
		t.Fatalf("mock hash is not deterministic: %q != %q", first.TxHash, second.TxHash)
	}
}
