package sip

// ==========================================================================
// CGo preamble: compiler/linker flags.
// The actual C implementation resides in phone_pjsip.c.
// ==========================================================================

// #cgo CFLAGS: -I/opt/homebrew/Cellar/pjproject/2.17/include -DPJ_M_ARM64=1 -DPJ_IS_LITTLE_ENDIAN=1 -DPJ_IS_BIG_ENDIAN=0
// #cgo LDFLAGS: -L/opt/homebrew/Cellar/pjproject/2.17/lib -L/opt/homebrew/opt/openssl@3/lib -lpjsua2-aarch64-apple-darwin25.4.0 -lpjsua-aarch64-apple-darwin25.4.0 -lpjsip-ua-aarch64-apple-darwin25.4.0 -lpjsip-simple-aarch64-apple-darwin25.4.0 -lpjsip-aarch64-apple-darwin25.4.0 -lpjmedia-codec-aarch64-apple-darwin25.4.0 -lpjmedia-videodev-aarch64-apple-darwin25.4.0 -lpjmedia-audiodev-aarch64-apple-darwin25.4.0 -lpjmedia-aarch64-apple-darwin25.4.0 -lpjnath-aarch64-apple-darwin25.4.0 -lpjlib-util-aarch64-apple-darwin25.4.0 -lpj-aarch64-apple-darwin25.4.0 -lsrtp-aarch64-apple-darwin25.4.0 -lresample-aarch64-apple-darwin25.4.0 -lgsmcodec-aarch64-apple-darwin25.4.0 -lspeex-aarch64-apple-darwin25.4.0 -lilbccodec-aarch64-apple-darwin25.4.0 -lg7221codec-aarch64-apple-darwin25.4.0 -lyuv-aarch64-apple-darwin25.4.0 -lwebrtc-aarch64-apple-darwin25.4.0 -lssl -lcrypto -lm -lpthread
// #cgo darwin LDFLAGS: -framework AudioToolbox -framework CoreAudio -framework CoreServices -framework AudioUnit -framework Foundation -framework AppKit -framework AVFoundation -framework CoreGraphics -framework QuartzCore -framework CoreVideo -framework CoreMedia -framework Metal -framework MetalKit -framework VideoToolbox
//
// #include "pjsip_bridge.h"
// #include <stdlib.h>
import "C"

// Force rebuild v4
import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"
	"unsafe"
)

// globalPhone is the package-level reference used by CGo callbacks to route
// events back to the active PJSIPPhone instance. PJSUA supports only one
// endpoint per process, so a single global is appropriate.
var (
	globalPhone     *PJSIPPhone
	globalPhoneLock sync.Mutex
)

// ---------------------------------------------------------------------------
// CGo callback exports -- called from C on the PJSUA thread.
// They must be safe to call from any OS thread.
// ---------------------------------------------------------------------------

//export goRegCallback
func goRegCallback(statusCode C.int, reason *C.char) {
	globalPhoneLock.Lock()
	p := globalPhone
	globalPhoneLock.Unlock()

	if p == nil {
		return
	}

	code := int(statusCode)
	goReason := ""
	if reason != nil {
		goReason = C.GoString(reason)
	}

	log.Printf("[PJSIP] Registration callback: status=%d reason=%s", code, goReason)

	p.mu.Lock()
	defer p.mu.Unlock()

	switch {
	case code == 200:
		p.setRegStatusLocked(RegRegistered)
	case code == 0:
		p.setRegStatusLocked(RegFailed)
		if p.regCb.OnRegistrationFailed != nil {
			go p.regCb.OnRegistrationFailed(code, goReason)
		}
	default:
		if code >= 400 {
			p.setRegStatusLocked(RegFailed)
			if p.regCb.OnRegistrationFailed != nil {
				go p.regCb.OnRegistrationFailed(code, goReason)
			}
		} else {
			p.setRegStatusLocked(RegConnecting)
		}
	}
}

