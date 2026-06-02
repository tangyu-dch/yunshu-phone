package ws

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// --- Message Types ---

type Message struct {
	MsgType string          `json:"msgType"`
	MsgID   string          `json:"msgId,omitempty"`
	Success *bool           `json:"success,omitempty"`
	Data    json.RawMessage `json:"data,omitempty"`
}

type CallPhoneData struct {
	Type     string `json:"type"`
	Phone    string `json:"phone"`
	Extra    string `json:"extra"`
	TaskID   string `json:"taskId"`
	TaskPhoneID string `json:"taskPhoneId"`
	UserID   string `json:"userId"`
}

type TaskStatusData struct {
	Option     bool   `json:"option"`
	AfterState string `json:"afterState"` // "RUNNING" or "PAUSED"
	TaskID     string `json:"taskId"`
}

type HangupCauseData struct {
	Code  int    `json:"code"`
	Cause string `json:"cause"`
}

type SystemInfoData struct {
	Version string `json:"version"`
}

// --- Connection Status ---

type Status int

const (
	StatusDisconnected Status = iota
	StatusConnecting
	StatusConnected
	StatusReconnecting
	StatusError
)

func (s Status) String() string {
	switch s {
	case StatusDisconnected:
		return "disconnected"
	case StatusConnecting:
		return "connecting"
	case StatusConnected:
		return "connected"
	case StatusReconnecting:
		return "reconnecting"
	case StatusError:
		return "error"
	default:
		return "unknown"
	}
}

// --- WebSocket Client ---

// Config holds WebSocket connection configuration
type Config struct {
	URL                string
	Token              string
	HeartbeatInterval  time.Duration
	HeartbeatMsg       interface{}
	ReconnectInterval  time.Duration
	MaxReconnectAttempts int
	Debug              bool
}

// DefaultConfig returns a Config with sensible defaults
func DefaultConfig() Config {
	return Config{
		HeartbeatInterval:  30 * time.Second,
		HeartbeatMsg:       map[string]string{"msgType": "ping"},
		ReconnectInterval:  5 * time.Second,
		MaxReconnectAttempts: 5,
	}
}

// MessageHandler is called for each incoming message
type MessageHandler func(msg Message)

// StatusHandler is called when connection status changes
type StatusHandler func(status Status)

// Client is a production-grade WebSocket client with heartbeat and reconnection
type Client struct {
	cfg     Config
	conn    *websocket.Conn
	mu      sync.Mutex
	status  Status

	onMessage MessageHandler
	onStatus  StatusHandler

	// Message queue for when not connected
	msgQueue []interface{}

	// Control channels
	closeCh    chan struct{}
	heartbeatCh chan struct{}

	// Reconnection
	reconnectAttempts int
	closed            bool
}

// NewClient creates a new WebSocket client
func NewClient(cfg Config) *Client {
	return &Client{
		cfg:     cfg,
		closeCh: make(chan struct{}),
	}
}

// SetMessageHandler sets the handler for incoming messages
func (c *Client) SetMessageHandler(handler MessageHandler) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.onMessage = handler
}

// SetStatusHandler sets the handler for status changes
func (c *Client) SetStatusHandler(handler StatusHandler) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.onStatus = handler
}

// Connect establishes the WebSocket connection
func (c *Client) Connect() error {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return fmt.Errorf("client is closed")
	}
	c.mu.Unlock()

	c.setStatus(StatusConnecting)

	url := c.cfg.URL + "?token=" + c.cfg.Token

	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}

	conn, _, err := dialer.Dial(url, nil)
	if err != nil {
		c.setStatus(StatusError)
		return fmt.Errorf("dial: %w", err)
	}

	c.mu.Lock()
	c.conn = conn
	c.reconnectAttempts = 0
	c.mu.Unlock()

	c.setStatus(StatusConnected)

	// Start reader and heartbeat goroutines
	go c.readLoop()
	go c.heartbeatLoop()

	// Flush message queue
	c.flushQueue()

	return nil
}

// Send sends a message through the WebSocket
func (c *Client) Send(msg interface{}) error {
	c.mu.Lock()
	if c.status != StatusConnected || c.conn == nil {
		// Queue the message
		c.msgQueue = append(c.msgQueue, msg)
		c.mu.Unlock()
		return nil
	}
	conn := c.conn
	c.mu.Unlock()

	return conn.WriteJSON(msg)
}

