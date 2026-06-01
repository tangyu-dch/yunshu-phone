# AGENTS.md — 云枢 (yunshu-phone) 开发指南

> 基于 **Go + Wails v2 + React 18 + TypeScript** 构建的桌面端电话呼叫中心客户端。
> 从 Electron + JsSIP 架构重构而来，采用事件驱动 + 状态中心的现代设计。

---

## 项目概述

云枢是一款为电销坐席设计的桌面软电话应用，支持手动拨号与批量自动外呼两种模式。通过 SIP/WebRTC 实现 VoIP 通话，通过 WebSocket 实现实时任务调度和状态同步。

**核心技术决策（相比原版 Electron 的改进）：**

1. **Go 后端替代 Electron 主进程** — 更好的性能、并发能力和类型安全
2. **事件驱动架构** — Go 层通过 EventBus 协调 SIP、WebSocket、HTTP 等模块，彻底解决原版中 React 组件间复杂的 callback 链和循环引用问题
3. **状态中心模式** — Go 后端持有全局状态的唯一真实来源，前端是轻量的响应式 UI 层
4. **PJSIP 替代 JsSIP** — 通过 CGo 集成 PJSIP C 库，获得更好的音频处理性能和 SIP 协议兼容性（当前为接口预留，暂用 stub 实现）
5. **Wails 绑定替代 IPC** — 前端直接调用 Go 方法，类型安全且无需序列化开销

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面容器 | Wails v2 |
| 后端语言 | Go 1.23+ |
| SIP 软电话 | PJSIP（CGo 绑定，接口已预留） |
| WebSocket | gorilla/websocket |
| HTTP 客户端 | net/http（自封装拦截器） |
| 加密 | AES-ECB-128（标准库实现） |
| 前端框架 | React 18 + TypeScript 5 |
| UI 组件库 | Ant Design 5 |
| 状态管理 | Redux Toolkit |
| 路由 | React Router DOM 6（HashRouter） |
| 构建工具 | Vite 5 |
| 打包 | Wails 内置（支持 macOS / Windows / Linux） |

---

## 项目目录结构

```
yunshu-phone/
├── main.go                         # 应用入口，Wails 配置和生命周期
├── wails.json                      # Wails 项目配置
├── go.mod / go.sum                 # Go 依赖管理
│
├── internal/                       # Go 内部包（不对外暴露）
│   ├── config/
│   │   └── config.go               # 环境配置（test/production 双环境）
│   ├── crypto/
│   │   └── aes.go                  # AES-ECB 加解密（号码/SIP凭据）
│   ├── api/
│   │   ├── client.go               # HTTP 客户端（拦截器、token、版本头）
│   │   └── endpoints.go            # 所有 API 端点定义和请求方法
│   ├── event/
│   │   └── bus.go                  # 进程内事件总线（模块间通信核心）
│   ├── core/
│   │   ├── core.go                 # 中央协调器（连接编排、业务逻辑、状态管理）
│   │   └── state.go                # 全局状态定义和变更方法
│   ├── bridge/
│   │   ├── app.go                  # AppBridge — 前端调用：认证、配置、窗口控制
│   │   └── call.go                 # CallBridge — 前端调用：通话操作
│   ├── ws/
│   │   └── websocket.go            # WebSocket 客户端（心跳、重连、消息队列）
│   ├── sip/
│   │   └── phone.go                # SIP 电话接口 + PJSIP stub 实现
│   ├── server/
│   │   └── local_server.go         # 本地 HTTPS 服务器（CRM 集成）
│   └── mouse/
│       └── monitor.go              # 鼠标活动监控（自动外呼暂停/坐席在线状态）
│
├── build/
│   ├── appicon.png                 # 应用图标
│   ├── certs/                      # HTTPS 证书（本地 CRM 服务器用）
│   │   ├── 51zhulie.com.crt
│   │   ├── 51zhulie.com.key
│   │   └── 51zhulie.com.pfx
│   ├── darwin/                     # macOS 打包配置
│   └── windows/                    # Windows 打包配置
│
└── frontend/                       # React 前端
    ├── index.html                  # HTML 入口
    ├── package.json                # 前端依赖
    ├── vite.config.ts              # Vite 构建配置
    ├── tsconfig.json               # TypeScript 配置
    │
    ├── src/
    │   ├── main.tsx                # React 挂载入口（Provider 包装）
    │   ├── App.tsx                 # 路由配置（HashRouter + 路由守卫）
    │   ├── style.css               # 全局样式
    │   │
    │   ├── store/                  # Redux 状态管理
    │   │   ├── index.ts            # Store 配置
    │   │   ├── userSlice.ts        # 用户状态（登录/注销）
    │   │   └── appSlice.ts         # 应用状态（通话/连接/SIP/WS）
    │   │
    │   ├── components/
    │   │   ├── login/
    │   │   │   └── Login.tsx       # 登录页
    │   │   ├── header/
    │   │   │   └── Header.tsx      # 自定义无边框标题栏
    │   │   └── index/
    │   │       ├── Index.tsx       # 主页容器（Tab 页签）
    │   │       └── components/
    │   │           ├── PhoneCall.tsx       # 通话状态机（核心编排组件）
    │   │           ├── CallRecords.tsx     # 通话记录列表
    │   │           └── phone/
    │   │               ├── types.ts              # 类型定义
    │   │               ├── DialPad.tsx           # 手动拨号盘
    │   │               ├── CallingView.tsx       # 呼叫中视图
    │   │               ├── InCallView.tsx        # 通话中视图（含 DTMF）
    │   │               ├── AutoCallView.tsx      # 自动外呼等待视图
    │   │               └── RegistrationStatus.tsx # 连接状态指示器
    │   │
    │   ├── utils/
    │   │   └── tools.ts            # 前端工具函数（格式化、脱敏、校验）
    │   │
    │   └── assets/
    │       ├── iconfont.css        # 图标字体样式
    │       ├── main.css            # 主样式
    │       ├── base.css            # 基础/重置样式
    │       ├── font/               # 图标字体文件
    │       └── sounds/             # 通话提示音
    │           ├── answered.wav
    │           ├── ringing.wav
    │           └── hangup.wav
    │
    └── wailsjs/                    # Wails 自动生成的 JS 绑定
        ├── go/                     # Go 方法的 TypeScript 绑定
        └── runtime/                # Wails 运行时 API
```

