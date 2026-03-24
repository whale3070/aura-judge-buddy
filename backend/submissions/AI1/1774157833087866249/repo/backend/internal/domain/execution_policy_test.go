package domain

import (
	"errors"
	"testing"
)

func TestBudgetValidate(t *testing.T) {
	tests := []struct {
		name    string
		budget  Budget
		wantErr error
	}{
		{
			name: "valid",
			budget: Budget{
				Currency:     "nanotons",
				MaxSpendNano: 10,
				SpentNano:    0,
			},
		},
		{
			name: "empty_currency",
			budget: Budget{
				Currency:     "",
				MaxSpendNano: 10,
				SpentNano:    0,
			},
			wantErr: ErrInvalidInput,
		},
		{
			name: "negative_max_spend",
			budget: Budget{
				Currency:     "nanotons",
				MaxSpendNano: -1,
				SpentNano:    0,
			},
			wantErr: ErrInvalidInvariant,
		},
		{
			name: "negative_spent",
			budget: Budget{
				Currency:     "nanotons",
				MaxSpendNano: 10,
				SpentNano:    -1,
			},
			wantErr: ErrInvalidInvariant,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			err := tt.budget.Validate()
			if tt.wantErr == nil {
				if err != nil {
					t.Fatalf("Validate() unexpected error: %v", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("Validate() expected error, got nil")
			}
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("expected %v, got %v", tt.wantErr, err)
			}
		})
	}
}

func TestPolicySnapshotValidate(t *testing.T) {
	tests := []struct {
		name    string
		policy  PolicySnapshot
		wantErr error
	}{
		{
			name: "valid",
			policy: PolicySnapshot{
				PolicyContractAddr: "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
				MaxSpendNano:       100,
			},
		},
		{
			name: "empty_contract",
			policy: PolicySnapshot{
				MaxSpendNano: 100,
			},
			wantErr: ErrInvalidInput,
		},
		{
			name: "negative_max_spend",
			policy: PolicySnapshot{
				PolicyContractAddr: "kQCxL1zmJtd65_y1hWRvXO0pwSQVpYamPVlJC8EdpzCyr3K6",
				MaxSpendNano:       -1,
			},
			wantErr: ErrInvalidInvariant,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			err := tt.policy.Validate()
			if tt.wantErr == nil {
				if err != nil {
					t.Fatalf("Validate() unexpected error: %v", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("Validate() expected error, got nil")
			}
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("expected %v, got %v", tt.wantErr, err)
			}
		})
	}
}
