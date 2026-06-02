package api

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"yunshu-phone/internal/config"
)

func TestClientLoggingAndMasking(t *testing.T) {
	// 1. Setup mock server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify standard headers are passed
		if r.Header.Get("Content-Type") != "application/json" {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"code":400,"message":"invalid content type"}`))
			return
		}

		// Read request body to echo back
		var reqBody map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"code":400,"message":"invalid json"}`))
			return
		}

		// Return a response containing sensitive fields (token)
		respData := map[string]interface{}{
			"code":    200,
			"message": "success",
			"data": map[string]interface{}{
				"token": "secret_token_abcdef123456",
				"userInfo": map[string]interface{}{
					"username": reqBody["username"],
				},
			},
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(respData)
	}))
	defer server.Close()

	// 2. Point APIBaseURL to the mock server
	cfg := config.Get()
	oldBaseURL := cfg.APIBaseURL
	cfg.APIBaseURL = server.URL
	defer func() {
		cfg.APIBaseURL = oldBaseURL
	}()

	// 3. Intercept log output
	var logBuf bytes.Buffer
	oldOutput := log.Writer()
	log.SetOutput(&logBuf)
	defer func() {
		log.SetOutput(oldOutput)
	}()

	// 4. Perform the HTTP request
	client := Default()
	client.SetToken("original_raw_token_xyz")

	reqBody := map[string]interface{}{
		"username": "testuser",
		"password": "super_secret_password_123",
	}

	resp, err := client.Post("/test-endpoint", reqBody)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.Code != 200 {
		t.Errorf("expected response code 200, got %d", resp.Code)
	}

	// 5. Inspect the generated logs
	logOutput := logBuf.String()

	t.Logf("Captured Logs:\n%s", logOutput)

	// Check if logs exist
	if !strings.Contains(logOutput, "[HTTP-REQ]") {
		t.Errorf("logs should contain [HTTP-REQ]")
	}
	if !strings.Contains(logOutput, "[HTTP-RESP]") {
		t.Errorf("logs should contain [HTTP-RESP]")
	}

	// Check that sensitive tokens in headers are masked
	if strings.Contains(logOutput, "original_raw_token_xyz") {
		t.Errorf("sensitive token 'original_raw_token_xyz' should not be leaked in logs")
	}

	// Check that sensitive password in the request body is masked
	if strings.Contains(logOutput, "super_secret_password_123") {
		t.Errorf("sensitive password 'super_secret_password_123' should not be leaked in request body logs")
	}
	if !strings.Contains(logOutput, `"[MASKED]"`) && !strings.Contains(logOutput, `[MASKED]`) {
		t.Errorf("logs should contain masked indicators")
	}

	// Check that sensitive token in the response body is masked
	if strings.Contains(logOutput, "secret_token_abcdef123456") {
		t.Errorf("sensitive token 'secret_token_abcdef123456' should not be leaked in response body logs")
	}
}
