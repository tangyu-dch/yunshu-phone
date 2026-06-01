package bridge

import (
	"context"
	"log"
	"time"

	"yunshu-phone/internal/config"
	"yunshu-phone/internal/core"
	"yunshu-phone/internal/update"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// UpdateBridge handles auto-update operations.
// Bound to the Wails frontend as "UpdateBridge".
type UpdateBridge struct {
	ctx      context.Context
	core     *core.Core
	updater  *update.Updater
	stopCh   chan struct{}
}

// NewUpdateBridge creates a new update bridge
func NewUpdateBridge(c *core.Core) *UpdateBridge {
	version := config.Get().AppVersion
	u := update.NewUpdater(version)
	return &UpdateBridge{
		core:    c,
		updater: u,
	}
}

// Startup initializes the update bridge with the Wails context and starts
// the periodic update checker.
func (b *UpdateBridge) Startup(ctx context.Context) {
	b.ctx = ctx
	b.stopCh = make(chan struct{})

	// When a new version is found, emit an event to the frontend
	b.updater.SetOnUpdateFound(func(info update.UpdateInfo) {
		if b.ctx != nil {
			wailsRuntime.EventsEmit(b.ctx, "update:available", info)
		}
	})

	// Start periodic update checks (every 2 hours)
	b.updater.StartPeriodicCheck(2*time.Hour, b.stopCh)

	log.Println("[UpdateBridge] Started periodic update checks")
}

// CheckForUpdate manually triggers an update check.
// Returns UpdateInfo if a new version is available, nil otherwise.
func (b *UpdateBridge) CheckForUpdate() (*update.UpdateInfo, error) {
	log.Println("[UpdateBridge] Manual update check requested")
	return b.updater.CheckForUpdate()
}

// DownloadUpdate downloads and applies the update from the given URL.
func (b *UpdateBridge) DownloadUpdate(downloadURL string) error {
	log.Printf("[UpdateBridge] Downloading update: %s", downloadURL)

	if b.ctx != nil {
		wailsRuntime.EventsEmit(b.ctx, "update:progress", map[string]interface{}{
			"status":  "downloading",
			"percent": 0,
		})
	}

	err := b.updater.DownloadAndApply(downloadURL)
	if err != nil {
		if b.ctx != nil {
			wailsRuntime.EventsEmit(b.ctx, "update:progress", map[string]interface{}{
				"status":  "error",
				"message": err.Error(),
			})
		}
		return err
	}

	if b.ctx != nil {
		wailsRuntime.EventsEmit(b.ctx, "update:progress", map[string]interface{}{
			"status":  "ready",
			"percent": 100,
			"message": "Update downloaded. Restart to apply.",
		})
	}

	return nil
}

// GetCurrentVersion returns the current app version string
func (b *UpdateBridge) GetCurrentVersion() string {
	return config.Get().AppVersion
}

// RestartApp restarts the application to apply the update
func (b *UpdateBridge) RestartApp() {
	log.Println("[UpdateBridge] Restart requested")
	if b.ctx != nil {
		// Stop periodic checks
		if b.stopCh != nil {
			close(b.stopCh)
		}
		wailsRuntime.Quit(b.ctx)
	}
}
