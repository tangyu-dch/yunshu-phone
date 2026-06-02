# 📞 Yunshu-Phone (云枢软电话)

**English** | [中文版](README_zh.md)

Yunshu-Phone is the **official companion desktop client** for the [Yunshu (云枢) Distributed Intelligent Customer Service System](https://github.com/tangyu-dch/yunshu.git). 
Built from the ground up using **Go + Wails v2 + React 18 + TypeScript**, it delivers a high-performance, natively compiled desktop SIP softphone tailored for enterprise call center agents.

> **⚠️ IMPORTANT COMPATIBILITY NOTICE**
> This project is the **EXCLUSIVE** companion client for [https://github.com/tangyu-dch/yunshu.git](https://github.com/tangyu-dch/yunshu.git). 
> It is deeply integrated with Yunshu's specific CTI WebSockets, CRM authentication tokens, and Kamailio routing rules. **It does NOT support, and will not support, connecting to any other third-party PBX, FreeSWITCH, or SIP servers.**

## 🎨 Overview & Interface

Yunshu-Phone replaces legacy Electron-based architectures with a modern event-driven design, utilizing Go's native concurrency to manage SIP states and WebSocket heartbeats, leaving the React frontend as a lightweight, purely reactive UI layer.

| 🟢 Active Call Interface | 📜 Call Records |
| :---: | :---: |
| ![In-Call View](https://raw.githubusercontent.com/tangyu-dch/yunshu-phone/main/build/appicon.png) | ![Call Records](https://raw.githubusercontent.com/tangyu-dch/yunshu-phone/main/build/appicon.png) |
| *(Note: Please replace with actual screenshots in `docs/` later)* | *(Note: Please replace with actual screenshots in `docs/` later)* |

### Key Features
- **Native OS Integration**: Uses Wails v2 for minimal memory footprint compared to Electron.
- **Robust SIP Engine**: Powered by a CGo implementation of PJSIP for rock-solid media and signaling handling.
- **Real-Time CTI Sync**: WebSocket connection to Yunshu backend for automated outbound dialing tasks and state management.
- **Local CRM Server**: Hosts a local HTTPS server (`54320`) allowing external browser-based CRM portals to seamlessly trigger desktop calls.

## 🚀 Getting Started

### Prerequisites
- [Go](https://golang.org/dl/) 1.23+
- Node.js 18+
- [Wails CLI v2](https://wails.io/docs/gettingstarted/installation)
- (macOS) Xcode Command Line Tools for CGo compilation

### Building & Running
```bash
# Clone the repository
git clone https://github.com/tangyu-dch/yunshu-phone.git
cd yunshu-phone

# Install frontend dependencies
cd frontend && npm install && cd ..

# Run in live development mode (Hot Reload)
wails dev

# Build the final production application
wails build
```

## 🗺️ Development Roadmap

### Phase 1: Architecture Rewrite & Core Telephony [✅ Completed]
- ✅ **Wails v2 Migration**: Complete transition from Electron to Go-based desktop container.
- ✅ **Event-Driven State Machine**: Replaced fragile IPC callback chains with a robust Go EventBus pattern.
- ✅ **PJSIP CGo Integration**: Successfully bound PJSIP C library for REGISTER and INVITE SIP signaling.
- ✅ **NAT & Docker Routing**: Fixed local `127.0.0.1` RTP media loopback and SIP transport routing.

### Phase 2: CRM & CTI Integrations [🚧 In Progress]
- ✅ **WebSocket Heartbeats**: Auto-reconnecting background worker for CTI commands.
- ✅ **Call Records UI**: Implemented paginated React UI for querying backend CDRs.
- 🚧 **Auto-Dialing Engine**: Processing backend `ws:callPhone` events for batch outbound campaigns.
- 🚧 **Local Webhook Server**: Polishing the `54320` CRM integration server.

### Phase 3: Media & Device Management [⏳ Pending]
- ⏳ **Hardware Device Selection**: Audio device selection UI for switching headsets and microphones.
- ⏳ **DTMF Transmission**: Sending active in-call digits via SIP INFO/RFC2833.
- ⏳ **Ringback & Notification Sounds**: Native audio playback for incoming rings and answered tones.

## 🔗 Related Projects
- **Backend Service (Required)**: [Yunshu (云枢) Distributed Intelligent Customer Service System](https://github.com/tangyu-dch/yunshu.git)

## 📄 License
Licensed under the GPL-3.0 License.
