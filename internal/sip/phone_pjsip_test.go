package sip

import (
	"fmt"
	"log"
	"strings"
	"sync"
	"testing"
	"time"
)

// TestPJSIPRegister tests SIP registration only (no call)
func TestPJSIPRegister(t *testing.T) {
	phone := NewPJSIPPhone()
	defer phone.Stop()

	var wg sync.WaitGroup
	wg.Add(1)
	var regSuccess bool

	var once sync.Once
	doneCallback := func() {
		once.Do(func() {
			wg.Done()
		})
	}

	phone.SetRegCallbacks(RegCallbacks{
		OnRegistered: func() {
			log.Println("[Test] ✅ Registered successfully!")
			regSuccess = true
			doneCallback()
		},
		OnRegistrationFailed: func(code int, reason string) {
			log.Printf("[Test] ❌ Registration failed: code=%d reason=%s", code, reason)
			doneCallback()
		},
		OnConnecting: func() {
			log.Println("[Test] Connecting...")
		},
		OnConnected: func() {
			log.Println("[Test] Connected to proxy")
		},
	})

	params := Params{
		Domain:   "sip.yunshu.local",
		Port:     "5060",
		Protocol: "udp",
		Username: "100000",
		Password: "123456",
	}

	if err := phone.Init(params); err != nil {
		t.Fatalf("Init failed: %v", err)
	}

	if err := phone.Register(); err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		if !regSuccess {
			t.Fatal("Registration failed")
		}
	case <-time.After(10 * time.Second):
		t.Fatal("Timeout waiting for registration")
	}

	// Verify reg status
	status := phone.GetRegStatus()
	if status != RegRegistered {
		t.Fatalf("Expected RegRegistered, got %s", status)
	}
	log.Printf("[Test] ✅ RegStatus = %s", status)
}