---

## 架构设计

### 整体数据流

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (React)                  │
│                                                      │
│  Login ──→ Index ──→ PhoneCall ──→ DialPad/Views    │
│    │         │         │                             │
│    │         │         │  dispatch                    │
│    │         │         ▼                             │
│    │         │    Redux Store                         │
│    │         │    (user + app)                        │
│    ▼         ▼                                       │
│  ┌──────────────────────┐                            │
│  │   Wails Bindings     │  ← 前端调用 Go 方法         │
│  │  AppBridge/CallBridge│                            │
│  └──────────┬───────────┘                            │
│             │                                        │
│  ┌──────────▼───────────┐                            │
│  │   Wails Events       │  ← Go 推送事件到前端        │
│  │  EventsOn/EventsOff  │                            │
│  └──────────────────────┘                            │
└─────────────┬───────────────────────────────────────┘
              │
══════════════╪═══════════════════════════════════════ Go 层
              │
┌─────────────▼───────────────────────────────────────┐
│                   Bridge Layer                       │
│  ┌────────────┐  ┌────────────┐                     │
│  │ AppBridge  │  │ CallBridge │  ← Wails 绑定       │
│  └─────┬──────┘  └─────┬──────┘                     │
│        └────────┬──────┘                            │
│                 ▼                                    │
│  ┌──────────────────────────────┐                    │
│  │         Core (协调器)         │                    │
│  │  · 全局状态管理               │                    │
│  │  · 连接编排（3步流程）         │                    │
│  │  · 业务逻辑处理               │                    │
│  │  · 通话计时器                 │                    │
│  └──────┬──────────┬───────────┘                    │
│         │          │                                 │
│  ┌──────▼──┐  ┌───▼────────┐  ┌──────────────┐     │
│  │ EventBus│  │ WS Client  │  │ Local Server │     │
│  │ (事件流)│  │ (心跳重连)  │  │ (CRM 集成)   │     │
│  └──────┬──┘  └────────────┘  └──────────────┘     │
│         │                                            │
│  ┌──────▼──────┐  ┌────────────┐  ┌──────────┐     │
│  │  SIP Phone  │  │ API Client │  │  Mouse   │     │
│  │  (PJSIP)    │  │ (HTTP)     │  │ Monitor  │     │
│  └─────────────┘  └────────────┘  └──────────┘     │
└─────────────────────────────────────────────────────┘
```

### 事件总线（EventBus）

EventBus 是模块间通信的核心机制，替代了原版 Electron 中复杂的 IPC + callback 链：

```go
// 模块间通过事件通信，无需直接引用
bus.Emit(event.WSCallPhone, callPhoneData)  // WS 收到外呼任务
bus.Emit(event.CallEnded, "正常挂断")         // SIP 通话结束
```

**关键事件类型：**

| 事件 | 来源 | 用途 |
|------|------|------|
| `sip:registered` | SIP 模块 | SIP 注册成功 |
| `sip:disconnected` | SIP 模块 | SIP 断连，触发自动重连 |
| `call:progress` | SIP 模块 | 外呼振铃 |
| `call:ended` | SIP 模块 | 通话结束 |
| `ws:callPhone` | WS 模块 | 自动外呼任务下发 |
| `ws:ring` / `ws:answer` | WS 模块 | 来电接听/对方接听 |
| `mouse:inactive` | Mouse 模块 | 鼠标长时间未活动 |
| `conn:ready` | Core | 所有连接就绪 |

### 连接编排（3步流程）

应用登录后执行 3 步连接流程，每步有独立状态追踪：

```
1. 获取分机信息 (extension)
   GET /mer/v1/user/dialpad/extensionInfo
   → 解密 SIP 账号密码 (AES-ECB)
   ↓
