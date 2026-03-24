package http

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"

	"acp/backend/internal/app"
	"acp/backend/internal/domain"
	"acp/backend/internal/ports"
)

type RunsUseCase interface {
	CreateRun(ctx context.Context, request app.CreateRunRequest) (app.CreateRunResponse, error)
	GetRun(ctx context.Context, runID string) (ports.GetRunByIDResult, error)
	ListRunSteps(ctx context.Context, runID string) ([]ports.StepRecord, error)
	GetStep(ctx context.Context, stepID string) (ports.StepRecord, error)
	ListRunEvents(ctx context.Context, runID string, limit int) ([]domain.Event, error)
	CancelRun(ctx context.Context, runID string) (app.CancelRunResponse, error)
	ApproveAction(ctx context.Context, approvalID string) (app.ApprovalActionResponse, error)
	RejectAction(ctx context.Context, approvalID string) (app.ApprovalActionResponse, error)
}

type Server struct {
	runs              RunsUseCase
	explorerTxBaseURL string
}

func NewRouter(runs RunsUseCase, apiKey string) *gin.Engine {
	return NewRouterWithConfig(runs, apiKey, "https://testnet.tonscan.org/tx")
}

func NewRouterWithConfig(runs RunsUseCase, apiKey string, explorerTxBaseURL string) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(authMiddleware(apiKey))

	server := &Server{
		runs:              runs,
		explorerTxBaseURL: strings.TrimSpace(explorerTxBaseURL),
	}
	router.POST("/runs", server.createRun)
	router.GET("/runs/:run_id", server.getRun)
	router.GET("/runs/:run_id/steps", server.listRunSteps)
	router.GET("/steps/:step_id", server.getStep)
	router.GET("/runs/:run_id/events", server.listRunEvents)
	router.POST("/approvals/:approval_id/approve", server.approveAction)
	router.POST("/approvals/:approval_id/reject", server.rejectAction)
	router.POST("/runs/:run_id/cancel", server.cancelRun)

	return router
}

func NewRouterFromEnv(runs RunsUseCase) (*gin.Engine, error) {
	apiKey := strings.TrimSpace(os.Getenv("ACP_API_KEY"))
	if apiKey == "" {
		return nil, fmt.Errorf("ACP_API_KEY is required")
	}
	explorerTxBaseURL := strings.TrimSpace(os.Getenv("ACP_TON_EXPLORER_TX_BASE_URL"))
	if explorerTxBaseURL == "" {
		explorerTxBaseURL = "https://testnet.tonscan.org/tx"
	}
	return NewRouterWithConfig(runs, apiKey, explorerTxBaseURL), nil
}

type createRunHTTPRequest struct {
	AgentID            string `json:"agent_id"`
	PolicyContractAddr string `json:"policy_contract_addr"`
	Steps              []struct {
		ClientStepID string          `json:"client_step_id"`
		Name         string          `json:"name"`
		ExecutorType string          `json:"executor_type"`
		Input        json.RawMessage `json:"input"`
		MaxRetries   int             `json:"max_retries"`
		IsFinancial  bool            `json:"is_financial"`
		DependsOn    []string        `json:"depends_on"`
	} `json:"steps"`
}

type errorEnvelope struct {
	Error errorBody `json:"error"`
}

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (s *Server) createRun(c *gin.Context) {
	var request createRunHTTPRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeError(c, http.StatusBadRequest, "policy_violation", "invalid request body")
		return
	}

	appRequest := app.CreateRunRequest{
		AgentID:            request.AgentID,
		PolicyContractAddr: request.PolicyContractAddr,
		Steps:              make([]app.CreateRunStepRequest, 0, len(request.Steps)),
		IdempotencyKey:     c.GetHeader("Idempotency-Key"),
	}
	for _, step := range request.Steps {
		appRequest.Steps = append(appRequest.Steps, app.CreateRunStepRequest{
			ClientStepID: step.ClientStepID,
			Name:         step.Name,
			ExecutorType: step.ExecutorType,
			Input:        step.Input,
			MaxRetries:   step.MaxRetries,
			IsFinancial:  step.IsFinancial,
			DependsOn:    append([]string(nil), step.DependsOn...),
		})
	}

	result, err := s.runs.CreateRun(c.Request.Context(), appRequest)
	if err != nil {
		handleDomainError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"run_id": result.RunID,
		"status": result.Status,
	})
}

