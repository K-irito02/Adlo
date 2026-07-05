# AI Digital Life - 实现工作区规则

本目录是 `AI Digital Life` 的真实实现工作区，基于 **Rust + Tauri 2.x**。

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Rust stable + Tauri 2.x + tokio + rusqlite + serde + tracing |
| 前端 | React 19 + Vite + Zustand + TypeScript + CodeMirror 6 + xterm.js |
| 桥接 | `#[tauri::command]` + `@tauri-apps/api` |
| 打包 | `cargo tauri build` |
| 包管理 | pnpm（前端）/ Cargo（Rust） |
| Rust 质量 | `cargo clippy` + `cargo fmt` + `rustfmt.toml` + `clippy.toml` |
| 前端质量 | ESLint v9（flat config）+ Prettier + TypeScript-ESLint + React Hooks plugin |
| Rust Lint | `cargo clippy --workspace --all-targets` |
| 前端 Lint | `cd frontend && npx eslint . && npx tsc --noEmit` |
| CI/CD | GitHub Actions（`.github/workflows/quality-gates.yml`） |
| 凭据存储 | `crates/credential/`（keyring + 加密文件降级） |

## 当前阶段

**Phase 0 底座** + **Phase 2 完成 — 全功能交互式 MVP**：

- Tauri 桌面壳、SQLite 状态
- 工作区与对话、补丁预览/应用/回滚
- 模型网关（含流式与取消）
- 命令治理与终端流式输出
- xterm.js 交互式终端（多会话 PTY，支持 CMD / PowerShell / Bash）
- CodeMirror 编辑器系统 + 文件预览 + 差异查看器（inline/side-by-side）
- 内置浏览器（Tauri WebView / iframe 双模式 + 新建标签对话框 + 收藏标签目录选择对话框 + 工作区顶级目录书签 + 4模式导航栏（open/tabs/list/search）+ SafeIframe 嵌入检查 + checkEmbed LRU 缓存 + Guard Effect 双路径验证 + 导航模式切换：就地导航/新建标签 + @radix-ui/react-switch + motion 动效 + 已打开标签过滤（filterTabIds）+ 多 iframe 状态保持（activatedTabIdsRef）+ 悬停关闭按钮（danger-hover）+ Flat 模式 ::after 渐变蒙版 + text-overflow: clip）
- Zustand 切片模式（23 切片 + 12 action 模块）+ 模块化分层（features/ + regions/）
- CSS 设计 Token 亮暗主题 + 自定义 Tooltip + 自定义滚动条
- i18n 国际化（13 领域 / 936 keys，TCopyContext + useTCopy 上下文驱动，TypeScript satisfies 类型安全）

### Phase 2 完整功能（18 项缺失能力）

| 子阶段 | 新增能力 |
|--------|---------|
| **2-A** | 多 Agent 系统（Agent 注册表 + 路由）、Sub-agent / Task 工具、Plan Mode |
| **2-B** | MCP 完整集成（Stdio/SSE/StreamableHTTP + OAuth）、多 LLM Provider（OpenAI/Anthropic/Google/Ollama/OpenRouter）、Provider-specific Prompts |
| **2-C** | Token-aware Compaction（PRUNE_MINIMUM=20000）、Snapshot/Revert（message-level git 快照）、WebFetch / WebSearch 工具 |
| **2-D** | 自定义命令配置（模板变量 $1/$ARGUMENTS/$WORKSPACE）、权限系统升级为 Ruleset（Allow/Ask/Deny + 通配匹配 + doom_loop 检测） |
| **2-E** | Session Fork、LSP 集成（rust-analyzer/ts-server/pylsp/gopls）、Plugin 系统（trait + hooks + registry）、Reference 系统、自定义 Agent 配置、Hot Reloadable Config、Durable Session Execution、ACP/HTTP API/CodeMode 预留接口 |

> 430+ Rust 测试、326 前端测试，clippy 与 lint 零警告。

### 重构历史

