package core

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/url"
	"sync"
	"time"

	"yunshu-phone/internal/api"
	"yunshu-phone/internal/config"
	"yunshu-phone/internal/crypto"
	"yunshu-phone/internal/event"
	"yunshu-phone/internal/mouse"
	"yunshu-phone/internal/server"
	"yunshu-phone/internal/sip"
	"yunshu-phone/internal/ws"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// ConnStep tracks a single connection step (SIP or WS)
type ConnStep struct {
	Name   string `json:"name"`
	Status string `json:"status"` // pending, loading, success, failed
	Error  string `json:"error,omitempty"`
}

// AppState holds the global application state
type AppState struct {
	mu sync.RWMutex

	LoggedIn         bool          `json:"loggedIn"`
	UserInfo         *api.UserInfo `json:"userInfo,omitempty"`
	Token            string        `json:"token,omitempty"`
	SeatNumber       string        `json:"seatNumber,omitempty"`
	AppVersion       string        `json:"appVersion"`
	IsCall           bool          `json:"isCall"`
	IsAutoCall       bool          `json:"isAutoCall"`
	StopCall         bool          `json:"stopCall"`
	InactiveDuration int           `json:"inactivityDurationSec"`

	// Connection steps
	ConnSteps []ConnStep `json:"connSteps"`
	ConnReady bool       `json:"connReady"`

	// Call state
	CallState    string `json:"callState"` // idle, ringing, in_progress
	CallNumber   string `json:"callNumber"`
	CallDuration int    `json:"callDuration"`
	CallID       string `json:"callId"`

	// SIP status
	SIPStatus string `json:"sipStatus"`

	// WS status
	WSStatus string `json:"wsStatus"`

	// Agent online status
	AgentOnline bool `json:"agentOnline"`

	// Permissions
	Permissions []string `json:"permissions"`
}

func (s *AppState) HasPermission(perm string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, p := range s.Permissions {
		if p == perm {
			return true
		}
	}
	return false
}

// Core is the central application coordinator.
// It wires all modules together via the event bus and manages global state.
type Core struct {
	ctx   context.Context
	bus   *event.Bus
	state AppState

	// Modules
	phone       sip.Phone
	wsClient    *ws.Client
	localServer *server.LocalServer
	mouseMon    *mouse.Monitor
	headerMon   *mouse.Monitor

	// Reconnect control
	stopReconnect  chan struct{}
	connRetries    int
	maxConnRetries int
	lastSIPParams  sip.Params

	// Call timer
	callTimerStop chan struct{}
}

// NewCore creates a new application core
func NewCore() *Core {
	return &Core{
		bus:            event.NewBus(),
		phone:          sip.NewPJSIPPhone(),
		maxConnRetries: 5,
	}
}

// Init initializes the core with a Wails context
func (c *Core) Init(ctx context.Context) {
	c.ctx = ctx
	c.setupEventHandlers()
	c.setupSIPCallbacks()

	// Set API callbacks
	api.Default().SetOnLogout(func() {
		c.bus.Emit(event.AppLogout, "login expired")
	})
	api.Default().SetOnUpgrade(func() {
		c.bus.Emit(event.AppVersionUpdate, nil)
	})

	log.Println("[Core] Initialized")
}

// GetState returns a snapshot of the current app state
func (c *Core) GetState() AppState {
	c.state.mu.RLock()
	defer c.state.mu.RUnlock()

	var userInfoCopy *api.UserInfo
	if c.state.UserInfo != nil {
		copy := *c.state.UserInfo
		userInfoCopy = &copy
	}

	connStepsCopy := make([]ConnStep, len(c.state.ConnSteps))
	copy(connStepsCopy, c.state.ConnSteps)

	permissionsCopy := make([]string, len(c.state.Permissions))
	copy(permissionsCopy, c.state.Permissions)

	return AppState{
		LoggedIn:         c.state.LoggedIn,
		UserInfo:         userInfoCopy,
		Token:            c.state.Token,
		SeatNumber:       c.state.SeatNumber,
		AppVersion:       c.state.AppVersion,
		IsCall:           c.state.IsCall,
		IsAutoCall:       c.state.IsAutoCall,
		StopCall:         c.state.StopCall,
		InactiveDuration: c.state.InactiveDuration,
		ConnSteps:        connStepsCopy,
		ConnReady:        c.state.ConnReady,
		CallState:        c.state.CallState,
		CallNumber:       c.state.CallNumber,
		CallDuration:     c.state.CallDuration,
		CallID:           c.state.CallID,
		SIPStatus:        c.state.SIPStatus,
		WSStatus:         c.state.WSStatus,
		AgentOnline:      c.state.AgentOnline,
		Permissions:      permissionsCopy,
	}
}

