# AI Digital Life 项目总览

> 源码路径：`ai-digital-life/`
> 版本：0.1.0 | 许可：MIT

## 项目定位

AI 数字生命（AI Digital Life）是一个 **AI 数字生命桌面应用宿主**，基于 Rust + Tauri 2.x 构建。当前形态：**桌面应用宿主 + 第三方 Agent harness 集成**（见 `AGENTS.md#项目形态`）。Agent 对话、模型接入与编排能力由第三方 harness 提供，本仓库仅负责宿主集成。

| 特征 | 说明 |
|------|------|
| 桌面原生 | Rust + Tauri 2.x，原生性能与系统能力 |
| 双端架构 | Tauri 桌面 + 浏览器预览双模式（功能行为一致） |
| 第三方 harness 集成 | deepseek dsh：进程托管（webapp-host）、版本管理（dsh-bundle/dsh-version）、下载源与镜像（download-source）、中间区多标签宿主渲染 |
| 工作区 | 多工作区管理、Git 操作、文件树、大纲解析、搜索 |
| 终端 | xterm.js 交互式终端（多会话 PTY + 单标签多窗格布局） |
| 编辑器 | CodeMirror 6 + 文件预览 + 差异查看器 |
| 内置浏览器 | Tauri WebView / iframe 双模式 + 网站元数据缓存 |
| 存储治理 | adl-kernel::storage 统一路径解析 + 启动期迁移 + 设置面板存储组 |
| 系统能力 | 剪贴板历史、系统监视器、CI 状态、GitHub 面板、凭据存储 |

## 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 桌面框架 | Tauri 2.x | Rust + WebView2 |
| 后端 | Rust stable + tokio | 异步运行时 |
| 数据库 | SQLite (rusqlite) | 本地持久化 |
| 前端 | React 19 + Vite 8 | UI 层 |
| 状态管理 | Zustand 5 | 切片合并模式（32 切片 + 18 action，见 ai-digital-life/AGENTS.md） |
| 编辑器 | CodeMirror 6 (@uiw/react-codemirror) | 代码显示/编辑 |
| 终端 | xterm.js 6 + node-pty | 伪终端 |
| 类型 | TypeScript 5.6 | 严格模式 |
| 样式 | CSS Variables + CSS Modules | 设计 Token 驱动 |
| 测试 | Vitest 3 + Playwright (前端) / cargo test (Rust) | 双层测试 |
| 质量 | ESLint 9 + Prettier 3 + Clippy + rustfmt | 四维门禁 |

## 项目规模

| 指标 | 数量 |
|------|------|
| Rust Crates | 22 |
| Tauri Commands | 见源码 `src-tauri/src/commands/`（约 74 个，截至 2026-10-13，按 `#[tauri::command]` 标注口径） |
| Zustand 切片 | 32（slicedStore.ts 实测，AGENTS.md 已同步） |
| Action 模块 | 18（AGENTS.md 已同步） |
| 前端功能域 | 25（见 `frontend/src/app/features/`） |
| IPC 接口域 | 25 个文件（见 `frontend/src/shared/ipc/`） |
| i18n 文件 | 约 46（中英各约 23，以实现为准） |
| Rust 测试 | 616（截至 2026-09-15，见 ai-digital-life/AGENTS.md） |
| 前端测试 | 1947（截至 2026-09-15，见 ai-digital-life/AGENTS.md） |

> 快照数字可能滞后，当前准确计数以源码与 `ai-digital-life/AGENTS.md` 为准。

## 项目形态

当前形态：桌面应用宿主 + 第三方 Agent harness 集成，范围边界见 `.agents/rules/phase-boundary.md`。

## 仓库工作区结构

```
ai-digital-life/
├── Cargo.toml              # Rust 工作区（22 crate）
├── crates/                 # 独立 crate
│   ├── kernel/             # 共享内核（app_info/config/events/storage/types）
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
│   ├── dsh-bundle/         # 内置 dsh 包
│   ├── dsh-version/        # dsh 版本管理
│   ├── download-source/    # 下载源与镜像
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
│       │   ├── features/  # 25 功能域（含 center 中间区宿主、dsh、storage-settings）
│       │   ├── components/ # 通用组件
│       │   ├── stores/    # Zustand 状态（32 切片，slicedStore.ts）
│       │   ├── hooks/     # 自定义 Hook
│       │   ├── regions/   # 布局区域（TitleBar/CenterPane/LeftSidebar/RightPanel）
│       │   ├── i18n/      # 国际化（22 领域 × 中英）
│       │   └── App.tsx    # 根组件
│       ├── shared/ipc/    # IPC 接口（25 文件）
│       ├── design-system/ # 设计系统（tokens.ts 真源）
│       ├── styles/        # CSS 样式
│       ├── tauri-bridge/  # Tauri 桥接（8 领域）
│       ├── preview-bridge/ # 浏览器桥接（11 实现文件 + 入口 index.ts）
│       └── mock-bridge.ts # 纯内存模拟（+ mock/）
└── pnpm-workspace.yaml    # pnpm 工作区
```

## 架构层级

```
┌─────────────────────────────────────────────┐
│  Frontend (React 19 + Vite + TypeScript)     │
│  ├─ UI Layer: 组件/功能域/Hook               │
│  ├─ State Layer: Zustand (切片/action)        │
│  └─ Bridge Layer: IPC (tauri/preview/mock)   │
├─────────────────────────────────────────────┤
│  Tauri IPC (invoke / #[tauri::command])      │
├─────────────────────────────────────────────┤
│  Backend (Rust + Tokio)                      │
│  ├─ Tauri Binary: 窗口/命令/capabilities     │
│  ├─ 宿主集成 Crates: webapp-host/dsh-bundle/dsh-version/download-source │
│  ├─ 领域服务: workspace/pty/fs-ops/outline/credential/ci-status/clipboard/sysmon/change-engine/server │
│  └─ Infrastructure: storage/logger/errors   │
└─────────────────────────────────────────────┘

双端架构:
  Tauri 模式  → Tauri Bridge → invoke → Rust Command
  浏览器模式  → Preview Bridge → HTTP Polling → Vite 中间件
  Mock 模式   → Mock Bridge → 纯内存模拟
```

## 关键设计理念

1. **Zustand 切片合并**：功能拆分为 32 切片 + 18 action 模块，通过 `slicedStore.ts` 合并导出
2. **IPC 三桥接一致性**：Tauri/preview/mock 三桥接层必须保持接口一致
3. **Crate 分离与依赖倒置**：每个 crate 有明确边界，通过 traits 解耦
4. **Rust 错误统一**：通过 `AppError` 枚举跨 crate 传播，`captureTypedError` 前端消费
5. **设计 Token 驱动**：`tokens.ts` 定义完整设计 Token，`theme.ts` 驱动主题切换
6. **i18n 全覆盖**：所有 UI 文本使用 i18n key，中英双语各约 23 域文件（以实现为准）
