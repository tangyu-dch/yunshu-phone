package main

import (
	"context"
	"embed"
	"log"
	"os"

	"yunshu-phone/internal/bridge"
	"yunshu-phone/internal/config"
	"yunshu-phone/internal/core"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Load persisted config (env, etc.)
	if err := config.Load(); err != nil {
		log.Printf("[Main] No persisted config, using defaults: %v", err)
	}

	// Create the core application coordinator
	appCore := core.NewCore()

	// Create bridge instances (frontend <-> Go interface)
	appBridge := bridge.NewAppBridge(appCore)
	callBridge := bridge.NewCallBridge(appCore)
	updateBridge := bridge.NewUpdateBridge(appCore)

	// Detect environment from env variable
	if env := os.Getenv("BASE_ENV"); env == "production" {
		config.SetEnv(config.EnvProduction)
	}

	// Wails application options
	err := wails.Run(&options.App{
		Title:     "云枢",
		Width:     380,
		Height:    540,
		MinWidth:  360,
		MinHeight: 480,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 255, G: 255, B: 255, A: 1},
		Frameless:        true,
		AlwaysOnTop:      true,

		OnStartup: func(ctx context.Context) {
			log.Println("[Main] App starting up...")
			appCore.Init(ctx)
			appBridge.Startup(ctx)
			callBridge.Startup(ctx)
			updateBridge.Startup(ctx)

			// Start local HTTPS server for CRM integration
			if err := appCore.StartLocalServer("build/certs"); err != nil {
				log.Printf("[Main] Local server start failed: %v", err)
			}
		},

		OnShutdown: func(ctx context.Context) {
			log.Println("[Main] App shutting down...")
			appCore.Shutdown()
		},

		OnBeforeClose: func(ctx context.Context) (prevent bool) {
			state := appCore.GetState()
			if state.IsCall {
				wailsRuntime.EventsEmit(ctx, "app:closeBlocked", "通话中无法关闭")
				return true
			}
			return false
		},

		Bind: []interface{}{
			appBridge,
			callBridge,
			updateBridge,
		},
	})

	if err != nil {
		log.Fatal("[Main] Fatal error: ", err)
	}
}