// --- Event wiring ---

func (c *Core) setupEventHandlers() {
	// When WS receives a callPhone task → trigger SIP call
	c.bus.On(event.WSCallPhone, func(payload interface{}) {
		data, ok := payload.(ws.CallPhoneData)
		if !ok {
			return
		}
		c.handleWSCallPhone(data)
	})

	// When WS receives ring → answer SIP
	c.bus.On(event.WSRing, func(payload interface{}) {
		c.handleWSRing(payload)
	})

	// When WS receives answer → call confirmed
	c.bus.On(event.WSAnswer, func(payload interface{}) {
		c.handleWSAnswer(payload)
	})

	// When WS receives hangup cause
	c.bus.On(event.WSHangupCause, func(payload interface{}) {
		data, _ := payload.(ws.HangupCauseData)
		c.emitToFrontend("call:hangupCause", data)
	})

	// When WS receives logout
	c.bus.On(event.WSLogout, func(_ interface{}) {
		c.handleLogout("WS")
	})

	// When HTTP client receives 401/4011 (token expired)
	c.bus.On(event.AppLogout, func(_ interface{}) {
		c.handleLogout("App")
	})

	// When WS receives system info
	c.bus.On(event.WSSystemInfo, func(payload interface{}) {
		c.emitToFrontend("app:systemInfo", payload)
	})

	// Mouse inactivity
	c.bus.On(event.MouseInactive, func(_ interface{}) {
		c.state.mu.Lock()
		c.state.AgentOnline = false
		c.state.mu.Unlock()
		c.emitToFrontend("mouse:inactive", nil)
	})

	c.bus.On(event.MouseActive, func(_ interface{}) {
		c.state.mu.Lock()
		c.state.AgentOnline = true
		c.state.mu.Unlock()
		c.emitToFrontend("mouse:active", nil)
	})

	// When API signals a version update is needed, notify frontend
	c.bus.On(event.AppVersionUpdate, func(_ interface{}) {
		c.emitToFrontend("update:check", nil)
	})
}

func (c *Core) setupSIPCallbacks() {
	c.phone.SetRegCallbacks(sip.RegCallbacks{
		OnRegistered: func() {
			c.state.mu.Lock()
			c.state.SIPStatus = "registered"
			c.state.mu.Unlock()
			c.updateConnStep("sip", "success", "")
			c.bus.Emit(event.SIPRegistered, nil)
			c.emitToFrontend("sip:registered", nil)
		},
		OnUnregistered: func() {
			c.state.mu.Lock()
			c.state.SIPStatus = "unregistered"
			c.state.mu.Unlock()
			c.emitToFrontend("sip:unregistered", nil)
		},
		OnConnecting: func() {
			c.state.mu.Lock()
			c.state.SIPStatus = "connecting"
			c.state.mu.Unlock()
			c.updateConnStep("sip", "loading", "")
		},
		OnConnected: func() {
			c.state.mu.Lock()
			c.state.SIPStatus = "connected"
			c.state.mu.Unlock()
		},
		OnDisconnected: func() {
			c.state.mu.Lock()
			c.state.SIPStatus = "disconnected"
			c.state.mu.Unlock()
			c.emitToFrontend("sip:disconnected", nil)
		},
		OnRegistrationFailed: func(code int, reason string) {
			c.state.mu.Lock()
			c.state.SIPStatus = "failed"
			c.state.mu.Unlock()
			c.updateConnStep("sip", "failed", reason)
			c.emitToFrontend("sip:failed", map[string]interface{}{"code": code, "reason": reason})
		},
	})

	c.phone.SetCallCallbacks(sip.CallCallbacks{
		OnProgress: func(displayNumber string) {
			c.state.mu.Lock()
			c.state.CallState = "ringing"
			c.state.CallNumber = displayNumber
			c.state.IsCall = true
			c.state.mu.Unlock()
			mouse.ShakeWindow()
			c.emitToFrontend("call:progress", displayNumber)
		},
		OnAccepted: func() {
			c.emitToFrontend("call:accepted", nil)
		},
		OnConfirmed: func() {
			c.state.mu.Lock()
			c.state.CallState = "in_progress"
			c.state.CallDuration = 0
			c.state.mu.Unlock()
			c.startCallTimer()
			c.emitToFrontend("call:confirmed", nil)
		},
		OnHangup: func(cause string) {
			c.resetCallState()
			c.emitToFrontend("call:ended", cause)
		},
		OnFailed: func(code int, reason string) {
			c.resetCallState()
			c.emitToFrontend("call:failed", map[string]interface{}{"code": code, "reason": reason})
		},
		OnError: func(err error) {
			log.Printf("[SIP] Error: %v", err)
		},
		OnIncomingCall: func(from string) {
			c.state.mu.Lock()
			c.state.CallState = "ringing"
			c.state.CallNumber = from
			c.state.mu.Unlock()
			mouse.ShakeWindow()
			c.emitToFrontend("call:incoming", from)
		},
	})
}

