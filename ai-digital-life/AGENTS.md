# AI Digital Life - 实现工作区规则

本目录是 `AI Digital Life` 的真实实现工作区，基于 **Rust + Tauri 2.x**。

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Rust stable + Tauri 2.x + tokio + rusqlite + serde + tracing |
| 前端 | React 19 + Vite + Zustand + TypeScript + CodeMirror 6 + xterm.js |
| 桥接 | `#[tauri::command]` + `@tauri-apps/api` |
| 打包 | `cargo tauri build` |
| 包管理 | npm（前端）/ Cargo（Rust） |

## 当前阶段

**Phase 0 底座** + **Phase 2 单 Agent 薄切片**：

- Tauri 桌面壳、SQLite 状态
- 工作区与对话、补丁预览/应用/回滚
- 模型网关（含流式与取消）
- 命令治理与终端流式输出
- xterm.js 交互式终端（多会话 PTY，支持 CMD / PowerShell / Bash）
- CodeMirror 编辑器系统 + 文件预览 + 差异查看器（inline/side-by-side）
- 内置浏览器（Tauri WebView / iframe 双模式）
- Zustand 切片模式（12 切片 + 8 actions）+ 模块化分层（features/ + regions/）
- CSS 设计 Token 亮暗主题 + 自定义 Tooltip + 自定义滚动条
- i18n 国际化（10 领域 / 504 keys，TypeScript satisfies 类型安全）

### 重构历史

共完成 **23 轮**迭代重构，全部详情见 [REFACTORING_PROGRESS_REPORT.md](../docs/重构洞察/REFACTORING_PROGRESS_REPORT.md)。

| 轮次 | 日期 | 关键成果 |
|------|------|----------|
| 第一~六轮 | 2026-05-20~22 | Zustand 切片合并、CSS Token、CodeMirror bug 修复、Store/桥接模块化 |
| 第七~十轮 | 2026-05-23~24 | 全面重构：25+26+22+11 项修复、死 CSS 删除、文件拆分、OnceLock 缓存 |
| 第十一~十六轮 | 2026-05-25~26 | 组件架构拆分、终端功能修复、树状视觉优化、面板精细化 |
| 第十七~二十轮 | 2026-05-28~31 | Rust crate 重组 17→19、DB 连接池、代码清理、缓存添加、Store 增强 |
| 第二十一轮 | 2026-05-31 | 浏览器子目录 parentId 传递断链修复 |
| 第二十二轮 | 2026-06-01 | 文档大纲连接竖线对齐修复 |
| **第二十三轮** | **2026-06-01** | **全面重构：死代码删除、i18n/icons 拆分、类型解耦、as any 消除、Mutex 降级、audit 批量写入、React.memo、滚动条修复** |

## 安全边界

| 层 | 允许 | 禁止 |
|----|------|------|
| Rust Backend | 文件系统、SQLite、模型请求、凭据 | 直接操作 DOM |
| WebView | UI 渲染、状态编排、订阅事件 | 直接访问系统能力、密钥、原始 SQL |

跨进程能力通过 `#[tauri::command]` + `capabilities/*.json` 白名单暴露。

## 双端一致性

应用同时运行于 Tauri 桌面和浏览器模式，所有功能必须双端可用。

| 检测方式 | 说明 |
|----------|------|
| `isTauriShell()` | 运行时环境检测 |
| `data-shell="tauri\|browser"` | HTML 根元素属性，CSS 适配用 |

新增 IPC 方法时，必须同步实现：
- `tauri-bridge.ts`（Tauri 模式）
- `preview-bridge/`（浏览器模式，Vite Preview API）
- `mock-bridge.ts`（纯内存回退）

## 命令规范

- 新 Tauri Command 必须类型化（`serde`）、登记到 `capabilities/*.json`
- 返回 `Result<T, AppError>` 结构化错误
- SQLite schema 变更必须附带迁移脚本

## 设计系统约束

| 约束 | 规则 |
|------|------|
| 颜色 | 必须使用 CSS 自定义属性 `var(--…)` |
| 图标 | SVG 格式，继承 `currentColor`，禁止 emoji |
| Tooltip | 禁止原生 `title`，必须使用 `TooltipSimple` |
| 窗口 | 最小宽度 640px |

详见 [docs/design-system/](../docs/design-system/)

## Stores 架构（Zustand 切片合并模式）

```
app/stores/
├── slicedStore.ts               # 切片合并 Store（真源）
├── StoreState.ts                # 完整类型接口
├── types.ts                     # 共享类型（ToolId/ChatMode/TerminalProfile/ContextChip）
├── shared.ts                    # 共享工具函数
├── selectors.ts                 # 性能选择器（useShallow）
├── slices/                      # 12 个独立切片
│   ├── uiSlice.ts / workspaceSlice.ts / gitSlice.ts
│   ├── sessionSlice.ts / editorSlice.ts / patchSlice.ts
│   ├── searchSlice.ts / diagnosticSlice.ts / taskSlice.ts
│   ├── commandSlice.ts / clipboardSlice.ts / terminalSlice.ts
└── actions/                     # 8 个跨切片 action 模块
    ├── workspaceActions.ts / sessionActions.ts / editorActions.ts
    ├── patchActions.ts / gitActions.ts / fetchActions.ts
    ├── streamActions.ts / generalActions.ts
```

### 关键文件

| 文件 | 职责 |
|------|------|
| `frontend/src/app/stores/slicedStore.ts` | 切片合并 Store（真源） |
| `frontend/src/app/stores/StoreState.ts` | 完整类型接口 |
| `frontend/src/app/stores/selectors.ts` | 性能选择器（useShallow） |
| `frontend/src/utils/preferencesMerger.ts` | 模型配置合并共享函数 |

## 文档入口

- [README.md](./README.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [docs/architecture/system-overview.md](../docs/architecture/system-overview.md)
- [docs/design-system/README.md](../docs/design-system/README.md)

## 相关文件

- [仓库根 AGENTS.md](../AGENTS.md) — 项目治理规则
- [FUTURE-ROADMAP.md](../FUTURE-ROADMAP.md) — 远期规划
