# AI 数字生命 - 项目治理规则

## 项目定位

本仓库是 AI 数字生命项目的规划与治理工作区。根目录以文档和架构设计为主，`ai-digital-life/` 是基于 **Rust + Tauri 2.x** 的桌面应用实现工作区。

## 双根结构

| 目录 | 职责 |
|------|------|
| 仓库根目录 | 规划与治理：`AGENTS.md`、`docs/`、`.agents/` |
| `ai-digital-life/` | 实现工作区：Rust + Tauri 桌面应用 + WebView 前端 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2.x |
| 后端 | Rust (stable) + tokio + rusqlite + serde + tracing |
| 前端 | React 19 + Vite + Zustand + TypeScript + xterm.js |
| 桥接 | `#[tauri::command]` + `@tauri-apps/api` |
| 持久化 | SQLite（`rusqlite`，后端） |

## 当前阶段

| Phase | 状态 | 范围 |
|-------|------|------|
| Phase 0 | ✅ 已完成 | 架构底座、桌面壳层、安全边界、基础设施 |
| Phase 1 | 🚧 进行中 | 交互式 MVP、模型接入、上下文、变更预览 |
| Phase 2 | ✅ 已完成切片 | 单 Agent 薄切片、终端流式输出 |

## 已实现功能

- 桌面壳（Tauri Backend / WebView）+ SQLite 状态持久化
- 工作区与对话管理 + 补丁预览/应用/回滚
- 模型网关（含流式与取消）+ 命令治理与终端流式输出
- CodeMirror 编辑器系统 + xterm.js 交互式终端（多会话 PTY）
- Zustand 切片模式（12 切片 + 11 action 模块）+ 模块化分层（features/ + regions/）
- 内置浏览器（Tauri WebView / iframe 双模式 + 标签树形目录三分类）
- 统一 IPC 错误通道（`IpcErrorCode` → `AppError` → `IpcResult`）
- CSS 设计 Token 亮暗主题 + 自定义 Tooltip 组件

## 重构历史

共完成 **29 轮**迭代重构，全部详情见 [REFACTORING_PROGRESS_REPORT.md](./docs/重构洞察/REFACTORING_PROGRESS_REPORT.md)。

| 轮次 | 日期 | 关键成果 |
|------|------|----------|
| 第一~六轮 | 2026-05-20~22 | Zustand 切片合并、CSS Token、CodeMirror bug 修复、Store/桥接模块化 |
| 第七~十轮 | 2026-05-23~24 | 全面重构：25+26+22+11 项修复、死 CSS 删除、文件拆分、OnceLock 缓存 |
| 第十一~十六轮 | 2026-05-25~26 | 组件架构拆分、终端功能修复、树状视觉优化、面板精细化 |
| 第十七~二十轮 | 2026-05-28~31 | Rust crate 重组 17→19、DB 连接池、代码清理、缓存添加、Store 增强 |
| 第二十一轮 | 2026-05-31 | 浏览器子目录 parentId 传递断链修复 |
| 第二十二轮 | 2026-06-01 | 文档大纲连接竖线对齐修复 |
| **第二十三轮** | **2026-06-01** | **全面重构：死代码删除、i18n/icons 拆分、类型解耦、as any 消除、Mutex 降级、audit 批量写入、React.memo、滚动条修复** |
| **第二十四轮** | **2026-06-01** | **浏览器标签树三分类增强 + 全面板计数右偏移统一 + CSS 清理** |
| **第二十五轮** | **2026-06-01** | **重构洞察执行：消除重复、TTL 缓存优化、代码质量提升** |
| **第二十六轮** | **2026-06-01** | **重构洞察全量执行：31/32 项已落地（Mutex→RwLock 降级、ErrorCode 枚举化、Agent 流水线提取、change-engine 拆分、SQL 事务保护、级联删除、workspace_cmd! 宏、AuditBatchEntry 结构化、FileTree 迁移、SessionList React.memo、OutlineTree content-visibility、CSS 命名体系统一为 bg-*、fetch 请求去重、bootstrap 并行化、selectors 优化）** |
| **第二十七轮** | **2026-06-02** | **浏览器标签树计数优化：语义统一（category=顶级目录数、顶级目录=直接子标签数、子目录=直接子节点数、URL 标签/历史条目=不显示）、子目录计数右对齐精确修复（4px 偏差→0）、`resolveChildCount` 纯函数提取（3 个新单测）、长名省略号截断恢复** |
| **第二十八轮** | **2026-06-02** | **四位一体治理：① `openTabCount` 模式感知化（4 模式 × 11 单测）；② 工作区删除级联清理（`purge_workspace` 事务 + 18 张子表 + localStorage 残留，4 个 Rust 集成测试 + 8 个前端单测）；③ `browserCategoryExpanded` + `workspacesExpanded` 死状态清理；④ i18n P0（store 层 9 处硬编码 + 10 个新键 + `formatNewFolderName` / `getAppCopy` 工具）+ P1（3 处 emoji → SVG，3 处 native title 删除）** |
| **第二十九轮** | **2026-06-02** | **浏览器面板计数重叠修复 + 溢出裁切体系统一：子目录`:focus-within`计数消失修复、子目录计数从`position: absolute`回退到flex流（消除4px偏差）、顶级目录名称追加`overflow:hidden`防止文本溢出、基类`text-overflow:ellipsis→clip`统一** |

