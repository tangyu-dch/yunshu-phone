package sip

import (
	"fmt"
	"log"
	"sync"
	"time"
)

// --- SIP Connection Status ---

type RegStatus int

const (
	RegUnregistered RegStatus = iota
	RegConnecting
	RegConnected
	RegRegistered
	RegFailed
)

func (s RegStatus) String() string {
	switch s {
	case RegUnregistered:
		return "unregistered"
	case RegConnecting:
		return "connecting"
	case RegConnected:
		return "connected"
	case RegRegistered:
		return "registered"
	case RegFailed:
		return "failed"
	default:
		return "unknown"
	}
}

// --- Call State ---

type CallState int

const (
	CallIdle CallState = iota
	CallRinging
	CallInProgress
)

func (s CallState) String() string {
	switch s {
	case CallIdle:
		return "idle"
	case CallRinging:
		return "ringing"
	case CallInProgress:
		return "in_progress"
	default:
		return "unknown"
	}
}

// --- Config ---

// Params holds SIP connection parameters
type Params struct {
	Domain     string     `json:"domain"`
	Port       string     `json:"port"`
	Protocol   string     `json:"protocol"`
	Username   string     `json:"username"`
	Password   string     `json:"password"`
	ICEServers []ICEServer `json:"iceServers"`
}

// ICEServer represents a STUN/TURN server
type ICEServer struct {
	URLs       string `json:"urls"`
	Username   string `json:"username,omitempty"`
	Credential string `json:"credential,omitempty"`
}

// --- Callbacks ---

// CallCallbacks defines callbacks for call events
type CallCallbacks struct {
	OnProgress    func(displayNumber string)
	OnAccepted    func()
	OnConfirmed   func()
	OnHangup      func(cause string)
	OnFailed      func(code int, reason string)
	OnError       func(err error)
	OnIncomingCall func(from string)
}

// RegCallbacks defines callbacks for SIP registration events
type RegCallbacks struct {
	OnRegistered       func()
	OnUnregistered     func()
	OnConnecting       func()
	OnConnected        func()
	OnDisconnected     func()
	OnRegistrationFailed func(code int, reason string)
}

// --- Phone (SIP Interface) ---

// Phone defines the SIP phone interface
// This abstraction allows swapping implementations (PJSIP, JsSIP bridge, etc.)
type Phone interface {
	Init(params Params) error
	Register() error
	Call(phoneNumber string, extraHeaders map[string]string) error
	Answer() error
	Hangup(reason string) error
	SendDTMF(digit string) error
	Stop() error
	GetRegStatus() RegStatus
	GetCallState() CallState
	SetCallCallbacks(cb CallCallbacks)
	SetRegCallbacks(cb RegCallbacks)
}

// --- PJSIP-based Implementation ---
// NOTE: This is the interface for PJSIP integration via CGo.
// The full PJSIP CGo binding requires the PJSIP C library to be compiled
// and linked. For the initial framework, we provide a stub implementation
// that can be replaced when PJSIP is fully integrated.
//
// To enable PJSIP:
// 1. Install PJSIP: brew install pjsip (macOS) or build from source
// 2. Set CGO flags for PJSIP headers and libraries
// 3. Build with tag: go build -tags pjsip

// PJSIPPhone implements the Phone interface using PJSIP
type PJSIPPhone struct {
	mu         sync.RWMutex
	params     Params
	regStatus  RegStatus
	callState  CallState
	callCb     CallCallbacks
	regCb      RegCallbacks
	endpointID int
	accountID  int
	callID     int
	maxReconnect int
	reconnectCount int
	initVersion int
}

// NewPJSIPPhone creates a new PJSIP phone instance
func NewPJSIPPhone() *PJSIPPhone {
	return &PJSIPPhone{
		regStatus:    RegUnregistered,
		callState:    CallIdle,
		maxReconnect: 5,
	}
}

func (p *PJSIPPhone) Init(params Params) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.params = params
	p.initVersion++

	log.Printf("[SIP] Initializing with domain=%s port=%s protocol=%s user=%s",
		params.Domain, params.Port, params.Protocol, params.Username)

	// TODO: PJSIP CGo initialization
	// pjsua_create()
	// pjsua_init() with transport config
	// pjsua_start()
	// Create account with SIP URI: sip:username@domain:port

	return nil
}