// --- Connection orchestration ---

// ConnectAll runs the 3-step connection process:
// 1. Fetch extension info
// 2. Register SIP
// 3. Connect WebSocket
func (c *Core) ConnectAll() error {
	c.state.mu.Lock()
	c.state.ConnSteps = []ConnStep{
		{Name: "extension", Status: "pending"},
		{Name: "sip", Status: "pending"},
		{Name: "websocket", Status: "pending"},
	}
	c.state.ConnReady = false
	c.connRetries = 0
	c.state.mu.Unlock()

	c.emitConnSteps()

	// Step 1: Fetch extension info
	c.updateConnStep("extension", "loading", "")
	extInfo, err := api.GetExtensionInfo()
	if err != nil {
		c.updateConnStep("extension", "failed", err.Error())
		return fmt.Errorf("fetch extension: %w", err)
	}

	valid, err := api.CheckValidNumber()
	if err != nil || !valid {
		c.updateConnStep("extension", "failed", "no valid caller number")
		return fmt.Errorf("invalid caller number")
	}
	c.updateConnStep("extension", "success", "")

	// Step 2: Initialize and register SIP
	c.updateConnStep("sip", "loading", "")
	sipNumber, err := crypto.DecryptSIPCredential(extInfo.Number)
	if err != nil {
		c.updateConnStep("sip", "failed", "decrypt number: "+err.Error())
		return err
	}
	sipPassword, err := crypto.DecryptSIPCredential(extInfo.Password)
	if err != nil {
		c.updateConnStep("sip", "failed", "decrypt password: "+err.Error())
		return err
	}

	var iceServers []sip.ICEServer
	if extInfo.ICEServers != "" {
		json.Unmarshal([]byte(extInfo.ICEServers), &iceServers)
	}

	// Extract the real SIP server IP and Port (prioritize custom SipProxy, fallback to APIBaseURL)
	realProxy := config.Get().SipProxy
	sipPort := extInfo.Port
	if realProxy != "" {
		if h, p, err := net.SplitHostPort(realProxy); err == nil {
			realProxy = h
			sipPort = p
		}
	} else {
		apiURL, err := url.Parse(config.Get().APIBaseURL)
		if err == nil && apiURL.Hostname() != "" {
			realProxy = apiURL.Hostname()
		} else {
			realProxy = "127.0.0.1" // Fallback
		}
	}

	sipParams := sip.Params{
		Domain:     extInfo.Domain,
		Proxy:      realProxy,
		Port:       sipPort,
		Protocol:   extInfo.Protocol,
		Username:   sipNumber,
		Password:   sipPassword,
		ICEServers: iceServers,
	}
	c.lastSIPParams = sipParams

	log.Printf("[Core] Connecting: initializing SIP...")
	if err := c.phone.Init(sipParams); err != nil {
		c.updateConnStep("sip", "failed", err.Error())
		return err
	}

	log.Printf("[Core] Connecting: registering SIP...")
	if err := c.phone.Register(); err != nil {
		c.updateConnStep("sip", "failed", err.Error())
		return err
	}

	log.Printf("[Core] Connecting: waiting for SIP registered callback...")
	// Wait for SIP registration (with timeout)
	if !c.waitForSIPRegistered(10 * time.Second) {
		c.updateConnStep("sip", "failed", "registration timeout")
		return fmt.Errorf("SIP registration timeout")
	}
	log.Printf("[Core] Connecting: SIP registered successfully.")

	// Step 3: Connect WebSocket
	log.Printf("[Core] Connecting: starting Step 3 (WebSocket)...")
	c.updateConnStep("websocket", "loading", "")
	if err := c.connectWebSocket(); err != nil {
		log.Printf("[Core] Connecting: WebSocket failed: %v", err)
		c.updateConnStep("websocket", "failed", err.Error())
		return err
	}
	log.Printf("[Core] Connecting: WebSocket connected successfully.")
	c.updateConnStep("websocket", "success", "")

	// All done
	c.state.mu.Lock()
	c.state.ConnReady = true
	c.state.mu.Unlock()
	c.bus.Emit(event.ConnAllReady, nil)
	c.emitToFrontend("conn:ready", nil)

	return nil
}