// SendJSON sends a JSON-serializable message
func (c *Client) SendJSON(msgType string, data interface{}) error {
	msg := Message{
		MsgType: msgType,
	}
	if data != nil {
		raw, err := json.Marshal(data)
		if err != nil {
			return err
		}
		msg.Data = raw
	}
	return c.Send(msg)
}

// Close gracefully closes the WebSocket connection
func (c *Client) Close() {
	c.mu.Lock()
	c.closed = true
	c.mu.Unlock()

	close(c.closeCh)

	c.mu.Lock()
	if c.conn != nil {
		c.conn.WriteMessage(
			websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
		)
		c.conn.Close()
		c.conn = nil
	}
	c.mu.Unlock()

	c.setStatus(StatusDisconnected)
}

// GetStatus returns the current connection status
func (c *Client) GetStatus() Status {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.status
}

// IsConnected returns true if the WebSocket is connected
func (c *Client) IsConnected() bool {
	return c.GetStatus() == StatusConnected
}

// --- Internal ---

func (c *Client) setStatus(s Status) {
	c.mu.Lock()
	c.status = s
	handler := c.onStatus
	c.mu.Unlock()

	if handler != nil {
		go handler(s)
	}

	if c.cfg.Debug {
		log.Printf("[WS] Status: %s", s)
	}
}

func (c *Client) readLoop() {
	for {
		select {
		case <-c.closeCh:
			return
		default:
		}

		c.mu.Lock()
		conn := c.conn
		c.mu.Unlock()

		if conn == nil {
			return
		}

		_, data, err := conn.ReadMessage()
		if err != nil {
			if c.closed {
				return
			}
			if c.cfg.Debug {
				log.Printf("[WS] Read error: %v", err)
			}
			c.handleDisconnect()
			return
		}

		var msg Message
		if err := json.Unmarshal(data, &msg); err != nil {
			if c.cfg.Debug {
				log.Printf("[WS] Parse error: %v", err)
			}
			continue
		}

		if c.cfg.Debug {
			log.Printf("[WS] Recv: %s", msg.MsgType)
		}

		c.mu.Lock()
		handler := c.onMessage
		c.mu.Unlock()

		if handler != nil {
			handler(msg)
		}
	}
}

func (c *Client) heartbeatLoop() {
	ticker := time.NewTicker(c.cfg.HeartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-c.closeCh:
			return
		case <-ticker.C:
			if c.IsConnected() && c.cfg.HeartbeatMsg != nil {
				if err := c.Send(c.cfg.HeartbeatMsg); err != nil {
					if c.cfg.Debug {
						log.Printf("[WS] Heartbeat error: %v", err)
					}
				}
			}
		}
	}
}

func (c *Client) handleDisconnect() {
	if c.closed {
		return
	}

	c.mu.Lock()
	if c.conn != nil {
		c.conn.Close()
		c.conn = nil
	}
	c.mu.Unlock()

	if c.cfg.MaxReconnectAttempts > 0 && c.reconnectAttempts < c.cfg.MaxReconnectAttempts {
		c.setStatus(StatusReconnecting)
		c.reconnectLoop()
	} else {
		c.setStatus(StatusDisconnected)
	}
}

func (c *Client) reconnectLoop() {
	for c.reconnectAttempts < c.cfg.MaxReconnectAttempts {
		select {
		case <-c.closeCh:
			return
		case <-time.After(c.cfg.ReconnectInterval):
		}

		c.reconnectAttempts++
		if c.cfg.Debug {
			log.Printf("[WS] Reconnect attempt %d/%d", c.reconnectAttempts, c.cfg.MaxReconnectAttempts)
		}

		if err := c.Connect(); err == nil {
			return
		}
	}

	c.setStatus(StatusDisconnected)
}

func (c *Client) flushQueue() {
	c.mu.Lock()
	queue := c.msgQueue
	c.msgQueue = nil
	c.mu.Unlock()

	for _, msg := range queue {
		if err := c.Send(msg); err != nil {
			if c.cfg.Debug {
				log.Printf("[WS] Flush queue error: %v", err)
			}
		}
	}
}
