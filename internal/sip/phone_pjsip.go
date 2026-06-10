package sip

// ==========================================================================
// CGo preamble: compiler/linker flags.
// The actual C implementation resides in phone_pjsip.c.
// ==========================================================================

// #cgo pkg-config: libpjproject openssl
// #cgo darwin LDFLAGS: -framework AudioToolbox -framework CoreAudio -framework CoreServices -framework AudioUnit -framework Foundation -framework AppKit -framework AVFoundation -framework CoreGraphics -framework QuartzCore -framework CoreVideo -framework CoreMedia -framework Metal -framework MetalKit -framework VideoToolbox
//
// #include "pjsip_bridge.h"
// #include <stdlib.h>
import "C"

// Force rebuild v5
import (
	"encoding/json"
	"fmt"
	"log"
	"runtime"
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

// pjsipReq is a request to execute a PJSIP operation on the dedicated OS thread.
type pjsipReq struct {
	fn  func() error
	res chan error
}

// PJSIPPhone implements the Phone interface using the PJSUA C library.
// All CGo calls to PJSIP are routed through a dedicated, OS-locked goroutine
// (pjsipCh) to guarantee thread affinity — PJSUA is a process-global singleton
// whose internal state (thread-local storage, module lists) is bound to the
// OS thread that called pjsua_create().
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
	pjsipCh        chan pjsipReq // dedicated OS thread for all PJSIP CGo calls
	regEventChan   chan RegStatus // 通知注册状态变化的channel
}

// NewPJSIPPhone creates a new PJSIP phone instance.
// A dedicated goroutine is started that locks itself to a single OS thread;
// all subsequent PJSIP CGo calls are dispatched through this goroutine to
// ensure PJSUA's thread-affinity requirements are met.
func NewPJSIPPhone() *PJSIPPhone {
	p := &PJSIPPhone{
		regStatus:    RegUnregistered,
		callState:    CallIdle,
		maxReconnect: 5,
		pjsipCh:      make(chan pjsipReq, 1),
		regEventChan: make(chan RegStatus, 1), // 带缓冲
	}
	go p.pjsipWorker()
	return p
}

// pjsipWorker is the dedicated goroutine that runs all PJSIP CGo calls.
// It locks itself to a single OS thread so that pjlib's thread-local state
// (thread registry, PJSUA endpoint) stays consistent across create/init/destroy.
func (p *PJSIPPhone) pjsipWorker() {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[PJSIP] Worker thread panicked and terminated: %v. Respawning...", r)
			go p.pjsipWorker()
		}
	}()
	for req := range p.pjsipCh {
		func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[PJSIP] Request execution panicked: %v", r)
					req.res <- fmt.Errorf("cgo panic: %v", r)
				}
			}()
			req.res <- req.fn()
		}()
	}
}

// sendPJSIP dispatches fn to the dedicated PJSIP worker and blocks until done.
func (p *PJSIPPhone) sendPJSIP(fn func() error) error {
	res := make(chan error, 1)
	p.pjsipCh <- pjsipReq{fn: fn, res: res}
	return <-res
}

func (p *PJSIPPhone) Init(params Params) error {
	p.mu.Lock()
	p.params = params
	p.initVersion++
	log.Printf("[PJSIP] Initializing with domain=%s port=%s protocol=%s user=%s",
		params.Domain, params.Port, params.Protocol, params.Username)

	// Snapshot old handle; clear it so callbacks are ignored during re-init.
	oldHandle := p.handle
	p.handle = nil
	p.mu.Unlock()

	if oldHandle != nil {
		globalPhoneLock.Lock()
		globalPhone = nil
		globalPhoneLock.Unlock()
	}

	// All C calls happen on the dedicated OS-locked worker goroutine.
	err := p.sendPJSIP(func() error {
		// Remove old SIP account (PJSUA singleton stays alive for reuse).
		if oldHandle != nil {
			log.Printf("[PJSIP] Removing previous SIP account")
			C.pjsip_phone_destroy(oldHandle)
		}

		handle := C.pjsip_phone_create()
		if handle == nil {
			return fmt.Errorf("pjsip_phone_create failed: out of memory")
		}

		C.pjsip_phone_set_reg_callback(handle, nil)
		C.pjsip_phone_set_call_callback(handle, nil)

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

		status := C.pjsip_phone_init(handle, cDomain, C.int(port), cProtocol, cUsername, cPassword, cProxy)
		if status != 0 {
			C.pjsip_phone_destroy(handle)
			return fmt.Errorf("pjsip_phone_init failed with code %d", int(status))
		}

		p.mu.Lock()
		p.handle = handle
		p.mu.Unlock()

		// Register as the global phone so CGo callbacks can find us.
		globalPhoneLock.Lock()
		globalPhone = p
		globalPhoneLock.Unlock()

		return nil
	})

	if err != nil {
		return err
	}

	p.mu.Lock()
	p.setRegStatusLocked(RegConnected)
	p.mu.Unlock()
	return nil
}

func (p *PJSIPPhone) Register() error {
	p.mu.Lock()
	if p.regStatus == RegRegistered {
		p.mu.Unlock()
		return nil
	}

	if p.handle == nil {
		p.mu.Unlock()
		return fmt.Errorf("not initialized")
	}

	p.setRegStatusLocked(RegConnecting)
	log.Printf("[PJSIP] Registering %s@%s", p.params.Username, p.params.Domain)

	handle := p.handle
	p.mu.Unlock()

	err := p.sendPJSIP(func() error {
		status := C.pjsip_phone_register(handle)
		if status != 0 {
			if int(status) == 171001 {
				log.Printf("[PJSIP] Register already in progress (PJSIP_EBUSY), ignoring error")
				return nil
			}
			return fmt.Errorf("pjsip_phone_register failed: code %d", int(status))
		}
		return nil
	})

	if err != nil {
		p.mu.Lock()
		p.setRegStatusLocked(RegFailed)
		p.mu.Unlock()
		return err
	}

	// Registration result arrives asynchronously via goRegCallback.
	return nil
}