// DisconnectAll tears down all connections
func (c *Core) DisconnectAll() {
	if c.stopReconnect != nil {
		close(c.stopReconnect)
		c.stopReconnect = nil
	}
	if c.wsClient != nil {
		c.wsClient.Close()
		c.wsClient = nil
	}

	// Stop phone synchronously to prevent race conditions during reconnect/re-init
	func() {
		defer func() { recover() }()
		c.phone.Stop()
	}()

	c.stopCallTimer()

	c.state.mu.Lock()
	c.state.ConnReady = false
	c.state.SIPStatus = "unregistered"
	c.state.WSStatus = "disconnected"
	c.state.IsCall = false
	c.state.IsAutoCall = false
	c.state.CallState = "idle"
	c.state.mu.Unlock()
}

// --- WebSocket ---

func (c *Core) connectWebSocket() error {
	cfg := config.Get()
	c.state.mu.RLock()
	token := c.state.Token
	c.state.mu.RUnlock()

	wsCfg := ws.Config{
		URL:                  cfg.WSBaseURL,
		Token:                token,
		HeartbeatInterval:    30 * time.Second,
		HeartbeatMsg:         map[string]string{"msgType": "ping"},
		ReconnectInterval:    5 * time.Second,
		MaxReconnectAttempts: 5,
		Debug:                true,
	}

	c.wsClient = ws.NewClient(wsCfg)
	// 设置指数退避策略
	c.wsClient.SetReconnectStrategy(ws.ExponentialBackoff(
		5*time.Second,  // 基础间隔
		2*time.Minute, // 最大间隔
	))

	c.wsClient.SetStatusHandler(func(status ws.Status) {
		c.state.mu.Lock()
		c.state.WSStatus = status.String()
		c.state.mu.Unlock()
		c.emitToFrontend("ws:status", status.String())

		if status == ws.StatusConnected {
			c.updateConnStep("websocket", "success", "")
		} else if status == ws.StatusDisconnected {
			c.emitToFrontend("ws:disconnected", nil)
		}
	})

	c.wsClient.SetMessageHandler(func(msg ws.Message) {
		c.handleWSMessage(msg)
	})

	return c.wsClient.Connect()
}

func (c *Core) handleWSMessage(msg ws.Message) {
	switch msg.MsgType {
	case "pang":
		// Heartbeat response - check if version update needed
		if msg.Success != nil && !*msg.Success {
			c.emitToFrontend("app:checkVersion", nil)
		}
	case "callPhone":
		var data ws.CallPhoneData
		if err := json.Unmarshal(msg.Data, &data); err == nil {
			c.bus.Emit(event.WSCallPhone, data)
		}
	case "changeTaskStatus":
		var data ws.TaskStatusData
		if err := json.Unmarshal(msg.Data, &data); err == nil {
			c.handleWSTaskStatus(data)
		}
	case "ring":
		var data map[string]interface{}
		json.Unmarshal(msg.Data, &data)
		c.bus.Emit(event.WSRing, data)
	case "answer":
		var data map[string]interface{}
		json.Unmarshal(msg.Data, &data)
		c.bus.Emit(event.WSAnswer, data)
	case "hangupCause":
		var data ws.HangupCauseData
		if err := json.Unmarshal(msg.Data, &data); err == nil {
			c.bus.Emit(event.WSHangupCause, data)
		}
	case "logout", "LOGOUT":
		c.bus.Emit(event.WSLogout, nil)
	case "system_info":
		var data ws.SystemInfoData
		if err := json.Unmarshal(msg.Data, &data); err == nil {
			c.bus.Emit(event.WSSystemInfo, data)
		}
	}
}