//export goCallCallback
func goCallCallback(eventType C.int, data *C.char) {
	globalPhoneLock.Lock()
	p := globalPhone
	globalPhoneLock.Unlock()

	if p == nil {
		return
	}

	goData := ""
	if data != nil {
		goData = C.GoString(data)
	}

	et := int(eventType)
	log.Printf("[PJSIP] Call callback: event=%d data=%s", et, goData)

	p.mu.Lock()
	defer p.mu.Unlock()

	switch et {
	case 0: // progress
		p.callState = CallRinging
		if p.callCb.OnProgress != nil {
			go p.callCb.OnProgress(goData)
		}

	case 1: // accepted (183/200 early)
		p.callState = CallRinging
		if p.callCb.OnAccepted != nil {
			go p.callCb.OnAccepted()
		}

	case 2: // confirmed (media established)
		p.callState = CallInProgress
		if p.callCb.OnConfirmed != nil {
			go p.callCb.OnConfirmed()
		}

	case 3: // hangup (normal disconnect)
		p.callState = CallIdle
		if p.callCb.OnHangup != nil {
			go p.callCb.OnHangup(goData)
		}

	case 4: // failed (error)
		p.callState = CallIdle
		code := 0
		reason := goData
		for i, c := range goData {
			if c == ':' {
				fmt.Sscanf(goData[:i], "%d", &code)
				reason = goData[i+1:]
				break
			}
		}
		if p.callCb.OnFailed != nil {
			go p.callCb.OnFailed(code, reason)
		}

	case 5: // incoming call
		p.callState = CallRinging
		if p.callCb.OnIncomingCall != nil {
			go p.callCb.OnIncomingCall(goData)
		}
	}
}

// ---------------------------------------------------------------------------
// PJSIPPhone -- real PJSIP implementation via CGo
// ---------------------------------------------------------------------------

// PJSIPPhone implements the Phone interface using the PJSUA C library.
type PJSIPPhone struct {
	mu             sync.RWMutex
	params         Params
	regStatus      RegStatus
	callState      CallState
	callCb         CallCallbacks
	regCb          RegCallbacks
	handle         *C.struct_pjsip_phone
	maxReconnect   int
	reconnectCount int
	initVersion    int
}

// NewPJSIPPhone creates a new PJSIP phone instance backed by a real PJSUA handle.
func NewPJSIPPhone() *PJSIPPhone {
	handle := C.pjsip_phone_create()
	return &PJSIPPhone{
		handle:       handle,
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

	log.Printf("[PJSIP] Initializing with domain=%s port=%s protocol=%s user=%s",
		params.Domain, params.Port, params.Protocol, params.Username)

	// If already initialised from a previous Init() call, tear down first.
	if p.handle != nil {
		C.pjsip_phone_destroy(p.handle)
		p.handle = nil
	}

	p.handle = C.pjsip_phone_create()
	if p.handle == nil {
		return fmt.Errorf("pjsip_phone_create failed: out of memory")
	}

	// Register as the global phone so CGo callbacks can find us.
	globalPhoneLock.Lock()
	globalPhone = p
	globalPhoneLock.Unlock()

	// Install CGo callback bridges.
	C.pjsip_phone_set_reg_callback(p.handle, nil)
	C.pjsip_phone_set_call_callback(p.handle, nil)
	// The actual Go callback functions are called from the C callbacks via
	// the extern goRegCallback / goCallCallback declarations.  We pass nil
	// here because the C callbacks call goRegCallback / goCallCallback
	// directly (declared extern in the preamble).

	// Parse port (default 5060).
	port := 5060
	if params.Port != "" {
		if _, err := fmt.Sscanf(params.Port, "%d", &port); err != nil || port <= 0 {
			port = 5060
		}
	}

	cDomain := C.CString(params.Domain)
	defer C.free(unsafe.Pointer(cDomain))
	cProtocol := C.CString(params.Protocol)
	defer C.free(unsafe.Pointer(cProtocol))
	cUsername := C.CString(params.Username)
	defer C.free(unsafe.Pointer(cUsername))
	cPassword := C.CString(params.Password)
	defer C.free(unsafe.Pointer(cPassword))
	var cProxy *C.char
	if params.Proxy != "" {
		cProxy = C.CString(params.Proxy)
		defer C.free(unsafe.Pointer(cProxy))
	}

	status := C.pjsip_phone_init(p.handle, cDomain, C.int(port), cProtocol, cUsername, cPassword, cProxy)
	if status != 0 {
		C.pjsip_phone_destroy(p.handle)
		p.handle = nil

		globalPhoneLock.Lock()
		globalPhone = nil
		globalPhoneLock.Unlock()

		return fmt.Errorf("pjsip_phone_init failed with code %d", int(status))
	}

	p.setRegStatusLocked(RegConnected)
	return nil
}

func (p *PJSIPPhone) Register() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.regStatus == RegRegistered {
		return nil
	}

	if p.handle == nil {
		return fmt.Errorf("not initialized")
	}

	p.setRegStatusLocked(RegConnecting)
	log.Printf("[PJSIP] Registering %s@%s", p.params.Username, p.params.Domain)

	status := C.pjsip_phone_register(p.handle)
	if status != 0 {
		if int(status) == 171001 {
			log.Printf("[PJSIP] Register already in progress (PJSIP_EBUSY), ignoring error")
			return nil
		}
		p.setRegStatusLocked(RegFailed)
		return fmt.Errorf("pjsip_phone_register failed: code %d", int(status))
	}

	// Registration result arrives asynchronously via goRegCallback.
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

	if p.handle == nil {
		return fmt.Errorf("not initialized")
	}

	log.Printf("[PJSIP] Calling %s", phoneNumber)

	cNumber := C.CString(phoneNumber)
	defer C.free(unsafe.Pointer(cNumber))

	var cHeaders *C.char
	if len(extraHeaders) > 0 {
		headersJSON, err := json.Marshal(extraHeaders)
		if err != nil {
			return fmt.Errorf("failed to marshal extra headers: %w", err)
		}
		cHeaders = C.CString(string(headersJSON))
		defer C.free(unsafe.Pointer(cHeaders))
	}

	status := C.pjsip_phone_call(p.handle, cNumber, cHeaders)
	if status != 0 {
		return fmt.Errorf("pjsip_phone_call failed: code %d", int(status))
	}

	p.callState = CallRinging
	return nil
}