func (p *PJSIPPhone) Call(phoneNumber string, extraHeaders map[string]string) error {
	p.mu.Lock()
	if p.callState != CallIdle {
		p.mu.Unlock()
		return fmt.Errorf("already in call")
	}

	if p.regStatus != RegRegistered {
		p.mu.Unlock()
		return fmt.Errorf("not registered")
	}

	if p.handle == nil {
		p.mu.Unlock()
		return fmt.Errorf("not initialized")
	}

	log.Printf("[PJSIP] Calling %s", phoneNumber)

	handle := p.handle
	p.mu.Unlock()

	err := p.sendPJSIP(func() error {
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

		status := C.pjsip_phone_call(handle, cNumber, cHeaders)
		if status != 0 {
			return fmt.Errorf("pjsip_phone_call failed: code %d", int(status))
		}
		return nil
	})

	if err != nil {
		return err
	}

	p.mu.Lock()
	p.callState = CallRinging
	p.mu.Unlock()
	return nil
}

func (p *PJSIPPhone) Answer() error {
	p.mu.Lock()
	if p.callState != CallRinging {
		p.mu.Unlock()
		return fmt.Errorf("no incoming call to answer")
	}

	if p.handle == nil {
		p.mu.Unlock()
		return fmt.Errorf("not initialized")
	}

	log.Printf("[PJSIP] Answering call")

	handle := p.handle
	p.mu.Unlock()

	err := p.sendPJSIP(func() error {
		status := C.pjsip_phone_answer(handle)
		if status != 0 {
			return fmt.Errorf("pjsip_phone_answer failed: code %d", int(status))
		}
		return nil
	})

	if err != nil {
		return err
	}

	p.mu.Lock()
	p.callState = CallInProgress
	p.mu.Unlock()
	return nil
}

func (p *PJSIPPhone) Hangup(reason string) error {
	p.mu.Lock()
	if p.callState == CallIdle {
		p.mu.Unlock()
		return nil
	}

	if p.handle == nil {
		p.mu.Unlock()
		return fmt.Errorf("not initialized")
	}

	log.Printf("[PJSIP] Hanging up: %s", reason)

	handle := p.handle
	p.mu.Unlock()

	err := p.sendPJSIP(func() error {
		var cReason *C.char
		if reason != "" {
			cReason = C.CString(reason)
			defer C.free(unsafe.Pointer(cReason))
		}
		cHangupHeader := C.CString(reason)
		defer C.free(unsafe.Pointer(cHangupHeader))

		status := C.pjsip_phone_hangup(handle, cReason, cHangupHeader)
		if status != 0 {
			return fmt.Errorf("pjsip_phone_hangup failed: code %d", int(status))
		}
		return nil
	})

	p.mu.Lock()
	p.callState = CallIdle
	p.mu.Unlock()

	if err != nil {
		return err
	}
	return nil
}

func (p *PJSIPPhone) SendDTMF(digit string) error {
	p.mu.Lock()
	if p.callState != CallInProgress {
		p.mu.Unlock()
		return fmt.Errorf("not in call")
	}

	if p.handle == nil {
		p.mu.Unlock()
		return fmt.Errorf("not initialized")
	}

	log.Printf("[PJSIP] Sending DTMF: %s", digit)

	handle := p.handle
	p.mu.Unlock()

	err := p.sendPJSIP(func() error {
		cDigits := C.CString(digit)
		defer C.free(unsafe.Pointer(cDigits))

		status := C.pjsip_phone_send_dtmf(handle, cDigits)
		if status != 0 {
			return fmt.Errorf("pjsip_phone_send_dtmf failed: code %d", int(status))
		}
		return nil
	})

	if err != nil {
		return err
	}
	return nil
}

func (p *PJSIPPhone) Stop() error {
	p.mu.Lock()
	handle := p.handle
	if handle == nil {
		p.mu.Unlock()
		return nil
	}
	p.handle = nil
	p.callState = CallIdle
	p.regStatus = RegUnregistered
	p.mu.Unlock()

	// Clear global phone pointer first so trailing callback events are ignored
	globalPhoneLock.Lock()
	globalPhone = nil
	globalPhoneLock.Unlock()

	log.Printf("[PJSIP] Stopping and destroying PJSUA instance")
	// Destroy on the same OS thread that created the PJSUA instance.
	_ = p.sendPJSIP(func() error {
		C.pjsip_phone_destroy(handle)
		return nil
	})

	return nil
}

// ShutdownPJSUA shuts down the process-lifetime PJSUA singleton.
// Call this ONLY at application exit (e.g. from core.Shutdown).
// After this call, no further PJSIP operations are possible.
func (p *PJSIPPhone) ShutdownPJSUA() error {
	log.Printf("[PJSIP] Shutting down PJSUA singleton")
	return p.sendPJSIP(func() error {
		C.pjsip_bridge_shutdown()
		return nil
	})
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

	// 发送事件到regEventChan，用于等待注册完成的地方
	select {
	case p.regEventChan <- s:
	default: // 非阻塞发送，channel已有缓冲
	}

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

// RegChan 返回用于等待注册事件的channel
func (p *PJSIPPhone) RegChan() <-chan RegStatus {
	return p.regEventChan
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
