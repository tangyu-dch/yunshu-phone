package event

import (
	"log"
	"sync"
)

// Type represents an event type identifier
type Type string

// Core event types used throughout the application
const (
	// SIP events
	SIPStatusChanged Type = "sip:status" // payload: RegStatus string
	SIPRegistered    Type = "sip:registered"
	SIPDisconnected  Type = "sip:disconnected"

	// Call events
	CallStateChanged Type = "call:state"    // payload: CallState string
	CallIncoming     Type = "call:incoming" // payload: displayNumber
	CallProgress     Type = "call:progress" // payload: displayNumber
	CallAnswered     Type = "call:answered"
	CallEnded        Type = "call:ended"  // payload: reason string
	CallFailed       Type = "call:failed" // payload: {code, reason}
	CallDTMF         Type = "call:dtmf"

	// WebSocket events
	WSStatusChanged Type = "ws:status"
	WSMessage       Type = "ws:message" // business messages forwarded to frontend
	WSCallPhone     Type = "ws:callPhone"
	WSTaskStatus    Type = "ws:taskStatus"
	WSRing          Type = "ws:ring"
	WSAnswer        Type = "ws:answer"
	WSHangupCause   Type = "ws:hangupCause"
	WSLogout        Type = "ws:logout"
	WSSystemInfo    Type = "ws:systemInfo"

	// App lifecycle events
	AppLoginSuccess  Type = "app:loginSuccess"
	AppLogout        Type = "app:logout"
	AppStateChanged  Type = "app:state"
	AppVersionUpdate Type = "app:versionUpdate"

	// Mouse / activity events
	MouseInactive Type = "mouse:inactive"
	MouseActive   Type = "mouse:active"

	// Server events
	ServerCallPhone Type = "server:callPhone"
	ServerCrashed   Type = "server:crashed"

	// Connection orchestrator events
	ConnStepProgress Type = "conn:step" // SIP/WS connection step progress
	ConnAllReady     Type = "conn:ready"
	ConnFailed       Type = "conn:failed"
)

// Handler is a function that handles an event
type Handler func(payload interface{})

// job represents an event job to be processed by worker
type eventJob struct {
	event Type
	payload interface{}
	fn Handler
}

// Bus is a simple in-process event bus for inter-module communication
type Bus struct {
	mu       sync.RWMutex
	handlers map[Type][]Handler
	workerQueue chan eventJob
	wg sync.WaitGroup
	stopChan chan struct{}
}

const workerCount = 3 // 启动3个worker处理事件

// NewBus creates a new event bus
func NewBus() *Bus {
	b := &Bus{
		handlers: make(map[Type][]Handler),
		workerQueue: make(chan eventJob, 100), // 缓冲队列
		stopChan: make(chan struct{}),
	}
	b.startWorkers()
	return b
}

// startWorkers 启动worker pool处理事件
func (b *Bus) startWorkers() {
	b.wg.Add(workerCount)
	for i := 0; i < workerCount; i++ {
		go func(workerID int) {
			defer b.wg.Done()
			log.Printf("[EventBus] Worker %d started", workerID)
			for {
				select {
				case job := <-b.workerQueue:
					b.processJob(job)
				case <-b.stopChan:
					log.Printf("[EventBus] Worker %d stopped", workerID)
					return
				}
			}
		}(i)
	}
}

// processJob 处理单个事件job
func (b *Bus) processJob(job eventJob) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[EventBus] Panic in handler for %s: %v", job.event, r)
		}
	}()
	job.fn(job.payload)
}

// Stop 优雅关闭事件总线，等待所有任务完成
func (b *Bus) Stop() {
	close(b.stopChan)
	close(b.workerQueue)
	b.wg.Wait()
	log.Println("[EventBus] All workers stopped")
}

// On registers a handler for an event type
func (b *Bus) On(event Type, handler Handler) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.handlers[event] = append(b.handlers[event], handler)
}

// Off removes all handlers for an event type
func (b *Bus) Off(event Type) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.handlers, event)
}

// Emit fires an event, calling all registered handlers through worker pool
func (b *Bus) Emit(event Type, payload interface{}) {
	b.mu.RLock()
	handlers := b.handlers[event]
	b.mu.RUnlock()

	for _, h := range handlers {
		select {
		case b.workerQueue <- eventJob{
			event: event,
			payload: payload,
			fn: h,
		}:
		default:
			log.Printf("[EventBus] Warning: event queue full, dropping event %s", event)
		}
	}
}

// EmitSync fires an event synchronously (for ordering-sensitive cases)
func (b *Bus) EmitSync(event Type, payload interface{}) {
	b.mu.RLock()
	handlers := b.handlers[event]
	b.mu.RUnlock()

	for _, h := range handlers {
		func(fn Handler) {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[EventBus] Panic in handler for %s: %v", event, r)
				}
			}()
			fn(payload)
		}(h)
	}
}
