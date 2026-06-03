package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"log"
	"yunshu-phone/internal/config"
)

// Client is the shared HTTP client for all API requests
type Client struct {
	httpClient *http.Client
	mu         sync.RWMutex
	token      string
	version    string
	onLogout   func() // called when 401 is received
	onUpgrade  func() // called when 426 is received
}

// APIResponse represents the standard API response
type APIResponse struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

var defaultClient = &Client{
	httpClient: &http.Client{
		Timeout: 30 * time.Second,
	},
}

// Default returns the default API client
func Default() *Client {
	return defaultClient
}

// SetToken sets the auth token
func (c *Client) SetToken(token string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.token = token
}

// SetVersion sets the yunshu version header
func (c *Client) SetVersion(version string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.version = version
}

// SetOnLogout registers a callback for 401 responses
func (c *Client) SetOnLogout(fn func()) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.onLogout = fn
}

// SetOnUpgrade registers a callback for 426 responses
func (c *Client) SetOnUpgrade(fn func()) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.onUpgrade = fn
}

// Do performs an HTTP request with standard headers and response handling
func (c *Client) Do(method, path string, body interface{}) (*APIResponse, error) {
	cfg := config.Get()
	url := cfg.APIBaseURL + path

	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal body: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	// Set headers
	req.Header.Set("Content-Type", "application/json")
	c.mu.RLock()
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
		req.Header.Set("X-Token", c.token)
	}
	if c.version != "" {
		req.Header.Set("yunshu_version", c.version)
	}
	c.mu.RUnlock()

	// Log the request details
	loggedHeaders := make(map[string]string)
	for k, v := range req.Header {
		if k == "Authorization" || k == "X-Token" {
			loggedHeaders[k] = "[MASKED]"
		} else {
			loggedHeaders[k] = fmt.Sprintf("%v", v)
		}
	}
	bodyStr := ""
	if body != nil {
		reqBodyBytes, _ := json.Marshal(body)
		var bodyMap map[string]interface{}
		if err := json.Unmarshal(reqBodyBytes, &bodyMap); err == nil {
			maskSensitiveKeys(bodyMap)
			maskedBytes, _ := json.Marshal(bodyMap)
			bodyStr = string(maskedBytes)
		} else {
			bodyStr = string(reqBodyBytes)
		}
	}
	log.Printf("[HTTP-REQ] %s %s | Headers: %v | Body: %s", method, url, loggedHeaders, bodyStr)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		log.Printf("[HTTP-ERR] %s %s | Network Error: %v", method, url, err)
		return nil, fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("[HTTP-ERR] %s %s | Read Response Body Error: %v", method, url, err)
		return nil, fmt.Errorf("read response body: %w", err)
	}

	respBodyStr := ""
	var respMap map[string]interface{}
	if err := json.Unmarshal(respBody, &respMap); err == nil {
		maskSensitiveKeys(respMap)
		maskedBytes, _ := json.Marshal(respMap)
		respBodyStr = string(maskedBytes)
	} else {
		respBodyStr = string(respBody)
	}
	log.Printf("[HTTP-RESP] %s %s | HTTP Status: %d | Body: %s", method, url, resp.StatusCode, respBodyStr)

	var apiResp APIResponse
	if err := json.Unmarshal(respBody, &apiResp); err != nil {
		log.Printf("[HTTP-ERR] %s %s | JSON Parse Error: %v | Raw Body: %s", method, url, err, string(respBody))
		return nil, fmt.Errorf("parse response: %w (body: %s)", err, string(respBody))
	}

	// Map success code 0 (returned by local backend) to 200 (expected by client)
	if apiResp.Code == 0 {
		apiResp.Code = 200
	}

	// Handle special status codes
	c.mu.RLock()
	onLogout := c.onLogout
	onUpgrade := c.onUpgrade
	c.mu.RUnlock()

	switch apiResp.Code {
	case 401, 4011:
		log.Printf("[HTTP-WARN] %s %s | Code: %d (Login expired) | Message: %s", method, url, apiResp.Code, apiResp.Message)
		if onLogout != nil {
			go onLogout()
		}
		return &apiResp, fmt.Errorf("login expired")
	case 426:
		log.Printf("[HTTP-WARN] %s %s | Code: %d (Version expired) | Message: %s", method, url, apiResp.Code, apiResp.Message)
		if onUpgrade != nil {
			go onUpgrade()
		}
		return &apiResp, fmt.Errorf("version expired, please update")
	case 400:
		log.Printf("[HTTP-ERR] %s %s | Code: 400 (API Error) | Message: %s", method, url, apiResp.Message)
		return &apiResp, fmt.Errorf("%s", apiResp.Message)
	default:
		if apiResp.Code >= 300 {
			log.Printf("[HTTP-ERR] %s %s | Code: %d (Uncaught Error) | Message: %s", method, url, apiResp.Code, apiResp.Message)
		}
	}

	return &apiResp, nil
}

// Get performs a GET request
func (c *Client) Get(path string) (*APIResponse, error) {
	return c.Do(http.MethodGet, path, nil)
}

// Post performs a POST request
func (c *Client) Post(path string, body interface{}) (*APIResponse, error) {
	return c.Do(http.MethodPost, path, body)
}

func maskSensitiveKeys(m map[string]interface{}) {
	for k, v := range m {
		if isSensitiveKey(k) {
			m[k] = "[MASKED]"
		} else if nestedMap, ok := v.(map[string]interface{}); ok {
			maskSensitiveKeys(nestedMap)
		} else if slice, ok := v.([]interface{}); ok {
			for _, item := range slice {
				if itemMap, ok := item.(map[string]interface{}); ok {
					maskSensitiveKeys(itemMap)
				}
			}
		}
	}
}

func isSensitiveKey(key string) bool {
	k := strings.ToLower(key)
	return strings.Contains(k, "password") ||
		strings.Contains(k, "token") ||
		strings.Contains(k, "secret") ||
		strings.Contains(k, "auth") ||
		strings.Contains(k, "credential") ||
		k == "pwd"
}
