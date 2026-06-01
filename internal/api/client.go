package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

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

// SetVersion sets the dolphin version header
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
		req.Header.Set("Authorization", c.token)
	}
	if c.version != "" {
		req.Header.Set("dolphin_version", c.version)
	}
	c.mu.RUnlock()

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var apiResp APIResponse
	if err := json.Unmarshal(respBody, &apiResp); err != nil {
		return nil, fmt.Errorf("parse response: %w (body: %s)", err, string(respBody))
	}

	// Handle special status codes
	c.mu.RLock()
	onLogout := c.onLogout
	onUpgrade := c.onUpgrade
	c.mu.RUnlock()

	switch apiResp.Code {
	case 401, 4011:
		if onLogout != nil {
			go onLogout()
		}
		return &apiResp, fmt.Errorf("login expired")
	case 426:
		if onUpgrade != nil {
			go onUpgrade()
		}
		return &apiResp, fmt.Errorf("version expired, please update")
	case 400:
		return &apiResp, fmt.Errorf("api error: %s", apiResp.Message)
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
