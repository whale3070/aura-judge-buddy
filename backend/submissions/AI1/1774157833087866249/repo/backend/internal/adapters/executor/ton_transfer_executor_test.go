package executor

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	"acp/backend/internal/ports"
)

type tonTransferWalletMock struct {
	transferFn func(
		ctx context.Context,
		to *address.Address,
		amount tlb.Coins,
		comment string,
	) (*tlb.Transaction, *ton.BlockIDExt, error)
}

func (m *tonTransferWalletMock) TransferWaitTransaction(
	ctx context.Context,
	to *address.Address,
	amount tlb.Coins,
	comment string,
) (*tlb.Transaction, *ton.BlockIDExt, error) {
	return m.transferFn(ctx, to, amount, comment)
}

func TestTONTransferExecutorInputValidation(t *testing.T) {
	executor := NewTONTransferExecutor(&tonTransferWalletMock{
		transferFn: func(context.Context, *address.Address, tlb.Coins, string) (*tlb.Transaction, *ton.BlockIDExt, error) {
			t.Fatal("transfer should not be called on invalid input")
			return nil, nil, nil
		},
	}, "https://testnet.tonscan.org/tx")

	cases := []struct {
		name        string
		input       string
		errorSubstr string
	}{
		{
			name:        "missing to",
			input:       `{"amount_nano":"1"}`,
			errorSubstr: "input.to is required",
		},
		{
			name:        "invalid to",
			input:       `{"to":"invalid","amount_nano":"1"}`,
			errorSubstr: "input.to is invalid",
		},
		{
			name:        "missing amount_nano",
			input:       `{"to":"EQANrdEh_lJ10saEhhft5-qjQrOAwSArR244rXwrGwI8_V1l"}`,
			errorSubstr: "input.amount_nano is required",
		},
		{
			name:        "invalid amount_nano",
			input:       `{"to":"EQANrdEh_lJ10saEhhft5-qjQrOAwSArR244rXwrGwI8_V1l","amount_nano":"1.5"}`,
			errorSubstr: "must be a base-10 int64 string",
		},
		{
			name:        "zero amount_nano",
			input:       `{"to":"EQANrdEh_lJ10saEhhft5-qjQrOAwSArR244rXwrGwI8_V1l","amount_nano":"0"}`,
			errorSubstr: "must be > 0",
		},
		{
			name:        "negative amount_nano",
			input:       `{"to":"EQANrdEh_lJ10saEhhft5-qjQrOAwSArR244rXwrGwI8_V1l","amount_nano":"-1"}`,
			errorSubstr: "must be > 0",
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			_, err := executor.Execute(context.Background(), ports.RunnableStep{
				Input: json.RawMessage(tc.input),
			})
			if err == nil {
				t.Fatalf("expected error")
			}
			if !strings.Contains(err.Error(), tc.errorSubstr) {
				t.Fatalf("error=%q does not contain %q", err.Error(), tc.errorSubstr)
			}
		})
	}
}

func TestTONTransferExecutorSuccessMapping(t *testing.T) {
	const (
		toAddr     = "EQANrdEh_lJ10saEhhft5-qjQrOAwSArR244rXwrGwI8_V1l"
		amountNano = int64(123456789)
		comment    = "hello"
	)

	executor := NewTONTransferExecutor(&tonTransferWalletMock{
		transferFn: func(_ context.Context, to *address.Address, amount tlb.Coins, gotComment string) (*tlb.Transaction, *ton.BlockIDExt, error) {
			if to.String() == "" {
				t.Fatalf("destination address is empty")
			}
			if gotComment != comment {
				t.Fatalf("comment=%q, want %q", gotComment, comment)
			}
			gotAmount := amount.Nano().Int64()
			if gotAmount != amountNano {
				t.Fatalf("amount=%d, want %d", gotAmount, amountNano)
			}
			return &tlb.Transaction{
				Hash: []byte{0xaa, 0xbb, 0xcc},
				LT:   42,
			}, nil, nil
		},
	}, "https://testnet.tonscan.org/tx")

	result, err := executor.Execute(context.Background(), ports.RunnableStep{
		Input: json.RawMessage(`{
			"to":"` + toAddr + `",
			"amount_nano":"123456789",
			"comment":"hello"
		}`),
	})
	if err != nil {
		t.Fatalf("Execute() unexpected error: %v", err)
	}
	if !result.Success {
		t.Fatalf("expected success")
	}
	if result.CostNano != amountNano {
		t.Fatalf("CostNano=%d, want %d", result.CostNano, amountNano)
	}

	var payload map[string]any
	if err := json.Unmarshal(result.Payload, &payload); err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	if payload["tx_hash"] == "" {
		t.Fatalf("payload.tx_hash is empty")
	}
	if payload["lt"] != "42" {
		t.Fatalf("payload.lt=%v, want 42", payload["lt"])
	}
	if payload["explorer_url"] == "" {
		t.Fatalf("payload.explorer_url is empty")
	}
	if payload["to"] == "" {
		t.Fatalf("payload.to is empty")
	}
	if payload["amount_nano"] != "123456789" {
		t.Fatalf("payload.amount_nano=%v, want 123456789", payload["amount_nano"])
	}
	if payload["comment"] != "hello" {
		t.Fatalf("payload.comment=%v, want hello", payload["comment"])
	}
}

func TestTONTransferExecutorTransferError(t *testing.T) {
	executor := NewTONTransferExecutor(&tonTransferWalletMock{
		transferFn: func(context.Context, *address.Address, tlb.Coins, string) (*tlb.Transaction, *ton.BlockIDExt, error) {
			return nil, nil, errors.New("wallet transfer failed")
		},
	}, "https://testnet.tonscan.org/tx")

	_, err := executor.Execute(context.Background(), ports.RunnableStep{
		Input: json.RawMessage(`{
			"to":"EQANrdEh_lJ10saEhhft5-qjQrOAwSArR244rXwrGwI8_V1l",
			"amount_nano":"1"
		}`),
	})
	if err == nil {
		t.Fatalf("expected transfer error")
	}
	if !strings.Contains(err.Error(), "send ton transfer") {
		t.Fatalf("unexpected error: %v", err)
	}
}