2. SIP 注册 (sip)
   PJSIP Init + Register
   → 等待 registered 回调（10s 超时）
   ↓
3. WebSocket 连接 (websocket)
   wss://api/cc/ws/websocket?token=xxx
   → 心跳 30s，最多重连 5 次
   ↓
✅ 所有连接就绪 → 前端显示拨号盘
```

每步状态: `pending` → `loading` → `success` / `failed`

### 通话状态机

```
idle（空闲）
  │
  ├── 手动拨号 DialPad → CallBridge.MakeCall()
  │   └── SIP Call → progress → ringing
  │
  ├── 自动外呼 WS callPhone → CallBridge.MakeCall()
  │   └── SIP Call → progress → ringing
  │
  ├── 来电 WS ring → CallBridge.AnswerCall()
  │   └── SIP Answer → ringing
  │
ringing（振铃中）
  │
  ├── WS answer / SIP confirmed → in_progress
  │
in_progress（通话中）
  │
  ├── CallBridge.HangupCall() → idle
  ├── SIP hangup → idle
  └── WS hangupCause → idle
```

---

## Go 后端模块详解

### config — 环境配置

支持 `test` 和 `production` 双环境，通过环境变量 `BASE_ENV=production` 或运行时 `AppBridge.SetEnvironment()` 切换：

| 环境 | API 地址 | WS 地址 |
|------|---------|---------|
| production | `https://dolphinapi.51zhulie.com` | `wss://dolphinapi.51zhulie.com/cc/ws/websocket` |
| test | `https://test.api.toyfuns.top/dolphin-gateway` | `wss://test.api.toyfuns.top/dolphin-gateway/cc/ws/websocket` |

本地 CRM 服务器端口: `54320`（测试和生产共用）

### crypto — AES-ECB 加解密

号码加解密用于保护客户隐私，密钥硬编码（与原版保持一致）：

| 函数 | 密钥 | 用途 |
|------|------|------|
| `DecryptSIPCredential` | `vL4oU4jJ8qS3oC4v` | 解密 SIP 分机号和密码 |
| `DecryptPhoneNumber` | `2has1d8jef49v0ru` | 解密服务端下发的被叫号码 |
| `EncryptPhoneNumber` | `2has1d8jef49v0ru` | 加密外呼号码上报 |

格式: 明文字符串 ↔ AES-ECB-128 ↔ hex 字符串

### api — HTTP 客户端

封装了统一的请求/响应拦截器：

**请求拦截：** 自动注入 `Authorization` 和 `dolphin_version` 请求头

**响应码处理：**
| 状态码 | 处理 |
|--------|------|
| 200 | 正常返回 |
| 400 | 业务错误，返回 message |
| 401 / 4011 | 登录失效，触发 AppLogout 事件 |
| 426 | 版本过期，触发升级提示 |

**API 端点清单：**

| 端点 | 方法 | 用途 |
|------|------|------|
| `/mer/auth/dialpad/login` | POST | 登录 |
| `/mer/auth/dialpad/logout` | POST | 注销 |
| `/mer/v1/user/dialpad/extensionInfo` | GET | SIP 分机信息 |
| `/mer/v1/user/dialpad/checkIfUserHasValidNumber` | GET | 校验主叫号码 |
| `/mer/v1/call` | POST | 发起外呼 |
| `/cti/hangup` | POST | 服务端挂断 |
| `/mer/v1/record/dialpad/call-page` | POST | 通话记录分页 |
| `/mer/v1/record/dialpad/call-total` | GET | 通话统计 |
| `/mer/v1/batch-call-dialpad/ws-pause-status` | GET | 查询暂停任务 |
| `/mer/v1/batch-call-dialpad/start-task` | POST | 恢复暂停任务 |
| `/mer/version/dialpad` | GET | 版本信息 |