func (s *Server) getRun(c *gin.Context) {
	runID := c.Param("run_id")
	result, err := s.runs.GetRun(c.Request.Context(), runID)
	if err != nil {
		handleDomainError(c, err)
		return
	}

	response := gin.H{
		"id":                   result.ID,
		"agent_id":             result.AgentID,
		"status":               result.Status,
		"policy_contract_addr": result.PolicyContractAddr,
		"created_at":           result.CreatedAt,
		"started_at":           result.StartedAt,
		"finished_at":          result.FinishedAt,
		"budget": gin.H{
			"currency":       result.Budget.Currency,
			"max_spend_nano": fmt.Sprintf("%d", result.Budget.MaxSpendNano),
			"spent_nano":     fmt.Sprintf("%d", result.Budget.SpentNano),
		},
		"anchor_tx_hash": result.AnchorTxHash,
		"anchor_digest":  result.AnchorDigest,
		"anchored_at":    result.AnchoredAt,
	}

	if result.AnchorTxHash != nil {
		response["anchor_explorer_url"] = buildExplorerTxURL(s.explorerTxBaseURL, *result.AnchorTxHash)
	} else {
		response["anchor_explorer_url"] = nil
	}

	if result.PolicySnapshot != nil {
		response["policy_snapshot"] = gin.H{
			"policy_contract_addr":    result.PolicySnapshot.PolicyContractAddr,
			"require_approval":        result.PolicySnapshot.RequireApproval,
			"max_spend_nano":          fmt.Sprintf("%d", result.PolicySnapshot.MaxSpendNano),
			"allowed_executor_hashes": result.PolicySnapshot.AllowedExecutorHashes,
			"fetched_at":              result.PolicySnapshot.FetchedAt,
		}
	} else {
		response["policy_snapshot"] = nil
	}

	c.JSON(http.StatusOK, response)
}

func (s *Server) cancelRun(c *gin.Context) {
	runID := c.Param("run_id")
	result, err := s.runs.CancelRun(c.Request.Context(), runID)
	if err != nil {
		handleDomainError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"run_id": result.RunID,
		"status": result.Status,
	})
}

func (s *Server) listRunSteps(c *gin.Context) {
	runID := c.Param("run_id")
	steps, err := s.runs.ListRunSteps(c.Request.Context(), runID)
	if err != nil {
		handleDomainError(c, err)
		return
	}

	response := make([]gin.H, 0, len(steps))
	for _, step := range steps {
		response = append(response, gin.H{
			"id":             step.ID,
			"run_id":         step.RunID,
			"name":           step.Name,
			"executor_type":  step.ExecutorType,
			"status":         step.Status,
			"attempt":        step.Attempt,
			"max_retries":    step.MaxRetries,
			"is_financial":   step.IsFinancial,
			"client_step_id": step.ClientStepID,
			"input":          unmarshalJSONOrEmpty(step.Input),
			"output":         unmarshalJSONOrNil(step.Output),
		})
	}

	c.JSON(http.StatusOK, response)
}

func (s *Server) getStep(c *gin.Context) {
	stepID := c.Param("step_id")
	step, err := s.runs.GetStep(c.Request.Context(), stepID)
	if err != nil {
		handleDomainError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":             step.ID,
		"run_id":         step.RunID,
		"name":           step.Name,
		"executor_type":  step.ExecutorType,
		"status":         step.Status,
		"attempt":        step.Attempt,
		"max_retries":    step.MaxRetries,
		"is_financial":   step.IsFinancial,
		"client_step_id": step.ClientStepID,
		"input":          unmarshalJSONOrEmpty(step.Input),
		"output":         unmarshalJSONOrNil(step.Output),
	})
}