// TestPJSIPCall tests SIP registration + INVITE call + hangup lifecycle
func TestPJSIPCall(t *testing.T) {
	phone := NewPJSIPPhone()
	defer phone.Stop()

	// --- Registration phase ---
	regDone := make(chan error, 1)

	phone.SetRegCallbacks(RegCallbacks{
		OnRegistered: func() {
			log.Println("[Test] ✅ Registered successfully!")
			regDone <- nil
		},
		OnRegistrationFailed: func(code int, reason string) {
			log.Printf("[Test] ❌ Registration failed: code=%d reason=%s", code, reason)
			regDone <- fmt.Errorf("code=%d reason=%s", code, reason)
		},
		OnConnecting: func() {
			log.Println("[Test] Connecting...")
		},
		OnConnected: func() {
			log.Println("[Test] Connected to proxy")
		},
	})

	// --- Call event tracking ---
	type callEvent struct {
		name string
		data string
	}
	eventCh := make(chan callEvent, 10)

	phone.SetCallCallbacks(CallCallbacks{
		OnProgress: func(displayNumber string) {
			log.Printf("[Test] 📞 Call progress (ringing): %s", displayNumber)
			eventCh <- callEvent{"progress", displayNumber}
		},
		OnAccepted: func() {
			log.Println("[Test] 📞 Call accepted (183/200 early)")
			eventCh <- callEvent{"accepted", ""}
		},
		OnConfirmed: func() {
			log.Println("[Test] 📞 Call confirmed (media established)")
			eventCh <- callEvent{"confirmed", ""}
		},
		OnHangup: func(cause string) {
			log.Printf("[Test] 📞 Call hung up: %s", cause)
			eventCh <- callEvent{"hangup", cause}
		},
		OnFailed: func(code int, reason string) {
			log.Printf("[Test] ❌ Call failed: code=%d, reason=%s", code, reason)
			eventCh <- callEvent{"failed", fmt.Sprintf("%d:%s", code, reason)}
		},
	})

	params := Params{
		Domain:   "sip.yunshu.local",
		Port:     "5060",
		Protocol: "udp",
		Username: "100000",
		Password: "123456",
	}

	if err := phone.Init(params); err != nil {
		t.Fatalf("Init failed: %v", err)
	}

	if err := phone.Register(); err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	// Wait for registration
	select {
	case err := <-regDone:
		if err != nil {
			t.Fatalf("Registration failed: %v", err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("Timeout waiting for registration")
	}

	// --- Call phase ---
	log.Println("[Test] ========================================")
	log.Println("[Test] Triggering a test call to 111111...")
	log.Println("[Test] ========================================")

	// Extra headers to test custom SIP header injection
	extraHeaders := map[string]string{
		"X-Dolphin-CallId": "test-call-001",
		"X-Dolphin-TaskId": "test-task-001",
	}

	err := phone.Call("111111", extraHeaders)
	if err != nil {
		t.Fatalf("Call failed: %v", err)
	}

	// Verify call state changed to ringing
	callState := phone.GetCallState()
	log.Printf("[Test] Call state after Call(): %s", callState)

	// Collect events for 8 seconds to observe INVITE dialog
	log.Println("[Test] Waiting for SIP dialog events (8s)...")
	timeout := time.After(8 * time.Second)
	var events []callEvent

collectLoop:
	for {
		select {
		case evt := <-eventCh:
			events = append(events, evt)
			log.Printf("[Test] Collected event: %s (data=%s)", evt.name, evt.data)

			// If we get confirmed, test DTMF sending
			if evt.name == "confirmed" {
				log.Println("[Test] 🎵 Testing DTMF send...")
				if err := phone.SendDTMF("1"); err != nil {
					log.Printf("[Test] ⚠️ DTMF send failed: %v (expected if no real call)", err)
				} else {
					log.Println("[Test] ✅ DTMF '1' sent successfully")
				}
			}

			// If call ended, stop collecting
			if evt.name == "hangup" || evt.name == "failed" {
				break collectLoop
			}

		case <-timeout:
			log.Println("[Test] ⏱ Collection timeout reached")
			break collectLoop
		}
	}

	// --- Summary ---
	log.Println("[Test] ========================================")
	log.Println("[Test] Event Summary:")
	for i, e := range events {
		log.Printf("[Test]   %d. %s: %s", i+1, e.name, e.data)
	}

	// Check that we at least got a progress event (proves INVITE was sent and processed)
	hasProgress := false
	for _, e := range events {
		if e.name == "progress" {
			hasProgress = true
			break
		}
	}

	if hasProgress {
		log.Println("[Test] ✅ INVITE sent and SIP dialog initiated successfully")
	} else {
		log.Println("[Test] ⚠️ No progress event received (INVITE may not have been sent)")
	}

	// Check if we got a failed event with useful info
	for _, e := range events {
		if e.name == "failed" {
			// Parse error code
			parts := strings.SplitN(e.data, ":", 2)
			if len(parts) == 2 {
				log.Printf("[Test] Call failed with code=%s reason=%s", parts[0], parts[1])
				// 404 = user not found (expected for fake number 111111)
				// 480 = temporarily unavailable
				// 486 = busy
				// 487 = request terminated (we cancelled)
				// These are all valid SIP dialog responses meaning signaling works
				if parts[0] == "404" || parts[0] == "480" || parts[0] == "486" || parts[0] == "487" || parts[0] == "503" {
					log.Printf("[Test] ✅ Got expected SIP error response - signaling fully works!")
				}
			}
		}
	}

	// Hangup if still in call
	finalState := phone.GetCallState()
	log.Printf("[Test] Final call state: %s", finalState)
	if finalState != CallIdle {
		log.Println("[Test] Hanging up...")
		phone.Hangup("Test complete")
		time.Sleep(1 * time.Second)
	}

	log.Println("[Test] ========================================")
	log.Println("[Test] Test complete")
}

// TestPJSIPCallState tests state transitions
func TestPJSIPCallState(t *testing.T) {
	phone := NewPJSIPPhone()
	defer phone.Stop()

	// Before init
	if phone.GetRegStatus() != RegUnregistered {
		t.Fatal("Expected RegUnregistered before init")
	}
	if phone.GetCallState() != CallIdle {
		t.Fatal("Expected CallIdle before init")
	}

	// Call without registration should fail
	err := phone.Call("111111", nil)
	if err == nil {
		t.Fatal("Expected error when calling without registration")
	}
	log.Printf("[Test] ✅ Call without registration correctly rejected: %v", err)

	// Answer without call should fail
	err = phone.Answer()
	if err == nil {
		t.Fatal("Expected error when answering without incoming call")
	}
	log.Printf("[Test] ✅ Answer without call correctly rejected: %v", err)

	// DTMF without call should fail
	err = phone.SendDTMF("1")
	if err == nil {
		t.Fatal("Expected error when sending DTMF without call")
	}
	log.Printf("[Test] ✅ DTMF without call correctly rejected: %v", err)

	// Hangup while idle should be no-op
	err = phone.Hangup("test")
	if err != nil {
		t.Fatalf("Hangup while idle should succeed silently, got: %v", err)
	}
	log.Println("[Test] ✅ Hangup while idle is a no-op (correct)")
}