### ws — WebSocket 客户端

生产级 WebSocket 封装：

- **心跳保活：** 30s 发送 `{ msgType: "ping" }`
- **自动重连：** 5s 间隔，最多 5 次
- **消息队列：** 未连接时缓存消息，连接后自动发送
- **状态追踪：** disconnected → connecting → connected → reconnecting → error

**业务消息类型：**

| msgType | 方向 | 用途 |
|---------|------|------|
| `ping` / `pang` | 双向 | 心跳 |
| `callPhone` | 服务端→客户端 | 外呼任务下发 |
| `changeTaskStatus` | 双向 | 任务状态变更（RUNNING/PAUSED） |
| `ring` | 服务端→客户端 | 接听来电通知 |
| `answer` | 服务端→客户端 | 对方已接听 |
| `hangupCause` | 服务端→客户端 | 挂断原因 |
| `changeCallStatus` | 客户端→服务端 | 上报通话状态 |
| `logout` / `LOGOUT` | 服务端→客户端 | 登录失效 |
| `system_info` | 服务端→客户端 | 系统信息（灰度标识） |

### sip — SIP 电话模块

定义了 `Phone` 接口，支持多种实现：

```go
type Phone interface {
    Init(params Params) error
    Register() error
    Call(phoneNumber string, extraHeaders map[string]string) error
    Answer() error
    Hangup(reason string) error
    SendDTMF(digit string) error
    Stop() error
    GetRegStatus() RegStatus
    GetCallState() CallState
    SetCallCallbacks(cb CallCallbacks)
    SetRegCallbacks(cb RegCallbacks)
}
```

当前实现: `PJSIPPhone`（stub，接口已就绪）

**PJSIP 集成计划：**
1. 安装 PJSIP C 库: `brew install pjsip` (macOS) 或从源码编译
2. 配置 CGo 编译标志: `CGO_CFLAGS` 和 `CGO_LDFLAGS`
3. 使用 `//go:build pjsip` 构建标签
4. 实现 PJSIP 事件循环 → Go channel 桥接

### server — 本地 HTTPS 服务器

运行在端口 `54320`，允许外部 CRM 平台触发呼叫：

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/call` | POST | 触发外呼（验证状态后转发到前端） |
| `/api/isCallLogin` | POST | 检查拨号器是否就绪 |
| `/api/serveCheck` | POST | 健康检查 |

### mouse — 鼠标活动监控

两组独立监控器：

1. **自动外呼监控：** 可配置超时（来自服务端），超时后暂停外呼
2. **坐席在线监控：** 固定 120s 超时，超时后标记为"离开"

---

## 前端架构详解

### 路由

| 路径 | 组件 | 守卫 |
|------|------|------|
| `/login` | Login | 无 |
| `/index` | Index | 需要已登录（Redux `user.isLoggedIn`） |
| `*` | 重定向 | 自动跳转到登录或主页 |

使用 HashRouter（`#/login`、`#/index`），兼容 Wails 的 file:// 协议。

### Redux 状态

**userSlice：**
- `isLoggedIn: boolean`
- `userInfo: { id, username, seatNumber, roleDetail.permissions }`
- `token: string`
- `inactivityDurationSec: number`
- 持久化到 `localStorage` (key: `yunshu_user`)

**appSlice：**
- `sipStatus`, `wsStatus` — 连接状态
- `callState` — 通话状态: `idle | ringing | in_progress`
- `callNumber`, `callDuration` — 当前通话信息
- `connReady`, `connSteps` — 连接进度
- `isAutoCall` — 自动外呼模式
- `agentOnline` — 坐席在线状态
- `isGrayscale` — 灰度发布标识

### 权限控制

基于 `userInfo.roleDetail.permissions` 字段：

| 权限标识 | 功能 |
|----------|------|
| `dial-pad:record-view` | 显示"拨打记录"Tab |
| `dial-pad:direct-call` | 允许手动拨号 |

### Wails 事件监听

前端通过 `EventsOn` 监听 Go 后端推送的事件：

