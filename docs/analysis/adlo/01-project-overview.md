# Adlo 项目总览

> 源码路径：`adlo/`
> 版本：0.1.0 | 许可：MIT

## 项目定位

Adlo 是桌面端的应用宿主，基于 Rust + Tauri 2.x 构建。当前形态为**桌面应用宿主 + 第三方 Agent harness 集成**（见 `AGENTS.md#项目形态`）。Agent 对话、模型接入与编排能力由第三方 harness 提供，本仓库仅负责宿主集成。

| 特征 | 说明 |
|------|------|
| 桌面原生 | Rust + Tauri 2.x，原生性能与系统能力 |
| 双端架构 | Tauri 桌面 + 浏览器预览双模式（功能行为一致） |
| 第三方 harness 集成 | DSH 与 OpenCode CLI：进程托管（webapp-host）、版本管理（harness-version）、下载源与镜像（download-source）、中心多标签宿主渲染 |
| 工作区 | 多工作区管理、Git 操作、文件树、大纲解析、搜索 |
| 终端 | xterm.js 交互式终端（多会话 PTY + 单标签多窗格布局） |
| 编辑器 | CodeMirror 6 + 文件预览 + 差异查看器 |
| 内置浏览器 | Tauri WebView / iframe 双模式 + 网站元数据缓存 + 智能体站点链接拦截（白名单 origin 整站匹配，仅 WebView2 可注入） |
| 存储治理 | adl-kernel::storage 统一路径解析 + 启动期迁移 + 设置面板存储组 |
| 环境依赖管理 | adl-env 六依赖检测/来源模型 + adl-hosted 宿主版本托管；设置面板「网络」「环境」组、首启向导、runbook；卸载/重装，adl-server sidecar 随包 |
| 系统能力 | 剪贴板历史、系统监视器、CI 状态、GitHub 面板、凭据存储 |

## 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 桌面框架 | Tauri 2.x | Rust + WebView2 |
| 后端 | Rust stable + tokio | 异步运行时 |
| 数据库 | SQLite (rusqlite) | 本地持久化 |
| 前端 | React 19 + Vite 8 | UI 层 |
| 状态管理 | Zustand 5 | 切片合并模式（切片/action 数以 `slicedStore.ts`、`actions/` 实测为准） |
| 编辑器 | CodeMirror 6 (@uiw/react-codemirror) | 代码显示/编辑 |
| 终端 | xterm.js 6 + node-pty | 伪终端 |
| 类型 | TypeScript 5.6 | 严格模式 |
| 样式 | CSS Variables + CSS Modules | 设计 Token 驱动 |
| 测试 | Vitest 3 + Playwright (前端) / cargo test (Rust) | 双层测试 |
| 质量 | ESLint 9 + Prettier 3 + Clippy + rustfmt | 四维门禁 |

## 项目规模

| 指标 | 数量 |
|------|------|
| Rust Crates | 22（`crates/` 实测；workspace members 含 src-tauri 为 23） |
| Tauri Commands | 约 76（实测 `#[tauri::command]`，以源码为准） |
| Zustand 切片 | 29（slicedStore.ts 实测） |
| Action 模块 | 18（`actions/` 实测） |
| 前端功能域 | 30（见 `frontend/src/app/features/`） |
| IPC 接口域 | 19 个域文件（+ `digital-life.ts` 聚合，见 `frontend/src/shared/ipc/`） |
| i18n 文件 | 中英各 26（25 领域 + `index.ts`，以实现为准） |
| Rust 测试 | 616（截至 2026-09-15 的历史快照，以 `pnpm --dir adlo run cargo:test` 输出为准） |
| 前端测试 | 1947（截至 2026-09-15 的历史快照，以 `pnpm --dir adlo/frontend run test` 输出为准） |

> 快照数字可能滞后，当前准确计数以源码实测为准（`adlo/AGENTS.md` 不复制计数）。

## 项目形态

当前形态：桌面应用宿主 + 第三方 Agent harness 集成，范围边界见 `.agents/rules/phase-boundary.md`。

## 仓库工作区结构

