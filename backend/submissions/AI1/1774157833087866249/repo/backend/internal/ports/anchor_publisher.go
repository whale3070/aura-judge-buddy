package ports

import (
	"context"
	"time"
)

type PublishRunAnchorRequest struct {
	RunID          string
	Digest         []byte
	DigestHex      string
	EventCount     int
	CompletedAtUTC time.Time
}

type PublishRunAnchorResult struct {
	TxHash      string
	ExplorerURL string
}

type AnchorPublisher interface {
	PublishRunAnchor(ctx context.Context, request PublishRunAnchorRequest) (PublishRunAnchorResult, error)
}