| 事件名 | 数据 | 处理 |
|--------|------|------|
| `conn:step` | `ConnStep[]` | 更新连接进度 |
| `conn:ready` | — | 标记连接就绪 |
| `call:progress` | `displayNumber` | 进入振铃状态 |
| `call:ring` | — | 自动接听来电 |
| `call:answered` | — | 对方已接听 |
| `call:confirmed` | — | 通话确认 |
| `call:ended` | `reason` | 通话结束 |
| `call:failed` | `{code, reason}` | 呼叫失败 |
| `call:tick` | `durationSec` | 更新通话计时 |
| `sip:registered` | — | SIP 注册成功 |
| `sip:disconnected` | — | SIP 断连，自动重试 |
| `ws:callPhone` | `{phone, type, taskId...}` | 自动外呼任务 |
| `ws:taskStatus` | `{option, afterState}` | 切换自动外呼状态 |
| `mouse:inactive` | — | 鼠标不活动警告 |
| `agent:status` | `"online"/"leave"` | 坐席状态指示器 |
| `app:forceLogout` | — | 强制登出 |

---

## 开发指南

### 环境要求

- Go 1.23+
- Node.js 18+
- Wails CLI v2: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
- 运行 `wails doctor` 检查系统依赖

### 启动开发

```bash
# 安装前端依赖
cd frontend && npm install && cd ..

# 开发模式（前端热更新 + Go 热重载）
wails dev

# 仅构建前端
cd frontend && npm run build && cd ..

# 构建完整应用
wails build

# 生产环境构建
BASE_ENV=production wails build
```

### Go 后端开发规范

1. **包组织：** 所有业务逻辑放在 `internal/` 下，按功能域分包
2. **错误处理：** 使用 Go 标准错误返回模式，不使用 panic
3. **并发安全：** 共享状态使用 `sync.RWMutex`，事件处理使用 goroutine
4. **日志：** 使用 `log` 标准库，格式 `[模块名] 消息`
5. **Bridge 方法：** 只暴露前端需要调用的方法，保持接口简洁
6. **事件命名：** 使用 `模块:动作` 格式（如 `call:ended`、`ws:callPhone`）

### 前端开发规范

1. **组件拆分：** 每个组件文件只负责一个功能，保持单一职责
2. **状态管理：** 全局状态用 Redux，组件局部状态用 useState
3. **事件清理：** useEffect 返回清理函数，取消 EventsOn 监听
4. **类型安全：** 所有组件 props 和 state 都要有 TypeScript 类型定义
5. **Wails 绑定：** 从 `wailsjs/go/` 导入，这些文件由 `wails generate` 自动生成
6. **样式：** 使用 inline style 或 CSS 类名，避免全局样式冲突

### 添加新的 API 端点

1. 在 `internal/api/endpoints.go` 添加请求方法和响应类型
2. 如需暴露给前端，在对应的 Bridge 方法中调用
3. 更新本文档的 API 端点清单

### 添加新的 Wails 事件

1. 在 `internal/event/bus.go` 定义事件常量
2. 在 `internal/core/core.go` 的 `setupEventHandlers()` 中注册处理逻辑
3. 使用 `emitToFrontend()` 推送到前端
4. 在前端组件中使用 `EventsOn` 监听

---

## 环境变量

| 变量名 | 说明 |
|--------|------|
| `BASE_ENV` | 设为 `production` 使用正式环境 API，否则使用测试环境 |

---

## 已知限制和 TODO

1. **PJSIP 集成：** 当前 SIP 模块为 stub 实现，需要集成 PJSIP CGo 绑定
2. **通话记录 API：** 前端 CallRecords 组件已搭建，需要通过 Bridge 暴露 API 调用
3. **音频播放：** 通话提示音（ringing/answered/hangup.wav）需要在前端实现播放逻辑
4. **自动更新：** 原版的 electron-updater 功能需要替换为 Wails 兼容的更新方案
5. **窗口抖动：** 原版 GSAP 窗口抖动动画需要替换为 Wails 的窗口操作 API
6. **音频检测：** 耳麦检测功能需要在前端实现 getUserMedia 回环测试
7. **DTMF 发送：** InCallView 已实现 UI，需要确认 PJSIP DTMF 接口
8. **号码脱敏规则：** 服务端可能返回脱敏配置，需要前端适配

---

## 后端 API 服务

本应用对接的后端 API 项目为 `yunshu`：
- 仓库: https://github.com/tangyu-dch/yunshu.git
- 主要服务模块: `cc-call`（通话管理）、`cc-edge`（边缘节点）、`cc-worker`（任务调度）