func (p *PJSIPPhone) Answer() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.callState != CallRinging {
		return fmt.Errorf("no incoming call to answer")
	}

	if p.handle == nil {
		return fmt.Errorf("not initialized")
	}

	log.Printf("[PJSIP] Answering call")

	status := C.pjsip_phone_answer(p.handle)
	if status != 0 {
		return fmt.Errorf("pjsip_phone_answer failed: code %d", int(status))
	}

	p.callState = CallInProgress
	return nil
}

func (p *PJSIPPhone) Hangup(reason string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.callState == CallIdle {
		return nil
	}

	if p.handle == nil {
		return fmt.Errorf("not initialized")
	}

	log.Printf("[PJSIP] Hanging up: %s", reason)

	var cReason *C.char
	if reason != "" {
		cReason = C.CString(reason)
		defer C.free(unsafe.Pointer(cReason))
	}

	cHangupHeader := C.CString(reason)
	defer C.free(unsafe.Pointer(cHangupHeader))

	status := C.pjsip_phone_hangup(p.handle, cReason, cHangupHeader)
	p.callState = CallIdle

	if status != 0 {
		return fmt.Errorf("pjsip_phone_hangup failed: code %d", int(status))
	}
	return nil
}

func (p *PJSIPPhone) SendDTMF(digit string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.callState != CallInProgress {
		return fmt.Errorf("not in call")
	}

	if p.handle == nil {
		return fmt.Errorf("not initialized")
	}

	log.Printf("[PJSIP] Sending DTMF: %s", digit)

	cDigits := C.CString(digit)
	defer C.free(unsafe.Pointer(cDigits))

	status := C.pjsip_phone_send_dtmf(p.handle, cDigits)
	if status != 0 {
		return fmt.Errorf("pjsip_phone_send_dtmf failed: code %d", int(status))
	}
	return nil
}

func (p *PJSIPPhone) Stop() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	log.Printf("[PJSIP] Stopping")

	if p.handle != nil {
		C.pjsip_phone_destroy(p.handle)
		p.handle = nil
	}

	globalPhoneLock.Lock()
	globalPhone = nil
	globalPhoneLock.Unlock()

	p.callState = CallIdle
	p.regStatus = RegUnregistered
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

// setRegStatusLocked updates registration status and fires the corresponding
// callback. Must be called with p.mu already held.
func (p *PJSIPPhone) setRegStatusLocked(s RegStatus) {
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
		p.reconnectCount = 0
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

// ---------------------------------------------------------------------------
// Auto-reconnect
// ---------------------------------------------------------------------------

// StartAutoReconnect monitors registration status and reconnects automatically.
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
					log.Printf("[PJSIP] Auto-reconnect attempt %d/%d",
						p.reconnectCount, p.maxReconnect)
					if err := p.Register(); err != nil {
						log.Printf("[PJSIP] Auto-reconnect failed: %v", err)
					}
				}
			}
		}
	}
}
