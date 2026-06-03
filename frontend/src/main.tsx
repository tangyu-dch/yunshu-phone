// ─── Wails Runtime & Go Bindings Mock Guard for non-Wails (Browser) environments ───
if (typeof (window as any).runtime === 'undefined') {
  (window as any).runtime = {
    EventsOnMultiple: () => () => {},
    EventsOn: () => () => {},
    EventsOnce: () => () => {},
    EventsOff: () => {},
    EventsEmit: () => {},
    LogPrint: () => {},
    LogTrace: () => {},
    LogDebug: () => {},
    LogInfo: () => {},
    LogWarning: () => {},
    LogError: () => {},
    LogFatal: () => {},
  };
}

if (typeof (window as any).go === 'undefined') {
  (window as any).go = {
    bridge: {
      AppBridge: {
        GetConfig: () => Promise.resolve({
          api_base_url: 'https://dolphinapi.51zhulie.com',
          ws_base_url: 'wss://dolphinapi.51zhulie.com/cc/ws/websocket',
          sip_proxy: '127.0.0.1:5060'
        }),
        Login: () => Promise.resolve({}),
        Logout: () => Promise.resolve({}),
        ConfirmExit: () => Promise.resolve(),
        ReportMouseActivity: () => Promise.resolve(),
        RestoreSession: () => Promise.resolve(),
        SetCustomEnvironment: () => Promise.resolve(),
        SetEnvironment: () => Promise.resolve(),
        StartHeaderMonitor: () => Promise.resolve(),
        StartMouseMonitor: () => Promise.resolve(),
      },
      CallBridge: {
        MakeCall: () => Promise.resolve(),
        HangupCall: () => Promise.resolve(),
        RetryConnection: () => Promise.resolve(),
        SetAutoCallState: () => Promise.resolve(),
      }
    }
  };
}

import React from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './store'
import App from './App'
import './assets/iconfont.css'
import './assets/main.css'
import './style.css'

const root = createRoot(document.getElementById('root')!)

root.render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
)
