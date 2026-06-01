package core

import (
	"yunshu-phone/internal/api"
	"yunshu-phone/internal/event"
)

// --- State mutation methods called by Bridge ---

// SetLoginState updates the state after a successful login
func (c *Core) SetLoginState(userInfo *api.UserInfo, token, seatNumber string, inactivityDuration int) {
	c.state.mu.Lock()
	defer c.state.mu.Unlock()

	c.state.LoggedIn = true
	c.state.UserInfo = userInfo
	c.state.Token = token
	c.state.SeatNumber = seatNumber
	c.state.InactiveDuration = inactivityDuration
	c.state.Permissions = userInfo.RoleDetail.Permissions

	c.bus.Emit(AppLoginSuccess, nil)
}

// ClearLoginState clears all login-related state
func (c *Core) ClearLoginState() {
	c.state.mu.Lock()
	defer c.state.mu.Unlock()

	c.state.LoggedIn = false
	c.state.UserInfo = nil
	c.state.Token = ""
	c.state.SeatNumber = ""
	c.state.Permissions = nil
	c.state.IsCall = false
	c.state.IsAutoCall = false
	c.state.StopCall = false

	c.bus.Emit(AppLogout, nil)
}

// SetAutoCall updates the auto-call state
func (c *Core) SetAutoCall(isAuto bool) {
	c.state.mu.Lock()
	defer c.state.mu.Unlock()
	c.state.IsAutoCall = isAuto
}

// SetStopCall updates the stop-call flag
func (c *Core) SetStopCall(stop bool) {
	c.state.mu.Lock()
	defer c.state.mu.Unlock()
	c.state.StopCall = stop
}

// Event type aliases for use outside the event package
var (
	AppLoginSuccess = event.AppLoginSuccess
	AppLogout       = event.AppLogout
)