func (p *PJSIPPhone) Register() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.regStatus == RegRegistered {
		return nil
	}

	p.setRegStatus(RegConnecting)
	log.Printf("[SIP] Registering %s@%s", p.params.Username, p.params.Domain)

	// TODO: PJSIP registration
	// pjsua_acc_set_registration(acc_id, PJ_TRUE)

	return nil
}

func (p *PJSIPPhone) Call(phoneNumber string, extraHeaders map[string]string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.callState != CallIdle {
		return fmt.Errorf("already in call")
	}

	if p.regStatus != RegRegistered {
		return fmt.Errorf("not registered")
	}

	log.Printf("[SIP] Calling %s", phoneNumber)
	p.callState = CallRinging

	// TODO: PJSIP call
	// pjsua_call_make_call(acc_id, &uri, &call_opt, NULL, &msg_data, &call_id)
	// Build custom SIP headers: X-Dolphoin-Custom-*

	return nil
}

func (p *PJSIPPhone) Answer() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.callState != CallRinging {
		return fmt.Errorf("no incoming call to answer")
	}

	log.Printf("[SIP] Answering call")
	p.callState = CallInProgress

	// TODO: PJSIP answer
	// pjsua_call_answer(call_id, 200, NULL, NULL)

	return nil
}

func (p *PJSIPPhone) Hangup(reason string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.callState == CallIdle {
		return nil
	}

	log.Printf("[SIP] Hanging up: %s", reason)
	p.callState = CallIdle

	// TODO: PJSIP hangup
	// pjsua_call_hangup(call_id, 300, NULL, &msg_data with X-Dolphoin-Custom-Hangup header)

	return nil
}

func (p *PJSIPPhone) SendDTMF(digit string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.callState != CallInProgress {
		return fmt.Errorf("not in call")
	}

	log.Printf("[SIP] Sending DTMF: %s", digit)

	// TODO: PJSIP DTMF
	// pjsua_call_dial_dtmf(call_id, &digits)

	return nil
}

func (p *PJSIPPhone) Stop() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	log.Printf("[SIP] Stopping")
	p.callState = CallIdle
	p.regStatus = RegUnregistered

	// TODO: PJSIP cleanup
	// pjsua_call_hangup_all()
	// pjsua_destroy()

	return nil
}

func (p *PJSIPPhone) GetRegStatus() RegStatus {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.regStatus
}

func (p *PJSIPPhone) GetCallState() CallState {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.callState
}

func (p *PJSIPPhone) SetCallCallbacks(cb CallCallbacks) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.callCb = cb
}

func (p *PJSIPPhone) SetRegCallbacks(cb RegCallbacks) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.regCb = cb
}

func (p *PJSIPPhone) setRegStatus(s RegStatus) {
	p.regStatus = s
	switch s {
	case RegConnecting:
		if p.regCb.OnConnecting != nil {
			go p.regCb.OnConnecting()
		}
	case RegConnected:
		if p.regCb.OnConnected != nil {
			go p.regCb.OnConnected()
		}
	case RegRegistered:
		if p.regCb.OnRegistered != nil {
			go p.regCb.OnRegistered()
		}
	case RegUnregistered:
		if p.regCb.OnUnregistered != nil {
			go p.regCb.OnUnregistered()
		}
	case RegFailed:
		if p.regCb.OnRegistrationFailed != nil {
			go p.regCb.OnRegistrationFailed(0, "registration failed")
		}
	}
}

// --- Auto-reconnect ---

// StartAutoReconnect monitors and reconnects SIP automatically
func (p *PJSIPPhone) StartAutoReconnect(stopCh <-chan struct{}) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-stopCh:
			return
		case <-ticker.C:
			p.mu.RLock()
			status := p.regStatus
			p.mu.RUnlock()

			if status == RegUnregistered || status == RegFailed {
				if p.reconnectCount < p.maxReconnect {
					p.reconnectCount++
					log.Printf("[SIP] Auto-reconnect attempt %d/%d", p.reconnectCount, p.maxReconnect)
					if err := p.Register(); err != nil {
						log.Printf("[SIP] Auto-reconnect failed: %v", err)
					}
				}
			}
		}
	}
}
