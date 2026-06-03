package bridge

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"runtime"
	"time"

	"yunshu-phone/internal/api"
	"yunshu-phone/internal/config"
	"yunshu-phone/internal/core"
	"yunshu-phone/internal/mouse"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// AppBridge handles authentication, configuration, and general app operations.
// Bound to the Wails frontend as "AppBridge".
type AppBridge struct {
	ctx           context.Context
	core          *core.Core
	exitConfirmed bool
}

func NewAppBridge(c *core.Core) *AppBridge {
	return &AppBridge{core: c}
}

func (b *AppBridge) Startup(ctx context.Context) {
	b.ctx = ctx
}

// --- Auth ---

type LoginParams struct {
	Account  string `json:"account"`
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResult struct {
	UserInfo            api.UserInfo `json:"userInfo"`
	Token               string       `json:"token"`
	InactivityDuration  int          `json:"inactivityDurationSec"`
	WhitelistDomains    string       `json:"whitelistDomains"`
}

// Login performs the dialpad login, validates extension, and initializes connections
func (b *AppBridge) Login(params LoginParams) (*LoginResult, error) {
	result, err := api.Login(api.LoginParams{
		Account:  params.Account,
		Username: params.Username,
		Password: params.Password,
	})
	if err != nil {
		return nil, err
	}

	// Update API client
	api.Default().SetToken(result.Token)

	// Validate extension info before allowing login
	if _, err := api.GetExtensionInfo(); err != nil {
		api.Default().SetToken("")
		return nil, fmt.Errorf("分机校验失败: %w", err)
	}
	if valid, err := api.CheckValidNumber(); err != nil || !valid {
		api.Default().SetToken("")
		return nil, fmt.Errorf("未分配或启用有效外呼号码，请联系管理员")
	}

	// Update app state via core (use exported method)
	b.core.SetLoginState(&result.UserInfo, result.Token, result.UserInfo.SeatNumber, result.InactivityDuration)

	log.Printf("[Bridge] Login success: user=%s seat=%s", result.UserInfo.Username, result.UserInfo.SeatNumber)

	return &LoginResult{
		UserInfo:           result.UserInfo,
		Token:              result.Token,
		InactivityDuration: result.InactivityDuration,
		WhitelistDomains:   result.WhitelistDomains,
	}, nil
}

// RestoreSession restores the user session from frontend localStorage on startup
func (b *AppBridge) RestoreSession(token string, userInfo api.UserInfo, inactivityDuration int) {
	api.Default().SetToken(token)
	b.core.SetLoginState(&userInfo, token, userInfo.SeatNumber, inactivityDuration)
	log.Printf("[Bridge] Session restored for user=%s seat=%s", userInfo.Username, userInfo.SeatNumber)
}

// Connect initializes SIP and WebSocket connections after login
func (b *AppBridge) Connect() error {
	return b.core.ConnectAll()
}

// Disconnect tears down all connections
func (b *AppBridge) Disconnect() {
	b.core.DisconnectAll()
}

// Logout performs logout and disconnects everything asynchronously to prevent UI freeze
// Logout performs logout and disconnects everything.
// It executes HTTP logout and extension release synchronously with a timeout
// to show a loading spinner in the UI, while teardown of local connections
// (SIP/WebSocket) is backgrounded to prevent blocking due to PJSIP/network delays.
func (b *AppBridge) Logout() error {
	token := b.core.GetState().Token

	// 1. Run local connections teardown (WS close, PJSIP Stop) in background immediately
	// because PJSUA shutdown can block for a long time due to DNS/network timeouts.
	go func() {
		defer func() { recover() }()
		b.core.DisconnectAll()
	}()

	// 2. Perform HTTP release extension and logout synchronously with a 1.5s timeout
	// so the frontend confirm modal can display a nice loading spinner.
	if token != "" {
		done := make(chan struct{})
		go func() {
			defer func() { recover() }()
			defer close(done)

			if err := api.ReleaseExtension(); err != nil {
				log.Printf("[Bridge] Release extension failed: %v", err)
			}
			_ = api.Logout()
			api.Default().SetToken("")
		}()

		select {
		case <-done:
			log.Println("[Bridge] Synchronous HTTP logout complete")
		case <-time.After(1500 * time.Millisecond):
			log.Println("[Bridge] HTTP logout timed out, proceeding")
		}
	}

	// 3. Clear local Go login state and notify local server
	b.core.ClearLoginState()

	return nil
}

// --- State ---

// GetState returns the current app state snapshot
func (b *AppBridge) GetState() core.AppState {
	return b.core.GetState()
}

// GetVersion returns the app version
func (b *AppBridge) GetVersion() string {
	return config.Get().AppVersion
}

// GetPlatform returns the current OS platform
func (b *AppBridge) GetPlatform() string {
	return runtime.GOOS
}

// --- Environment ---

// SetEnvironment switches between "production", "test", "local", and "custom"
func (b *AppBridge) SetEnvironment(env string) {
	switch env {
	case "production":
		config.SetEnv(config.EnvProduction)
	case "test":
		config.SetEnv(config.EnvTest)
	case "local":
		config.SetEnv(config.EnvLocal)
	case "custom":
		config.SetEnv(config.EnvCustom)
	}
	log.Printf("[Bridge] Environment set to: %s", env)
}

// GetEnvironment returns the current environment name
func (b *AppBridge) GetEnvironment() string {
	return string(config.Get().Env)
}

// SetCustomEnvironment updates the custom environment URLs and switches to it
func (b *AppBridge) SetCustomEnvironment(apiURL, wsURL, sipProxy string) {
	config.UpdateCustom(apiURL, wsURL, sipProxy)
	log.Printf("[Bridge] Custom environment set: API=%s, WS=%s, SIP=%s", apiURL, wsURL, sipProxy)
}

// GetConfig returns the full current config
func (b *AppBridge) GetConfig() config.Config {
	return *config.Get()
}

// --- Window control ---

// MinimizeWindow minimizes the application window
func (b *AppBridge) MinimizeWindow() {
	wailsRuntime.WindowMinimise(b.ctx)
}

// CloseWindow emits a close request event to trigger the exit confirmation dialog
func (b *AppBridge) CloseWindow() {
	wailsRuntime.EventsEmit(b.ctx, "app:closeRequest")
}

// ConfirmExit is called by the frontend after the user confirms they want to exit.
// It sets a flag to bypass OnBeforeClose and then quits the application.
func (b *AppBridge) ConfirmExit() {
	b.exitConfirmed = true
	wailsRuntime.Quit(b.ctx)
}

// IsExitConfirmed returns whether the user has confirmed exit (used by OnBeforeClose)
func (b *AppBridge) IsExitConfirmed() bool {
	return b.exitConfirmed
}

// SetExitConfirmed 外部接口用于直接更新退出确认状态标记，例如在版本升级重启时绕过确认弹窗。
func (b *AppBridge) SetExitConfirmed(val bool) {
	b.exitConfirmed = val
}

// ShowWindow brings the window to front
func (b *AppBridge) ShowWindow() {
	wailsRuntime.WindowShow(b.ctx)
}

// SetAlwaysOnTop sets whether the window stays on top
func (b *AppBridge) SetAlwaysOnTop(onTop bool) {
	wailsRuntime.WindowSetAlwaysOnTop(b.ctx, onTop)
}

// ShakeWindow triggers the window shake animation (for incoming calls)
func (b *AppBridge) ShakeWindow() {
	mouse.ShakeWindow()
}

// --- Mouse activity ---

// ReportMouseActivity is called by the frontend on mouse movement
func (b *AppBridge) ReportMouseActivity() {
	b.core.ReportMouseActivity()
}

// StartMouseMonitor starts the mouse inactivity monitor
func (b *AppBridge) StartMouseMonitor(timeoutSec int) {
	b.core.StartMouseMonitor(timeoutSec)
}

// StartHeaderMonitor starts the agent online status monitor
func (b *AppBridge) StartHeaderMonitor() {
	b.core.StartHeaderMonitor()
}

// --- Helpers ---

// ParseJSON is a utility for the frontend to parse JSON strings
func (b *AppBridge) ParseJSON(jsonStr string) (map[string]interface{}, error) {
	var result map[string]interface{}
	err := json.Unmarshal([]byte(jsonStr), &result)
	return result, err
}
