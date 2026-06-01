package sip

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
	Domain     string      `json:"domain"`
	Port       string      `json:"port"`
	Protocol   string      `json:"protocol"`
	Username   string      `json:"username"`
	Password   string      `json:"password"`
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
	OnProgress     func(displayNumber string)
	OnAccepted     func()
	OnConfirmed    func()
	OnHangup       func(cause string)
	OnFailed       func(code int, reason string)
	OnError        func(err error)
	OnIncomingCall func(from string)
}

// RegCallbacks defines callbacks for SIP registration events
type RegCallbacks struct {
	OnRegistered         func()
	OnUnregistered       func()
	OnConnecting         func()
	OnConnected          func()
	OnDisconnected       func()
	OnRegistrationFailed func(code int, reason string)
}

// --- Phone (SIP Interface) ---

// Phone defines the SIP phone interface.
// This abstraction allows swapping implementations (PJSIP, JsSIP bridge, etc.)
//
// Build tag selection:
//   - Default (no tag): stub implementation in phone_stub.go
//   - -tags pjsip: real CGo implementation in phone_pjsip.go
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
