package sip

import (
	"fmt"
	"net"
	"strings"
	"testing"
	"time"
)

func TestPJSIPHA1bAuth(t *testing.T) {
	// 1. Start a dummy UDP SIP server
	conn, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: 5061})
	if err != nil {
		t.Fatalf("Failed to start dummy SIP server: %v", err)
	}
	defer conn.Close()

	authVerified := make(chan bool)

	// 2. Handle incoming SIP packets
	go func() {
		buf := make([]byte, 2048)
		for {
			n, addr, err := conn.ReadFromUDP(buf)
			if err != nil {
				return
			}
			msg := string(buf[:n])

			if strings.HasPrefix(msg, "REGISTER") {
				// Check if it has Authorization header
				if strings.Contains(msg, "Authorization: Digest") {
					if strings.Contains(msg, "username=\"100000@sip.yunshu.local\"") {
						fmt.Println("[MockServer] ✅ Received REGISTER with correct HA1b username (100000@sip.yunshu.local)!")
						authVerified <- true
						return
					} else if strings.Contains(msg, "username=\"100000\"") {
						fmt.Println("[MockServer] ❌ Received REGISTER with legacy HA1 username (100000) instead of HA1b format!")
						authVerified <- false
						return
					}
				} else {
					// No Auth header, send 401 Unauthorized to trigger Digest Auth
					fmt.Println("[MockServer] Received initial REGISTER, sending 401 Unauthorized challenge...")
					resp := fmt.Sprintf("SIP/2.0 401 Unauthorized\r\n"+
						"Via: %s\r\n"+
						"From: %s\r\n"+
						"To: %s\r\n"+
						"Call-ID: %s\r\n"+
						"CSeq: %s\r\n"+
						"WWW-Authenticate: Digest realm=\"sip.yunshu.local\", nonce=\"1234567890\", algorithm=MD5\r\n"+
						"Content-Length: 0\r\n\r\n",
						extractHeader(msg, "Via: "),
						extractHeader(msg, "From: "),
						extractHeader(msg, "To: "),
						extractHeader(msg, "Call-ID: "),
						extractHeader(msg, "CSeq: "))
					conn.WriteToUDP([]byte(resp), addr)
				}
			}
		}
	}()

	// 3. Initialize PJSIP Phone
	phone := NewPJSIPPhone()
	defer phone.Stop()

	params := Params{
		Domain:   "sip.yunshu.local",
		Port:     "5061",
		Protocol: "udp",
		Username: "100000",
		Password: "password123",
	}

	if err := phone.Init(params); err != nil {
		t.Fatalf("Failed to init PJSIP: %v", err)
	}

	// 4. Trigger Register
	if err := phone.Register(); err != nil {
		t.Fatalf("Failed to trigger Register: %v", err)
	}

	// 5. Wait for verification
	select {
	case success := <-authVerified:
		if !success {
			t.Fatal("Auth verification failed: username format was incorrect!")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("Timeout waiting for Auth verification")
	}
}

func extractHeader(msg, headerPrefix string) string {
	lines := strings.Split(msg, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, headerPrefix) {
			return strings.TrimPrefix(line, headerPrefix)
		}
	}
	return ""
}
