package menu

import (
	"context"
	"runtime"

	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// menuCtx holds the Wails context for runtime operations
var menuCtx context.Context

// SetContext sets the application context for menu callbacks
func SetContext(ctx context.Context) {
	menuCtx = ctx
}

// CreateMenu constructs the application menu bar tailored for macOS and Windows
func CreateMenu() *menu.Menu {
	appMenu := menu.NewMenu()

	if runtime.GOOS == "darwin" {
		// macOS standard Application Menu (About, Hide, Quit, etc.)
		appMenu.Append(menu.AppMenu())
	} else {
		// Windows: File Menu (文件)
		fileMenu := menu.NewMenu()
		fileMenu.AddText("退出", keys.OptionOrAlt("F4"), func(cbData *menu.CallbackData) {
			if menuCtx != nil {
				wailsRuntime.Quit(menuCtx)
			}
		})
		appMenu.Append(menu.SubMenu("文件", fileMenu))
	}

	// Edit Menu (编辑) - standard copy/paste actions
	appMenu.Append(menu.EditMenu())

	// View Menu (视图) - refresh operations
	viewMenu := menu.NewMenu()
	viewMenu.AddText("重新加载", keys.CmdOrCtrl("R"), func(cbData *menu.CallbackData) {
		if menuCtx != nil {
			wailsRuntime.WindowReload(menuCtx)
		}
	})
	viewMenu.AddText("强制重新加载", keys.Combo("R", keys.CmdOrCtrlKey, keys.ShiftKey), func(cbData *menu.CallbackData) {
		if menuCtx != nil {
			wailsRuntime.WindowReloadApp(menuCtx)
		}
	})
	appMenu.Append(menu.SubMenu("视图", viewMenu))

	// Window Menu (窗口) - window management
	if runtime.GOOS == "darwin" {
		appMenu.Append(menu.WindowMenu())
	}

	// Help Menu (帮助) - links, updates, and custom About dialog
	helpMenu := menu.NewMenu()
	helpMenu.AddText("在线文档", nil, func(cbData *menu.CallbackData) {
		if menuCtx != nil {
			wailsRuntime.BrowserOpenURL(menuCtx, "https://docs.yunshu.com")
		}
	})
	helpMenu.AddText("联系客服", nil, func(cbData *menu.CallbackData) {
		if menuCtx != nil {
			wailsRuntime.BrowserOpenURL(menuCtx, "https://support.yunshu.com")
		}
	})
	helpMenu.AddSeparator()
	helpMenu.AddText("检查更新...", nil, func(cbData *menu.CallbackData) {
		if menuCtx != nil {
			wailsRuntime.EventsEmit(menuCtx, "update:check")
		}
	})
	helpMenu.AddSeparator()
	helpMenu.AddText("关于云枢", nil, func(cbData *menu.CallbackData) {
		if menuCtx != nil {
			wailsRuntime.EventsEmit(menuCtx, "app:showAbout")
		}
	})
	appMenu.Append(menu.SubMenu("帮助", helpMenu))

	return appMenu
}
