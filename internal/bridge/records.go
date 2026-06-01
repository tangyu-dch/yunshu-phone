package bridge

import (
	"yunshu-phone/internal/api"
)

// --- Call Records ---

type CallPageParams struct {
	Page  int `json:"page"`
	Limit int `json:"limit"`
}

// GetCallPage fetches paginated call records
func (b *CallBridge) GetCallPage(params CallPageParams) (*api.CallPageResult, error) {
	return api.GetCallPage(api.CallPageParams{
		Page:  params.Page,
		Limit: params.Limit,
	})
}

// GetCallTotal fetches call statistics (today/month)
func (b *CallBridge) GetCallTotal() (*api.CallTotalResult, error) {
	return api.GetCallTotal()
}

// --- Auto-call task management ---

type WsPauseStatusResult struct {
	HasTask bool   `json:"hasTask"`
	TaskID  string `json:"taskId"`
}

// GetWsPauseStatus checks if there's a paused auto-call task
func (b *CallBridge) GetWsPauseStatus(userID int) (*WsPauseStatusResult, error) {
	result, err := api.GetWsPauseStatus(userID)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return &WsPauseStatusResult{HasTask: false}, nil
	}
	return &WsPauseStatusResult{
		HasTask: result.HasTask,
		TaskID:  result.TaskID,
	}, nil
}

// StartTask resumes a paused auto-call task
func (b *CallBridge) StartTask(taskID string) error {
	return api.StartTask(map[string]interface{}{"taskId": taskID})
}

// SetWsPauseMark writes a pause mark for auto-call
func (b *CallBridge) SetWsPauseMark(taskID string, reason string) error {
	return api.SetWsPauseMark(map[string]interface{}{
		"taskId": taskID,
		"reason": reason,
	})
}
