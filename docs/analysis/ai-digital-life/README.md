# AI Digital Life 源码地图 — 导航入口

> 源码路径：`ai-digital-life/`
> 版本：0.1.0 | 许可：MIT
> 前端：React 19 + Vite + TypeScript | 后端：Rust + Tauri 2.x
>
> **快照说明**：本目录为实现快照（只读索引），数字可能滞后；当前准确计数见 [ai-digital-life/AGENTS.md](../../../ai-digital-life/AGENTS.md)（32 切片 + 18 action 模块），规范约束见 `.agents/rules/`。

## 使用指南

本目录是 AI Digital Life 源码的**结构化索引**，按渐进式披露设计：

| 层级 | 文件 | 何时阅读 |
|------|------|----------|
| **L0 快查** | [00-quick-reference.md](./00-quick-reference.md) | 需要快速定位某个功能的源文件路径 |
| **L1 总览** | [01-project-overview.md](./01-project-overview.md) | 了解项目定位、技术栈、规模快照 |
| **L1 架构** | [02-architecture.md](./02-architecture.md) | 理解双端架构、Crate 依赖、设计模式 |
| **L1 包索引** | [03-package-index.md](./03-package-index.md) | 查阅任一个 crate/包/目录的职责 |
| **L2 功能** | [features/](./features/) | 深入某个具体功能的实现细节 |
| **L3 模式** | [patterns/](./patterns/) | 学习跨功能的编码模式和惯例 |

### 阅读策略

```
需要找某个文件/功能？   → 00-quick-reference.md（Ctrl+F 搜索关键词）
需要理解整体设计？     → 01 → 02 → 03（顺序阅读）
需要参考某个功能实现？  → README（本页）→ 定位到 features/ 对应文件
需要学习编码模式？     → patterns/
```

## 功能 → 文件快速映射

| 想看什么 | 去哪个文件 |
|----------|-----------|
| Rust 后端所有 Crate 详解 | [features/rust-crates.md](./features/rust-crates.md)（22 个，以源码为准） |
| 前端组件架构 | [features/frontend-structure.md](./features/frontend-structure.md) |
| dsh 宿主集成（进程托管/版本管理/宿主渲染） | 中心多标签宿主 + `crates/webapp-host`、`dsh-bundle`、`dsh-version` |
| 内置浏览器 WebView 管理 | [features/builtin-browser.md](./features/builtin-browser.md) |
| Zustand Store 架构 | [features/store-architecture.md](./features/store-architecture.md) |
| 终端系统（PTY + xterm.js） | [features/terminal-system.md](./features/terminal-system.md) |
| 工作区管理（多工作区 + Git） | [features/workspace-management.md](./features/workspace-management.md) |
| Diff 查看器与 Patch 系统 | [features/diff-viewer.md](./features/diff-viewer.md) |
| IPC 三桥接模式 | [features/ipc-bridge.md](./features/ipc-bridge.md)（Tauri/preview/mock + `shared/ipc/` 25 文件） |
| Rust 编码模式 | [patterns/rust-patterns.md](./patterns/rust-patterns.md) |
| React 编码模式 | [patterns/react-patterns.md](./patterns/react-patterns.md) |
| Zustand 状态管理模式 | [patterns/zustand-patterns.md](./patterns/zustand-patterns.md) |
| 测试模式 | [patterns/testing.md](./patterns/testing.md) |

## 关键路径速记

```
ADL 源码根: ai-digital-life/

Rust 后端:
  crates/           → 22 个独立 crate
  src-tauri/        → Tauri 入口 + 13 命令文件（12 领域 + mod.rs）
  Cargo.toml        → 工作区配置

前端:
  frontend/src/app/
    ├── features/   → 25 个功能域模块
    ├── components/ → 通用组件（settings/terminal/drag/HintCard/UnderlineTabs）
    ├── stores/     → Zustand（32 切片，见 slicedStore.ts）
    ├── hooks/      → 通用 Hook
    ├── i18n/       → 国际化（22 领域 × 中英）
    ├── regions/    → 布局区域（TitleBar/CenterPane/LeftSidebar/RightPanel）
    └── commands/   → 命令注册表（defaultCommands.ts）
  frontend/src/shared/ipc/ → 25 个 IPC 域接口文件
  frontend/src/design-system/ → 设计系统（tokens.ts 真源）
  frontend/src/styles/ → CSS 样式（tokens.css/themes.css + components/regions/ 分散文件）
  frontend/src/preview-bridge/ → 浏览器模式桥接（11 实现文件 + 入口 index.ts）
```