共完成 **91 轮**迭代重构，完整记录见 [根目录 AGENTS.md](../AGENTS.md#重构历史)。

## 安全边界

| 层 | 允许 | 禁止 |
|----|------|------|
| Rust Backend | 文件系统、SQLite、模型请求、凭据 | 直接操作 DOM |
| WebView | UI 渲染、状态编排、订阅事件 | 直接访问系统能力、密钥、原始 SQL |

跨进程能力通过 `#[tauri::command]` + `capabilities/*.json` 白名单暴露。

## 双端一致性

应用同时运行于 Tauri 桌面和浏览器模式，所有功能必须双端可用。双端一致性规范见 [根目录 AGENTS.md](../AGENTS.md#双端一致性)。

## 命令规范

- 新 Tauri Command 必须类型化（`serde`）、登记到 `capabilities/*.json`
- 返回 `Result<T, AppError>` 结构化错误
- SQLite schema 变更必须附带迁移脚本

## 设计系统约束

| 约束 | 规则 |
|------|------|
| 颜色 | 必须使用 CSS 自定义属性 `var(--…)` |
| 图标 | SVG 格式，继承 `currentColor`，禁止 emoji。动画反馈场景可例外使用 `lucide-animated`（MIT 许可）|
| Tooltip | 禁止原生 `title`，必须使用 `TooltipSimple` |
| 窗口 | 最小宽度 640px |

详见 [docs/design-system/](../docs/design-system/) 和 [UI 模式速查](../.agents/rules/ui-patterns.md)

## Stores 架构（Zustand 切片合并模式）

```
app/stores/
├── slicedStore.ts               # 切片合并 Store（真源）
├── StoreState.ts                # 完整类型接口
├── types.ts                     # 共享类型（ToolId/ChatMode/TerminalProfile/ContextChip）
├── shared.ts                    # 共享工具 barrel（re-export）
├── storageHelpers.ts            # localStorage 读写工具
├── cacheHelpers.ts              # 缓存系统（TTL/LRU）、请求序列
├── selectors.ts                 # 性能选择器（useShallow）
├── slices/                      # 23 个独立切片（含 5 浏览器 + 3 GitHub 子切片）
│   ├── uiSlice.ts / workspaceSlice.ts / gitSlice.ts
│   ├── sessionSlice.ts / editorSlice.ts / patchSlice.ts
│   ├── searchSlice.ts / diagnosticSlice.ts / taskSlice.ts
│   ├── commandSlice.ts / clipboardSlice.ts / terminalSlice.ts
│   ├── ciSlice.ts                   # CI 状态（轮询、快照、Section 切换）
│   ├── communicateSlice.ts          # 通信面板共享状态
│   ├── githubSlice.ts               # GitHub 面板核心
│   ├── githubRepoSlice.ts           # GitHub 仓库配置（Token、CRUD、Pin/Unpin）
│   ├── githubTreeSlice.ts           # GitHub 树形目录
│   ├── browserSlice.ts              # 浏览器核心（导航布局、持久化、跨领域）
│   ├── browserTabsSlice.ts          # 浏览器标签页
│   ├── browserBookmarkSlice.ts      # 浏览器书签
│   ├── browserHistorySlice.ts       # 浏览器历史记录
│   ├── browserFoldersSlice.ts       # 浏览器标签文件夹
│   └── browserLandingSlice.ts       # 浏览器着陆页（快捷站点、端口、背景）
└── actions/                     # 12 个跨切片 action 模块
    ├── workspaceActions.ts（448 行） / sessionActions.ts / editorActions.ts
    ├── patchActions.ts / gitActions.ts / fetchActions.ts
    ├── streamActions.ts / generalActions.ts / searchActions.ts
    ├── taskActions.ts / commandActions.ts / browserCleanupActions.ts（112 行）
```

### 关键文件

| 文件 | 职责 |
|------|------|
| `frontend/src/app/stores/slicedStore.ts` | 切片合并 Store（真源） |
| `frontend/src/app/stores/StoreState.ts` | 完整类型接口 |
| `frontend/src/app/stores/slices/browserFoldersSlice.ts` | `BookmarkTabItem`（`TabFolderState.tabs` 元素类型：`{ tabId, url, title }`） |
| `frontend/src/app/stores/selectors.ts` | 性能选择器（useShallow） |
| `frontend/src/shared/preferencesMerger.ts` | 模型配置合并共享函数（桥接层使用） |

## 文档入口

- [README.md](./README.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [docs/architecture/system-overview.md](../docs/architecture/system-overview.md)
- [docs/design-system/README.md](../docs/design-system/README.md)

## 调试工具

| 功能 | 说明 |
|------|------|
| 日志收起器 | `frontend/src/app/utils/debugLogCollector.ts`，拦截所有 console 输出，自动收起存储 |
| 复制按钮 | 页面右上角可拖拽"复制调试日志"按钮 |
| 自动写入 | Tauri 模式 `debug-logs.txt`，浏览器模式 `debug-logs-browser.txt`（均写入项目根目录） |
| 后端命令 | `src-tauri/src/commands/app.rs` → `write_debug_logs_to_project` |
| 浏览器后端 | `frontend/dev/previewWorkspaceService.ts` → `writeDebugLogs` |

**优先级**：调试日志收起器是最高优先级的调试手段，遇到 UI/交互问题时优先使用。详见 [仓库根 AGENTS.md](../AGENTS.md#调试工具)。

## 问题排查规范

排查问题时**先定位根本原因**，不急于添加预防措施/防御性代码/解决方案。无法定位根因时，使用调试日志收起器（最高优先级）、复制调试日志按钮等调试手段，**禁止凭空猜测**。详见 [仓库根 AGENTS.md](../AGENTS.md#问题排查规范) 和 [dev-rules.md](../.agents/rules/dev-rules.md#问题排查规范)。

## 未发布阶段禁止兼容性代码

产品未发布前，禁止添加数据格式兼容/旧版本迁移代码。任何向后兼容重导出或数据迁移逻辑均须移除。如有发布后需要兼容的情况，必须先与用户确认。

## 相关文件

- [仓库根 AGENTS.md](../AGENTS.md) — 项目治理规则（含 Superpowers 技能系统、参考项目 OpenCode）
- [技能系统入口](../.opencode/skills/using-superpowers/SKILL.md) — using-superpowers 入口技能
- [FUTURE-ROADMAP.md](../FUTURE-ROADMAP.md) — 远期规划
- [references/opencode/](../references/opencode/) — 参考项目 OpenCode 本地源码（MIT 许可）
- [docs/analysis/opencode/](../docs/analysis/opencode/) — OpenCode 深度分析文档

## 磁盘空间管理

### target/debug 无限增长

Rust 增量编译会在 `target/debug/incremental/` 为每次编译创建新会话且**永不自动清理**。经过数百次开发编译后可达 20~40 GB。

**预防措施：** 在 `ai-digital-life/` 下运行：

```powershell
# 保留 7 天内增量会话，删除更早的（安全，不触发重新编译）
.cargo\clean-incremental.ps1

# 或完全清除所有构建产物（下次编译需要完整重建）
cargo clean
```

相关文件：`.cargo/config.toml`（Cargo 别名 `cargo rebuild` = `cargo clean && cargo build`）