## AI 代理开发规则

项目规则文件位于 `.agents/rules/`，AI 代理在操作本项目时必须遵守：
- [project-overview.md](.agents/rules/project-overview.md) — 项目总览、双根结构
- [phase-boundary.md](.agents/rules/phase-boundary.md) — 阶段边界与排除项
- [mandatory-testing.md](.agents/rules/mandatory-testing.md) — 强制红绿测试
- [quality-gates.md](.agents/rules/quality-gates.md) — 质量门禁
- [error-handling.md](.agents/rules/error-handling.md) — 错误处理规范
- [dev-rules.md](.agents/rules/dev-rules.md) — 交互与执行规则（询问卡片、终端命令、代码修改）

## 禁止项

- WebView 直接触达系统能力（必须通过 Tauri Command）
- 低层 crate 依赖高层 crate
- 凭据写入普通配置或日志（必须使用 OS keyring）
- 使用原生 HTML `title` 属性（必须使用 `TooltipSimple` 组件）
- UI/UX 或功能变更后跳过红绿测试
- 在 capability 文件中使用 `"all"` / `"**"` 通配权限
- 功能或显示效果仅在 Tauri 或浏览器单一模式下可用（必须双端一致）

## 双端一致性

所有功能必须在 **Tauri 桌面应用** 和 **浏览器模式** 中保持一致。

| 机制 | 说明 |
|------|------|
| `DigitalLifeBridge` | 统一 IPC 抽象层（Tauri ↔ 浏览器） |
| `isTauriShell()` | 运行时环境检测 |
| `data-shell="tauri|browser"` | HTML 根元素属性，CSS 适配 |

新增 IPC 方法必须同步实现 `tauri-bridge.ts` / `preview-bridge/` / `mock-bridge.ts`。

## 真源定位

| 内容 | 真源位置 |
|------|----------|
| 项目治理规则 | `AGENTS.md`（本项目）、`.agents/rules/` |
| 实现侧治理 | `ai-digital-life/AGENTS.md` |
| 架构文档 | `ai-digital-life/docs/architecture/` |
| 设计系统 | `ai-digital-life/docs/design-system/` |
| 开发约束 | `docs/development/` |
| IPC 契约 | `ai-digital-life/frontend/src/shared/ipc.ts` |
| UI 测试 | `UIOperationManual/` |
| 重构进度 | `docs/重构洞察/REFACTORING_PROGRESS_REPORT.md` |

## 相关文档

- [ai-digital-life/AGENTS.md](ai-digital-life/AGENTS.md) — 实现工作区治理
- [FUTURE-ROADMAP.md](./FUTURE-ROADMAP.md) — 远期规划
- [docs/development/project-engineering-constraints.md](./docs/development/project-engineering-constraints.md) — 工程约束
- [docs/重构洞察/REFACTORING_PROGRESS_REPORT.md](./docs/重构洞察/REFACTORING_PROGRESS_REPORT.md) — 29 轮重构完整记录
