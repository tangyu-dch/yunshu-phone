package server

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"sync"

	"yunshu-phone/internal/config"
)

// LocalServer runs a local HTTPS API server for CRM integration
type LocalServer struct {
	mu       sync.Mutex
	server   *http.Server
	running  bool
	certDir  string

	// State
	isCall    bool
	isAutoCall bool
	stopCall  bool
	loggedIn  bool
	seatNumber string

	// Callbacks
	OnCallPhone func(data map[string]interface{})
}

// NewLocalServer creates a new local HTTPS server
func NewLocalServer(certDir string) *LocalServer {
	return &LocalServer{
		certDir: certDir,
	}
}

// SetCallState updates the call state
func (s *LocalServer) SetCallState(isCall bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.isCall = isCall
}

// SetAutoCallState updates the auto-call state
func (s *LocalServer) SetAutoCallState(isAutoCall bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.isAutoCall = isAutoCall
}

// SetStopCall updates the stop-call flag
func (s *LocalServer) SetStopCall(stop bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.stopCall = stop
}

// SetLoggedIn updates the login state
func (s *LocalServer) SetLoggedIn(loggedIn bool, seatNumber string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.loggedIn = loggedIn
	s.seatNumber = seatNumber
}

// Start launches the HTTPS server
func (s *LocalServer) Start() error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return nil
	}
	s.mu.Unlock()

	cfg := config.Get()
	port := cfg.LocalServerPort

	mux := http.NewServeMux()
	mux.HandleFunc("/api/call", s.handleCall)
	mux.HandleFunc("/api/isCallLogin", s.handleIsCallLogin)
	mux.HandleFunc("/api/serveCheck", s.handleServeCheck)

	// Load TLS certificate
	certFile := filepath.Join(s.certDir, "51zhulie.com.crt")
	keyFile := filepath.Join(s.certDir, "51zhulie.com.key")

	cert, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		log.Printf("[Server] Failed to load TLS cert: %v, falling back to HTTP", err)
		// Fallback to HTTP if no cert available
		s.server = &http.Server{
			Addr:    fmt.Sprintf(":%d", port),
			Handler: corsMiddleware(mux),
		}
		s.mu.Lock()
		s.running = true
		s.mu.Unlock()

		go func() {
			log.Printf("[Server] HTTP server starting on port %d", port)
			if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Printf("[Server] Error: %v", err)
			}
		}()
		return nil
	}

	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{cert},
	}

	s.server = &http.Server{
		Addr:      fmt.Sprintf(":%d", port),
		Handler:   corsMiddleware(mux),
		TLSConfig: tlsConfig,
	}

	s.mu.Lock()
	s.running = true
	s.mu.Unlock()

	go func() {
		log.Printf("[Server] HTTPS server starting on port %d", port)
		if err := s.server.ListenAndServeTLS("", ""); err != nil && err != http.ErrServerClosed {
			log.Printf("[Server] Error: %v", err)
		}
	}()

	return nil
}

// Stop shuts down the server
func (s *LocalServer) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running || s.server == nil {
		return nil
	}

	s.running = false
	return s.server.Close()
}

// --- Handlers ---

func (s *LocalServer) handleCall(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	s.mu.Lock()
	isCall := s.isCall
	isAutoCall := s.isAutoCall
	stopCall := s.stopCall
	loggedIn := s.loggedIn
	s.mu.Unlock()

	if stopCall {
		writeJSON(w, map[string]interface{}{"code": 400, "message": "dialer error, please restart"})
		return
	}
	if isAutoCall {
		writeJSON(w, map[string]interface{}{"code": 400, "message": "auto call in progress"})
		return
	}
	if !loggedIn {
		writeJSON(w, map[string]interface{}{"code": 400, "message": "not logged in"})
		return
	}
	if isCall {
		writeJSON(w, map[string]interface{}{"code": 400, "message": "already in call"})
		return
	}

	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, map[string]interface{}{"code": 400, "message": "invalid request"})
		return
	}

	if s.OnCallPhone != nil {
		s.OnCallPhone(body)
	}

	writeJSON(w, map[string]interface{}{"code": 200, "message": "ok"})
}

func (s *LocalServer) handleIsCallLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	s.mu.Lock()
	loggedIn := s.loggedIn
	s.mu.Unlock()

	if !loggedIn {
		writeJSON(w, map[string]interface{}{"code": 400, "message": "not logged in"})
		return
	}

	writeJSON(w, map[string]interface{}{"code": 200, "message": "ok"})
}

func (s *LocalServer) handleServeCheck(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]interface{}{"code": 200, "message": "ok"})
}

// --- Helpers ---

func writeJSON(w http.ResponseWriter, data map[string]interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
