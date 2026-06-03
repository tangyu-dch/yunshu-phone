package bridge

import (
	"context"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"yunshu-phone/internal/config"
	"yunshu-phone/internal/core"
	"yunshu-phone/internal/update"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// UpdateBridge handles auto-update operations.
// Bound to the Wails frontend as "UpdateBridge".
type UpdateBridge struct {
	ctx       context.Context
	core      *core.Core
	updater   *update.Updater
	stopCh    chan struct{}
	appBridge *AppBridge
}

// NewUpdateBridge creates a new update bridge
func NewUpdateBridge(c *core.Core, appBridge *AppBridge) *UpdateBridge {
	version := config.Get().AppVersion
	u := update.NewUpdater(version)
	return &UpdateBridge{
		core:      c,
		updater:   u,
		appBridge: appBridge,
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
		// 版本升级重启时，通知 AppBridge 绕过常规退出弹窗确认
		if b.appBridge != nil {
			b.appBridge.SetExitConfirmed(true)
		}

		// 自动拉起新版本的云枢客户端程序（后台启动）
		if err := b.relaunch(); err != nil {
			log.Printf("[UpdateBridge] 自动重启客户端失败: %v", err)
		}

		wailsRuntime.Quit(b.ctx)
	}
}

// relaunch 自动拉起新程序实例。
func (b *UpdateBridge) relaunch() error {
	execPath, err := os.Executable()
	if err != nil {
		return err
	}
	execPath, err = filepath.EvalSymlinks(execPath)
	if err != nil {
		return err
	}

	var cmd *exec.Cmd
	// 在 macOS 生产环境下，如果是运行在 .app 包内，我们使用 "open" 命令来优雅拉起 windowed 应用程序
	if runtime.GOOS == "darwin" && strings.Contains(execPath, ".app/Contents/MacOS/") {
		appIdx := strings.Index(execPath, ".app")
		if appIdx != -1 {
			appPath := execPath[:appIdx+4]
			cmd = exec.Command("open", appPath)
		}
	}

	if cmd == nil {
		cmd = exec.Command(execPath)
	}

	return cmd.Start()
}