func (s *Server) listRunEvents(c *gin.Context) {
	runID := c.Param("run_id")
	events, err := s.runs.ListRunEvents(c.Request.Context(), runID, 100)
	if err != nil {
		handleDomainError(c, err)
		return
	}

	response := make([]gin.H, 0, len(events))
	for _, event := range events {
		payload := unmarshalJSONOrEmpty(event.Payload)
		row := gin.H{
			"id":         event.ID,
			"run_id":     event.RunID,
			"event_type": event.EventType,
			"payload":    payload,
			"created_at": event.CreatedAt,
			"seq":        event.Seq,
		}
		if event.StepID != nil {
			row["step_id"] = *event.StepID
		} else {
			row["step_id"] = nil
		}
		response = append(response, row)
	}

	c.JSON(http.StatusOK, response)
}

func (s *Server) approveAction(c *gin.Context) {
	approvalID := c.Param("approval_id")
	result, err := s.runs.ApproveAction(c.Request.Context(), approvalID)
	if err != nil {
		handleDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"approval_id": result.ApprovalID,
		"status":      result.Status,
	})
}

func (s *Server) rejectAction(c *gin.Context) {
	approvalID := c.Param("approval_id")
	result, err := s.runs.RejectAction(c.Request.Context(), approvalID)
	if err != nil {
		handleDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"approval_id": result.ApprovalID,
		"status":      result.Status,
	})
}

func authMiddleware(apiKey string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := strings.TrimSpace(c.GetHeader("Authorization"))
		if !strings.HasPrefix(authHeader, "Bearer ") {
			writeError(c, http.StatusUnauthorized, "policy_violation", "unauthorized")
			c.Abort()
			return
		}

		token := strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
		if token == "" || token != apiKey {
			writeError(c, http.StatusUnauthorized, "policy_violation", "unauthorized")
			c.Abort()
			return
		}

		c.Next()
	}
}

func handleDomainError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, domain.ErrRunNotFound):
		writeError(c, http.StatusNotFound, "run_not_found", err.Error())
	case errors.Is(err, domain.ErrStepNotFound):
		writeError(c, http.StatusNotFound, "step_not_found", err.Error())
	case errors.Is(err, domain.ErrApprovalNotFound):
		writeError(c, http.StatusNotFound, "approval_not_found", err.Error())
	case errors.Is(err, domain.ErrRunCancelled):
		writeError(c, http.StatusConflict, "run_cancelled", err.Error())
	case errors.Is(err, domain.ErrPolicyViolation),
		errors.Is(err, domain.ErrApprovalConflict):
		writeError(c, http.StatusConflict, "policy_violation", err.Error())
	case errors.Is(err, domain.ErrInvalidInput),
		errors.Is(err, domain.ErrInvalidInvariant),
		errors.Is(err, domain.ErrInvalidTransition):
		writeError(c, http.StatusBadRequest, "policy_violation", err.Error())
	default:
		writeError(c, http.StatusInternalServerError, "policy_violation", "internal server error")
	}
}

func writeError(c *gin.Context, status int, code string, message string) {
	c.JSON(status, errorEnvelope{
		Error: errorBody{
			Code:    code,
			Message: message,
		},
	})
}

func unmarshalJSONOrEmpty(raw json.RawMessage) any {
	if len(raw) == 0 {
		return map[string]any{}
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return map[string]any{}
	}
	return value
}

func unmarshalJSONOrNil(raw json.RawMessage) any {
	if len(raw) == 0 {
		return nil
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil
	}
	return value
}

func buildExplorerTxURL(baseURL string, txHash string) string {
	base := strings.TrimSpace(baseURL)
	if base == "" || strings.TrimSpace(txHash) == "" {
		return ""
	}
	return strings.TrimRight(base, "/") + "/" + txHash
}
