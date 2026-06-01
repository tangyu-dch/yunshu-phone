package api

import (
	"encoding/json"
	"fmt"
)

// --- Login / Auth ---

type LoginParams struct {
	Account  string `json:"account"`
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResult struct {
	UserInfo            UserInfo `json:"userInfo"`
	Token               string   `json:"token"`
	InactivityDuration  int      `json:"inactivityDurationSec"`
	WhitelistDomains    string   `json:"whitelistDomains"`
}

type UserInfo struct {
	ID           int        `json:"id"`
	Username     string     `json:"username"`
	SeatNumber   string     `json:"seatNumber"`
	RoleDetail   RoleDetail `json:"roleDetail"`
}

type RoleDetail struct {
	Permissions []string `json:"permissions"`
}

// Login performs the dialpad login
func Login(params LoginParams) (*LoginResult, error) {
	resp, err := Default().Post("/mer/auth/dialpad/login", params)
	if err != nil {
		return nil, err
	}
	if resp.Code != 200 {
		return nil, fmt.Errorf("login failed: %s", resp.Message)
	}
	var result LoginResult
	if err := json.Unmarshal(resp.Data, &result); err != nil {
		return nil, fmt.Errorf("parse login result: %w", err)
	}
	return &result, nil
}

// Logout performs the dialpad logout
func Logout() error {
	_, err := Default().Post("/mer/auth/dialpad/logout", nil)
	return err
}

// --- SIP Extension ---

type ExtensionInfo struct {
	Number     string `json:"number"`     // encrypted
	Password   string `json:"password"`   // encrypted
	Domain     string `json:"domain"`
	Port       string `json:"port"`
	Protocol   string `json:"protocol"`
	ICEServers string `json:"iceServers"`
}

// GetExtensionInfo fetches SIP extension credentials
func GetExtensionInfo() (*ExtensionInfo, error) {
	resp, err := Default().Get("/mer/v1/user/dialpad/extensionInfo")
	if err != nil {
		return nil, err
	}
	if resp.Code != 200 {
		return nil, fmt.Errorf("get extension info: %s", resp.Message)
	}
	var info ExtensionInfo
	if err := json.Unmarshal(resp.Data, &info); err != nil {
		return nil, fmt.Errorf("parse extension info: %w", err)
	}
	return &info, nil
}

// CheckValidNumber checks if user has a valid caller number
func CheckValidNumber() (bool, error) {
	resp, err := Default().Get("/mer/v1/user/dialpad/checkIfUserHasValidNumber")
	if err != nil {
		return false, err
	}
	return resp.Code == 200, nil
}

// --- Call ---

type CallParams struct {
	CalledNumber string            `json:"calledNumber"` // encrypted phone number
	Extra        map[string]string `json:"extra,omitempty"`
}

// MakeCall initiates an outbound call via API
func MakeCall(params CallParams) error {
	resp, err := Default().Post("/mer/v1/call", params)
	if err != nil {
		return err
	}
	if resp.Code != 200 {
		return fmt.Errorf("make call: %s", resp.Message)
	}
	return nil
}

// HangupCall sends a server-side hangup
func HangupCall(callID string) error {
	body := map[string]string{"callId": callID}
	resp, err := Default().Post("/cti/hangup", body)
	if err != nil {
		return err
	}
	if resp.Code != 200 {
		return fmt.Errorf("hangup: %s", resp.Message)
	}
	return nil
}

// --- Call Records ---

type CallPageParams struct {
	Page  int `json:"page"`
	Limit int `json:"limit"`
}

type CallPageResult struct {
	List    []CallRecord `json:"list"`
	Total   int          `json:"total"`
	HasMore bool         `json:"hasMore"`
}

type CallRecord struct {
	ID          int    `json:"id"`
	CalledNum   string `json:"calledNumber"`
	Status      string `json:"status"`
	Duration    int    `json:"duration"`
	Location    string `json:"location"`
	CreatedAt   string `json:"createdAt"`
}

type CallTotalResult struct {
	TodayTotal       int     `json:"todayTotal"`
	TodayConnected   int     `json:"todayConnected"`
	TodayDisconnected int    `json:"todayDisconnected"`
	MonthTotal       int     `json:"monthTotal"`
	MonthConnected   int     `json:"monthConnected"`
	Over30sToday     int     `json:"over30sToday"`
	Over30sMonth     int     `json:"over30sMonth"`
	Over30sRateToday float64 `json:"over30sRateToday"`
	Over30sRateMonth float64 `json:"over30sRateMonth"`
}

// GetCallPage fetches paginated call records
func GetCallPage(params CallPageParams) (*CallPageResult, error) {
	resp, err := Default().Post("/mer/v1/record/dialpad/call-page", params)
	if err != nil {
		return nil, err
	}
	if resp.Code != 200 {
		return nil, fmt.Errorf("get call page: %s", resp.Message)
	}
	var result CallPageResult
	if err := json.Unmarshal(resp.Data, &result); err != nil {
		return nil, fmt.Errorf("parse call page: %w", err)
	}
	return &result, nil
}

// GetCallTotal fetches call statistics
func GetCallTotal() (*CallTotalResult, error) {
	resp, err := Default().Get("/mer/v1/record/dialpad/call-total")
	if err != nil {
		return nil, err
	}
	if resp.Code != 200 {
		return nil, fmt.Errorf("get call total: %s", resp.Message)
	}
	var result CallTotalResult
	if err := json.Unmarshal(resp.Data, &result); err != nil {
		return nil, fmt.Errorf("parse call total: %w", err)
	}
	return &result, nil
}

// --- Batch Call / Auto Call ---

type WsPauseStatus struct {
	HasTask bool   `json:"hasTask"`
	TaskID  string `json:"taskId"`
}

// GetWsPauseStatus checks if there's a paused auto-call task
func GetWsPauseStatus(userID int) (*WsPauseStatus, error) {
	resp, err := Default().Get(fmt.Sprintf("/mer/v1/batch-call-dialpad/ws-pause-status?userId=%d", userID))
	if err != nil {
		return nil, err
	}
	if resp.Code != 200 {
		return nil, nil // no paused task
	}
	var result WsPauseStatus
	if err := json.Unmarshal(resp.Data, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// SetWsPauseMark writes a pause mark for auto-call
func SetWsPauseMark(body map[string]interface{}) error {
	_, err := Default().Post("/mer/v1/batch-call-dialpad/ws-pause-mark", body)
	return err
}

// ApplyWsPause executes the ws pause
func ApplyWsPause(body map[string]interface{}) error {
	_, err := Default().Post("/mer/v1/batch-call-dialpad/apply-ws-pause", body)
	return err
}

// StartTask resumes a paused auto-call task
func StartTask(body map[string]interface{}) error {
	_, err := Default().Post("/mer/v1/batch-call-dialpad/start-task", body)
	return err
}

// --- Version ---

type VersionInfo struct {
	Version string `json:"version"`
}

// GetVersion fetches the latest version info
func GetVersion() (*VersionInfo, error) {
	resp, err := Default().Get("/mer/version/dialpad")
	if err != nil {
		return nil, err
	}
	if resp.Code != 200 {
		return nil, fmt.Errorf("get version: %s", resp.Message)
	}
	var result VersionInfo
	if err := json.Unmarshal(resp.Data, &result); err != nil {
		return nil, err
	}
	return &result, nil
}
