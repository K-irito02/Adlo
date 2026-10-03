# AI Digital Life 项目总览

> 源码路径：`ai-digital-life/`
> 版本：0.1.0 | 许可：MIT

## 项目定位

AI 数字生命（AI Digital Life）是一个 **AI 编码代理桌面应用**，基于 Rust + Tauri 2.x 构建，对标参考实现的能力集。当前已完成 Phase 2 全部 18 项缺失能力实现。

| 特征 | 说明 |
|------|------|
| 桌面原生 | Rust + Tauri 2.x，原生性能与系统能力 |
| 双端架构 | Tauri 桌面 + 浏览器预览双模式 |
| 模型无关 | 支持 7+ Provider（Anthropic/OpenAI/Google/Azure/xAI/Local...） |
| MCP 集成 | Stdio/SSE/StreamableHTTP 3 Transport + OAuth |
| LSP 集成 | 完整 LSP 客户端（诊断/符号/定义/引用） |
| 多 Agent | 7 内置 Agent + 自定义 Agent + 子代理 |
| 多工作区 | 同时管理多个工作区目录 |
| 内置浏览器 | 基于 Tauri WebView2 的内置浏览器 |

## 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 桌面框架 | Tauri 2.x | Rust + WebView2 |
| 后端 | Rust stable + tokio | 异步运行时 |
| 数据库 | SQLite (rusqlite) | 本地持久化 |
| 前端 | React 19 + Vite 8 | UI 层 |
| 状态管理 | Zustand 5 | 切片合并模式（24 切片 + 12 action） |
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
| Tauri Commands | 33 |
| Zustand 切片 | 24 |
| Action 模块 | 12 |
| 前端功能域 | 26 |
| IPC 接口域 | 30 |
| i18n 文件 | 52（中英各 26） |
| Rust 测试 | 508 |
| 前端测试 | 431 |
| 重构轮次 | 93 |

## Phase 演进

| Phase | 状态 | 范围 |
|-------|------|------|
| Phase 0 | ✅ 已完成 | 架构底座、桌面壳层、安全边界、基础设施 |
| Phase 1 | ✅ 已完成 | 交互式 MVP、模型接入、上下文、变更预览 |
| Phase 2 | ✅ 已完成 | 18 项缺失能力（多 Agent/MCP/多 Provider/Compaction/Snapshot/...） |
| Phase 2 增强 | ✅ 已完成 | Provider 动态注册 + SSE 流式传输 + ModelPicker |

## 仓库工作区结构

```
ai-digital-life/
├── Cargo.toml              # Rust 工作区（22 crate）
├── crates/                 # 独立 crate
│   ├── kernel/             # 核心类型与常量
│   ├── errors/             # AppError 枚举
│   ├── storage/            # SQLite 持久化
│   ├── agent-runtime/      # Agent 运行时
│   ├── model-gateway/      # 模型网关
│   ├── conversation/       # 会话管理
│   ├── workspace/          # 工作区
│   ├── command/            # 命令执行
│   ├── pty/                # 伪终端
│   ├── mcp-client/         # MCP 客户端
│   ├── lsp-client/         # LSP 客户端
│   ├── browser/            # 内置浏览器
│   ├── change-engine/      # 变更引擎
│   ├── subagent/           # 子代理
│   ├── task/               # 任务状态机
│   ├── context/            # 上下文
│   ├── fs-ops/             # 文件系统操作
│   ├── credential/         # 凭据存储
│   ├── ci-status/          # CI 状态
│   ├── outline/            # 大纲解析
│   ├── adl-logging/        # 日志系统
│   └── migration/          # 数据库迁移
├── src-tauri/              # Tauri 入口
│   ├── src/lib.rs          # 应用入口
│   ├── src/commands/       # 33 命令模块
│   ├── src/events/         # 事件定义
│   └── src/capabilities/   # 权限能力
├── frontend/               # React 前端
│   └── src/
│       ├── app/            # 应用主体
│       │   ├── features/  # 26 功能域
│       │   ├── components/ # 通用组件
│       │   ├── stores/    # Zustand 状态
│       │   ├── hooks/     # 自定义 Hook
│       │   ├── regions/   # 布局区域
│       │   ├── i18n/      # 国际化
│       │   └── App.tsx    # 根组件
│       ├── shared/        # 共享类型与 IPC
│       ├── design-system/ # 设计系统
│       ├── styles/        # CSS 样式
│       └── preview-bridge/ # 浏览器桥接
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
│  ├─ Domain Crates: 12 领域服务               │
│  └─ Infrastructure: storage/logger/errors   │
└─────────────────────────────────────────────┘

双端架构:
  Tauri 模式  → Tauri Bridge → invoke → Rust Command
  浏览器模式  → Preview Bridge → HTTP Polling → Vite 中间件
  Mock 模式   → Mock Bridge → 纯内存模拟
```

## 关键设计理念

1. **Zustand 切片合并**：功能拆分为 24 切片 + 12 action 模块，通过 `slicedStore.ts` 合并导出
2. **IPC 三桥接一致性**：Tauri/preview/mock 三桥接层必须保持接口一致
3. **Crate 分离与依赖倒置**：每个 crate 有明确边界，通过 traits 解耦
4. **Rust 错误统一**：通过 `AppError` 枚举跨 crate 传播，`captureTypedError` 前端消费
5. **设计 Token 驱动**：`tokens.ts` 定义完整设计 Token，`theme.ts` 驱动主题切换
6. **i18n 全覆盖**：所有 UI 文本使用 i18n key，中英双语各 26 域文件