// --- Business logic handlers ---

func (c *Core) handleWSCallPhone(data ws.CallPhoneData) {
	// Decrypt the phone number
	phone, err := crypto.DecryptPhoneNumber(data.Phone)
	if err != nil {
		log.Printf("[Core] Failed to decrypt phone number: %v", err)
		return
	}

	c.state.mu.RLock()
	isCall := c.state.IsCall
	stopCall := c.state.StopCall
	c.state.mu.RUnlock()

	if isCall || stopCall {
		return
	}

	// Forward to frontend with decrypted number
	c.emitToFrontend("ws:callPhone", map[string]interface{}{
		"phone":       phone,
		"type":        data.Type,
		"extra":       data.Extra,
		"taskId":      data.TaskID,
		"taskPhoneId": data.TaskPhoneID,
		"userId":      data.UserID,
	})
}

func (c *Core) handleWSRing(payload interface{}) {
	data, ok := payload.(map[string]interface{})
	if ok {
		if callID, exists := data["callId"]; exists {
			c.state.mu.Lock()
			c.state.CallID = fmt.Sprintf("%v", callID)
			c.state.mu.Unlock()
		}
	}

	// Answer the SIP call
	if err := c.phone.Answer(); err != nil {
		log.Printf("[Core] Failed to answer: %v", err)
	}

	c.state.mu.Lock()
	c.state.CallState = "ringing"
	c.state.IsCall = true
	c.state.mu.Unlock()

	c.startCallTimer()
	c.emitToFrontend("call:ring", nil)
}

func (c *Core) handleWSAnswer(payload interface{}) {
	data, ok := payload.(map[string]interface{})
	if ok {
		if callID, exists := data["callId"]; exists {
			c.state.mu.RLock()
			currentCallID := c.state.CallID
			c.state.mu.RUnlock()

			if fmt.Sprintf("%v", callID) != currentCallID {
				return // mismatched call ID
			}
		}
	}

	c.state.mu.Lock()
	c.state.CallState = "in_progress"
	c.state.CallDuration = 0
	c.state.mu.Unlock()

	// Restart timer for actual call duration
	c.stopCallTimer()
	c.startCallTimer()

	c.emitToFrontend("call:answered", nil)
}

func (c *Core) handleWSTaskStatus(data ws.TaskStatusData) {
	c.state.mu.Lock()
	if data.Option && data.AfterState == "RUNNING" {
		c.state.IsAutoCall = true
	} else if data.Option && data.AfterState == "PAUSED" {
		c.state.IsAutoCall = false
	}
	c.state.mu.Unlock()

	c.emitToFrontend("ws:taskStatus", data)
}

// --- Call actions (called from frontend via bridge) ---

// MakeCall initiates an outbound call
func (c *Core) MakeCall(phoneNumber string, platformType string, extra map[string]string) error {
	c.state.mu.RLock()
	isCall := c.state.IsCall
	c.state.mu.RUnlock()

	if isCall {
		return fmt.Errorf("already in call")
	}

	// Check valid number
	valid, err := api.CheckValidNumber()
	if err != nil || !valid {
		return fmt.Errorf("no valid caller number")
	}

	// Encrypt phone number
	encrypted, err := crypto.EncryptPhoneNumber(phoneNumber)
	if err != nil {
		return fmt.Errorf("encrypt phone: %w", err)
	}

	// Call API
	callParams := api.CallParams{
		CalledNumber: encrypted,
		Extra:        extra,
	}
	if err := api.MakeCall(callParams); err != nil {
		return err
	}

	// Build SIP headers
	sipHeaders := map[string]string{
		"X-Yunshu-Custom-PlatformType": platformType,
	}

	// Initiate SIP call
	if err := c.phone.Call(phoneNumber, sipHeaders); err != nil {
		return err
	}

	c.state.mu.Lock()
	c.state.CallState = "ringing"
	c.state.CallNumber = phoneNumber
	c.state.IsCall = true
	c.state.CallDuration = 0
	c.state.mu.Unlock()

	c.startCallTimer()
	return nil
}

// AnswerCall answers an incoming call
func (c *Core) AnswerCall() error {
	return c.phone.Answer()
}

