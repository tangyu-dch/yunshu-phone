package mouse

import (
	"sync"
	"time"
)

// Monitor tracks mouse/keyboard activity and triggers callbacks on inactivity
type Monitor struct {
	mu              sync.Mutex
	lastActivity    time.Time
	inactivityTimeout time.Duration
	timer           *time.Timer
	onInactive      func()
	onActive        func()
	isInactive      bool
	running         bool
}

// NewMonitor creates a new mouse activity monitor
func NewMonitor(timeout time.Duration) *Monitor {
	return &Monitor{
		lastActivity:    time.Now(),
		inactivityTimeout: timeout,
	}
}

// ReportActivity reports that the user is active
func (m *Monitor) ReportActivity() {
	m.mu.Lock()
	defer m.mu.Unlock()

	wasInactive := m.isInactive
	m.lastActivity = time.Now()
	m.isInactive = false

	if wasInactive && m.onActive != nil {
		go m.onActive()
	}

	m.resetTimer()
}

// SetCallbacks sets the inactive/active callbacks
func (m *Monitor) SetCallbacks(onInactive, onActive func()) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onInactive = onInactive
	m.onActive = onActive
}

// Start begins monitoring
func (m *Monitor) Start() {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.running {
		return
	}
	m.running = true
	m.lastActivity = time.Now()
	m.startTimer()
}

// Stop stops monitoring
func (m *Monitor) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.running {
		return
	}
	m.running = false
	if m.timer != nil {
		m.timer.Stop()
		m.timer = nil
	}
}

// SetTimeout updates the inactivity timeout
func (m *Monitor) SetTimeout(timeout time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.inactivityTimeout = timeout
}

// IsInactive returns true if the user is currently inactive
func (m *Monitor) IsInactive() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.isInactive
}

func (m *Monitor) startTimer() {
	m.timer = time.AfterFunc(m.inactivityTimeout, m.checkInactivity)
}

func (m *Monitor) resetTimer() {
	if m.timer != nil {
		m.timer.Stop()
	}
	if m.running {
		m.startTimer()
	}
}

func (m *Monitor) checkInactivity() {
	m.mu.Lock()
	if !m.running {
		m.mu.Unlock()
		return
	}

	elapsed := time.Since(m.lastActivity)
	if elapsed >= m.inactivityTimeout {
		if !m.isInactive {
			m.isInactive = true
			cb := m.onInactive
			m.mu.Unlock()
			if cb != nil {
				go cb()
			}
			return
		}
	}
	m.mu.Unlock()
}
