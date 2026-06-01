package bridge

import (
	"context"
	"log"

	"yunshu-phone/internal/core"
)

// CallBridge handles SIP call operations.
// Bound to the Wails frontend as "CallBridge".
type CallBridge struct {
	ctx  context.Context
	core *core.Core
}

func NewCallBridge(c *core.Core) *CallBridge {
	return &CallBridge{core: c}
}

func (b *CallBridge) Startup(ctx context.Context) {
	b.ctx = ctx
}

// MakeCall initiates an outbound call to the given phone number
func (b *CallBridge) MakeCall(phoneNumber string, platformType string, extra map[string]string) error {
	log.Printf("[CallBridge] Making call to %s (platform=%s)", phoneNumber, platformType)
	return b.core.MakeCall(phoneNumber, platformType, extra)
}

// AnswerCall answers an incoming call
func (b *CallBridge) AnswerCall() error {
	log.Printf("[CallBridge] Answering call")
	return b.core.AnswerCall()
}

// HangupCall ends the current call
func (b *CallBridge) HangupCall(reason string) error {
	log.Printf("[CallBridge] Hanging up: %s", reason)
	return b.core.HangupCall(reason)
}

// SendDTMF sends a DTMF digit during an active call
func (b *CallBridge) SendDTMF(digit string) error {
	return b.core.SendDTMF(digit)
}

// GetCallState returns the current call state
func (b *CallBridge) GetCallState() map[string]interface{} {
	state := b.core.GetState()
	return map[string]interface{}{
		"state":    state.CallState,
		"number":   state.CallNumber,
		"duration": state.CallDuration,
		"isCall":   state.IsCall,
		"isAuto":   state.IsAutoCall,
	}
}

// GetSIPStatus returns the current SIP registration status
func (b *CallBridge) GetSIPStatus() string {
	return b.core.GetState().SIPStatus
}

// RetryConnection retries the full connection sequence (SIP + WS)
func (b *CallBridge) RetryConnection() error {
	b.core.DisconnectAll()
	return b.core.ConnectAll()
}

// SendWSMessage sends a business message through the WebSocket
func (b *CallBridge) SendWSMessage(msgType string, data map[string]interface{}) {
	b.core.SendWSMessage(msgType, data)
}

// SetAutoCallState updates the auto-call state (called from frontend when WS triggers)
func (b *CallBridge) SetAutoCallState(isAuto bool) {
	b.core.SetAutoCall(isAuto)
}

// SetStopCall updates the stop-call flag
func (b *CallBridge) SetStopCall(stop bool) {
	b.core.SetStopCall(stop)
}