// HangupCall ends the current call
func (c *Core) HangupCall(reason string) error {
	c.state.mu.RLock()
	callID := c.state.CallID
	c.state.mu.RUnlock()

	// Server-side hangup
	if callID != "" {
		go api.HangupCall(callID)
	}

	// SIP hangup
	err := c.phone.Hangup(reason)

	// Report to WS
	c.sendWSMessage("changeCallStatus", map[string]interface{}{
		"callId": callID,
		"status": "HANGUP",
	})

	c.resetCallState()
	return err
}

// SendDTMF sends a DTMF digit during a call
func (c *Core) SendDTMF(digit string) error {
	return c.phone.SendDTMF(digit)
}

// SendWSMessage sends a message through the business WebSocket
func (c *Core) SendWSMessage(msgType string, data interface{}) {
	c.sendWSMessage(msgType, data)
}

func (c *Core) sendWSMessage(msgType string, data interface{}) {
	if c.wsClient != nil && c.wsClient.IsConnected() {
		c.wsClient.SendJSON(msgType, data)
	}
}

// --- State helpers ---

func (c *Core) resetCallState() {
	c.stopCallTimer()

	c.state.mu.Lock()
	c.state.CallState = "idle"
	c.state.CallNumber = ""
	c.state.CallDuration = 0
	c.state.CallID = ""
	c.state.IsCall = false
	c.state.mu.Unlock()

	c.emitToFrontend("call:state", "idle")
}

func (c *Core) updateConnStep(name, status, errMsg string) {
	c.state.mu.Lock()
	for i := range c.state.ConnSteps {
		if c.state.ConnSteps[i].Name == name {
			c.state.ConnSteps[i].Status = status
			c.state.ConnSteps[i].Error = errMsg
			break
		}
	}
	steps := make([]ConnStep, len(c.state.ConnSteps))
	copy(steps, c.state.ConnSteps)
	c.state.mu.Unlock()

	c.emitToFrontend("conn:step", steps)
}

func (c *Core) emitConnSteps() {
	c.state.mu.RLock()
	steps := make([]ConnStep, len(c.state.ConnSteps))
	copy(steps, c.state.ConnSteps)
	c.state.mu.RUnlock()

	c.emitToFrontend("conn:step", steps)
}

func (c *Core) emitToFrontend(eventName string, data interface{}) {
	if c.ctx != nil {
		wailsRuntime.EventsEmit(c.ctx, eventName, data)
	}
}

// handleLogout 统一处理登出逻辑（从 WSLogout 或 AppLogout 调用）
func (c *Core) handleLogout(from string) {
	c.state.mu.RLock()
	token := c.state.Token
	alreadyLoggedOut := !c.state.LoggedIn
	c.state.mu.RUnlock()
	if alreadyLoggedOut {
		return
	}

	log.Printf("[Core] Logout from %s received, starting passive logout", from)
	// Clear state and notify frontend immediately for instant response
	c.ClearLoginState()
	c.emitToFrontend("app:forceLogout", nil)

	// Perform network/SIP cleanup in background
	go func(tok string) {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[Core] Panic during logout cleanup: %v", r)
			}
		}()
		if tok != "" {
			if err := api.ReleaseExtension(); err != nil {
				log.Printf("[Core] Release extension during logout failed: %v", err)
			}
		}
		c.DisconnectAll()
	}(token)
}

func (c *Core) waitForSIPRegistered(timeout time.Duration) bool {
	deadline := time.After(timeout)
	regChan := c.phone.RegChan()

	for {
		select {
		case <-deadline:
			return false
		case status := <-regChan:
			if status == sip.RegRegistered {
				return true
			}
			if status == sip.RegFailed {
				return false
			}
		}
	}
}

// --- Call timer ---

func (c *Core) startCallTimer() {
	c.stopCallTimer()
	c.callTimerStop = make(chan struct{})

	go func() {
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-c.callTimerStop:
				return
			case <-ticker.C:
				c.state.mu.Lock()
				c.state.CallDuration++
				dur := c.state.CallDuration
				c.state.mu.Unlock()
				c.emitToFrontend("call:tick", dur)
			}
		}
	}()
}

func (c *Core) stopCallTimer() {
	if c.callTimerStop != nil {
		close(c.callTimerStop)
		c.callTimerStop = nil
	}
}

// --- Mouse monitoring ---

