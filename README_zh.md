# 📞 Yunshu-Phone (云枢软电话)

[English](README.md) | **中文版**

Yunshu-Phone 是 [云枢 (Yunshu) 分布式智能客服与呼叫中心系统](https://github.com/tangyu-dch/yunshu.git) 的**官方配套桌面客户端**。
本项目基于 **Go + Wails v2 + React 18 + TypeScript** 彻底重构，旨在为企业电销坐席提供一个高性能、低内存占用的原生编译桌面 SIP 软电话。

> **⚠️ 核心兼容性声明**
> 本项目是 [https://github.com/tangyu-dch/yunshu.git](https://github.com/tangyu-dch/yunshu.git) 唯一的**专属配套客户端**。
> 它深度集成了云枢后端的 CTI WebSocket 协议、CRM 鉴权 Token 以及 Kamailio 路由规则。**本项目不支持、也永远不会支持连接到其他任何第三方的 PBX、FreeSWITCH 或标准 SIP 服务器。**

## 🎨 概览与界面

Yunshu-Phone 抛弃了传统的 Electron 架构，采用现代化的事件驱动与状态中心设计。利用 Go 的原生并发优势处理 SIP 状态机与 WebSocket 心跳，让 React 前端回归轻量级的响应式 UI 渲染。

| 🟢 通话界面 (In-Call) | 📜 拨打记录 (Call Records) |
| :---: | :---: |
| ![通话界面](https://raw.githubusercontent.com/tangyu-dch/yunshu-phone/main/build/appicon.png) | ![记录界面](https://raw.githubusercontent.com/tangyu-dch/yunshu-phone/main/build/appicon.png) |
| *(注：后续请将实际截图上传至 `docs/` 目录替换此应用图标占位图)* | *(注：后续请将实际截图上传至 `docs/` 目录替换此应用图标占位图)* |

### 核心特性
- **原生操作系统集成**: 使用 Wails v2 构建，相比 Electron，内存占用极低且启动极快。
- **硬核 SIP 引擎**: 通过 CGo 深度集成 PJSIP 核心库，提供坚若磐石的媒体流和信令处理。
- **实时 CTI 同步**: 后台 WebSocket 实时连接云枢后端，支持自动外呼任务分发和状态云端同步。
- **本地 CRM 服务器**: 内置本地 HTTPS 服务器 (`54320` 端口)，允许外部浏览器 CRM 系统一键唤起桌面端外呼。

## 🚀 快速开始

### 环境依赖
- [Go](https://golang.org/dl/) 1.23+
- Node.js 18+
- [Wails CLI v2](https://wails.io/docs/gettingstarted/installation)
- (macOS) Xcode Command Line Tools（用于 CGo 编译）

### 构建与运行
```bash
# 克隆仓库
git clone https://github.com/tangyu-dch/yunshu-phone.git
cd yunshu-phone

# 安装前端依赖
cd frontend && npm install && cd ..

# 运行实时开发模式 (支持前端热更新)
wails dev

# 构建最终的生产环境桌面应用
wails build
```

## 🗺️ 开发计划 (Roadmap)

### 第一阶段：架构重构与底层通信 [✅ 已完成]
- ✅ **Wails v2 迁移**: 完成从 Electron 到 Go 桌面容器的全面过渡。
- ✅ **事件驱动状态机**: 废弃脆弱的 IPC 回调地狱，采用健壮的 Go EventBus 模式。
- ✅ **PJSIP CGo 集成**: 成功绑定 PJSIP C 库，完成完整的 REGISTER 注册和 INVITE 信令闭环。
- ✅ **NAT 与 Docker 路由**: 彻底修复本地 `127.0.0.1` 环境下的 RTP 媒体回环和 SIP 传输层路由问题。

### 第二阶段：CRM 与 CTI 业务集成 [🚧 进行中]
- ✅ **WebSocket 心跳与重连**: 稳定的后台守护协程，处理 CTI 指令下发。
- ✅ **通话记录 UI**: 完成 React 分页列表 UI，与后端 CDR 接口完全对接。
- 🚧 **自动外呼引擎**: 正在处理后端的 `ws:callPhone` 批量自动外呼任务分发。
- 🚧 **本地 Webhook 服务器**: 正在完善 `54320` 端口的 CRM 联动触发逻辑。

### 第三阶段：媒体与设备管理 [⏳ 待开发]
- ⏳ **硬件设备选择**: 前端 UI 与底层音频 API 对接，支持热切换耳麦和扬声器。
- ⏳ **DTMF 二次拨号**: 在通话中通过 SIP INFO/RFC2833 发送按键音（例如转接分机）。
- ⏳ **振铃与提示音**: 本地媒体播放器集成，支持来电响铃和挂机提示音。

## 🔗 关联项目
- **服务端 (必选)**: [云枢 (Yunshu) 分布式智能客服与呼叫中心系统](https://github.com/tangyu-dch/yunshu.git)

## 📄 开源协议
本项目采用 GPL-3.0 开源协议。