```
adlo/
├── Cargo.toml              # Rust 工作区（22 crate + src-tauri）
├── crates/                 # 独立 crate
│   ├── kernel/             # 共享内核（app_info/config/config_watcher/events/storage）
│   ├── types/              # 共享类型
│   ├── errors/             # AppError 枚举
│   ├── storage/            # SQLite 持久化
│   ├── adl-logging/        # 日志系统
│   ├── migration/          # 数据库迁移
│   ├── workspace/          # 工作区
│   ├── pty/                # 伪终端
│   ├── fs-ops/             # 文件系统操作
│   ├── outline/            # 大纲解析
│   ├── credential/         # 凭据存储
│   ├── ci-status/          # CI 状态
│   ├── clipboard/          # 剪贴板历史
│   ├── sysmon/             # 系统监视器
│   ├── change-engine/      # 变更引擎
│   ├── server/             # adl-server 后端引擎
│   ├── webapp-host/        # dsh 进程托管
│   ├── browser/            # 内置浏览器（WebView 生命周期/下载/书签桥）
│   ├── harness-version/    # harness 版本管理（已装/最新/回退/升级/重装）
│   ├── download-source/    # 下载源与镜像
│   ├── adl-hosted/         # 宿主版本托管（版本目录/原子换装/进程宿主/进度任务）
│   ├── adl-env/            # 环境依赖（providers + 来源偏好 + 基线）
│   └── tauri-runtime-wry-patched/ # Tauri 运行时补丁
├── src-tauri/              # Tauri 入口
│   ├── src/main.rs          # 主函数
│   ├── src/lib.rs           # 应用入口
│   ├── src/setup.rs         # 启动流程（含存储迁移）
│   ├── src/state.rs         # AppState
│   ├── src/commands/        # 13 文件（12 领域 + mod.rs）
│   ├── src/capabilities/    # 权限能力（default.json + browser-remote.json）
│   └── tauri.conf.json      # Tauri 配置
├── frontend/               # React 前端
│   └── src/
│       ├── app/            # 应用主体
│       │       ├── features/  # 30 功能域（含 center 中心宿主、dsh、storage-settings、environment、network）
│       │   ├── components/ # 通用组件
│       │   ├── stores/    # Zustand 状态（切片数以 slicedStore.ts 实测为准）
│       │   ├── hooks/     # 自定义 Hook
│       │   ├── regions/   # 布局区域（TitleBar/CenterPane/LeftSidebar/RightPanel）
│       │   ├── i18n/      # 国际化（25 领域 × 中英）
│       │   └── App.tsx    # 根组件
│       ├── shared/ipc/    # IPC 接口（19 域文件 + digital-life.ts 聚合）
│       ├── design-system/ # 设计系统（tokens.ts 真源）
│       ├── styles/        # CSS 样式
│       ├── tauri-bridge/  # Tauri 桥接（9 域实现 + tauri-shared）
│       ├── preview-bridge/ # 浏览器桥接（12 实现文件 + 入口 index.ts）
│       ├── httpBridge.ts  # HTTP 桥接（ad-server 基底实现）
│       └── mock-bridge.ts # 纯内存模拟（+ mock/）
└── pnpm-workspace.yaml    # pnpm 工作区
```

## 架构层级

```
┌─────────────────────────────────────────────┐
│  Frontend (React 19 + Vite + TypeScript)     │
│  ├─ UI Layer: 组件/功能域/Hook               │
│  ├─ State Layer: Zustand (切片/action)        │
│  └─ Bridge Layer: IPC (tauri/preview/http/mock) │
├─────────────────────────────────────────────┤
│  Tauri IPC (invoke / #[tauri::command])      │
├─────────────────────────────────────────────┤
│  Backend (Rust + Tokio)                      │
│  ├─ Tauri Binary: 窗口/命令/capabilities     │
│  ├─ 宿主集成 Crates: webapp-host/harness-version/adl-hosted/download-source │
│  ├─ 环境依赖: adl-env（providers/来源/基线）+ adl-hosted（版本托管/进度任务）│
│  ├─ 领域服务: workspace/pty/fs-ops/outline/credential/ci-status/clipboard/sysmon/change-engine/server │
│  └─ Infrastructure: storage/logger/errors   │
└─────────────────────────────────────────────┘

双端架构:
  Tauri 模式  → Tauri Bridge → invoke → Rust Command
  浏览器模式  → Preview Bridge → http（优先，可回退 mock）→ adl-server
  HTTP 模式   → httpBridge → fetch → adl-server（Tauri/Preview 的基底实现）
  Mock 模式   → Mock Bridge → 纯内存模拟
```

## 关键设计理念

1. **Zustand 切片合并**：功能拆分为切片（以 `slicedStore.ts` 实测为准）+ action 模块（以 `actions/` 实测为准），通过 `slicedStore.ts` 合并导出
2. **IPC 四端桥接一致性**：Tauri/preview/http/mock 四桥接层必须保持接口一致
3. **Crate 分离与依赖倒置**：每个 crate 有明确边界，通过 traits 解耦
4. **Rust 错误统一**：通过 `AppError` 枚举跨 crate 传播，`captureTypedError` 前端消费
5. **设计 Token 驱动**：`tokens.ts` 定义完整设计 Token，`theme.ts` 驱动主题切换
6. **i18n 全覆盖**：所有 UI 文本使用 i18n key，中英双语各 25 域文件（+ index.ts，以实现为准）