// StartMouseMonitor starts the auto-call mouse inactivity monitor
func (c *Core) StartMouseMonitor(timeoutSec int) {
	if c.mouseMon != nil {
		c.mouseMon.Stop()
	}

	c.mouseMon = mouse.NewMonitor(time.Duration(timeoutSec) * time.Second)
	c.mouseMon.SetCallbacks(
		func() { c.bus.Emit(event.MouseInactive, nil) },
		func() { c.bus.Emit(event.MouseActive, nil) },
	)
	c.mouseMon.Start()
}

// StartHeaderMonitor starts the agent online status monitor
func (c *Core) StartHeaderMonitor() {
	if c.headerMon != nil {
		c.headerMon.Stop()
	}

	c.headerMon = mouse.NewMonitor(120 * time.Second)
	c.headerMon.SetCallbacks(
		func() {
			c.state.mu.Lock()
			c.state.AgentOnline = false
			c.state.mu.Unlock()
			c.emitToFrontend("agent:status", "leave")
		},
		func() {
			c.state.mu.Lock()
			c.state.AgentOnline = true
			c.state.mu.Unlock()
			c.emitToFrontend("agent:status", "online")
		},
	)
	c.headerMon.Start()
}

// ReportMouseActivity reports user mouse activity to monitors
func (c *Core) ReportMouseActivity() {
	if c.mouseMon != nil {
		c.mouseMon.ReportActivity()
	}
	if c.headerMon != nil {
		c.headerMon.ReportActivity()
	}
}

// --- Local server ---

// StartLocalServer starts the HTTPS server for CRM integration
func (c *Core) StartLocalServer(certDir string) error {
	c.localServer = server.NewLocalServer(certDir)
	c.localServer.OnCallPhone = func(data map[string]interface{}) {
		c.emitToFrontend("server:callPhone", data)
	}

	// Keep state synced
	c.bus.On(event.AppLoginSuccess, func(_ interface{}) {
		c.state.mu.RLock()
		seat := c.state.SeatNumber
		c.state.mu.RUnlock()
		c.localServer.SetLoggedIn(true, seat)
	})
	c.bus.On(event.AppLogout, func(_ interface{}) {
		c.localServer.SetLoggedIn(false, "")
	})

	return c.localServer.Start()
}

// Shutdown gracefully shuts down everything
func (c *Core) Shutdown() {
	log.Println("[Core] Starting shutdown...")

	// 超时保护
	ctx, cancel := func() (context.Context, context.CancelFunc) {
		if c.ctx != nil {
			return context.WithTimeout(c.ctx, 10*time.Second)
		}
		return context.WithTimeout(context.Background(), 10*time.Second)
	}()
	defer cancel()

	done := make(chan struct{})
	go func() {
		defer close(done)

		// 释放分机绑定（在断开连接之前调用，确保服务端能收到请求）
		c.ReleaseExtension()

		// Stop phone synchronously first to ensure the SIP account is destroyed
		// before the PJSUA library singleton is shut down.
		if err := c.phone.Stop(); err != nil {
			log.Printf("[Core] Stop phone failed: %v", err)
		}

		c.DisconnectAll()

		// 停止事件总线
		if stopBus, ok := interface{}(c.bus).(interface{Stop()}); ok {
			stopBus.Stop()
		}

		// Shut down the PJSUA singleton (process-lifetime cleanup)
		c.phone.ShutdownPJSUA()

		if c.mouseMon != nil {
			c.mouseMon.Stop()
		}
		if c.headerMon != nil {
			c.headerMon.Stop()
		}
		if c.localServer != nil {
			c.localServer.Stop()
		}
	}()

	select {
	case <-done:
		log.Println("[Core] Shutdown complete")
	case <-ctx.Done():
		log.Println("[Core] Shutdown timed out, forcefully exiting")
	}
}

// ReleaseExtension 调用服务端释放当前坐席绑定的分机。
// 在所有退出路径（正常退出、强制登出、窗口关闭）中被调用，
// 确保分机被归还到空闲池，可供其他坐席使用。
func (c *Core) ReleaseExtension() {
	c.state.mu.RLock()
	token := c.state.Token
	c.state.mu.RUnlock()

	if token == "" {
		return // 未登录，无需释放
	}

	if err := api.ReleaseExtension(); err != nil {
		log.Printf("[Core] Release extension failed (may be expected if already released): %v", err)
		// 通知前端有警告但不影响关闭流程
		c.emitToFrontend("app:warning", "释放分机失败，不影响退出")
	} else {
		log.Println("[Core] Extension released successfully")
	}
}
