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
| CI/CD | GitHub Actions（`../.github/workflows/quality-gates.yml`，Windows-only） |
| 凭据存储 | `crates/credential/`（keyring + 加密文件降级） |

### 存储路径解析（`adl-kernel::storage`）

- 所有应用数据路径由 `adl-kernel::storage` 的 `StoragePaths` 统一解析；locator 文件为 `<dirs::config_dir()>/ai-digital-life/storage-locator.json`（Plan A 阶段只读，缺失时回退默认；Plan B 起由启动期迁移写入指针切换结果），默认统一根 = `app_data_dir()`。
- 日志目录：debug（dev）构建写仓库根 `.adl-logs`，release 构建写 `<root>/logs`。
- **已知行为修正**：补丁快照路径由硬编码（旧 `dirs::data_dir()/ai-digital-life/snapshot`）收敛到 adl-server 的 `storage.paths().snapshot_dir`；遗留目录下的旧快照不自动迁移，需手动移动（Plan B 只处理用户发起的路径变更）。

#### 启动期存储迁移（Plan B）

- **时机**：待迁移登记在 locator 的 `pendingMigration` 中（由设置页写入），真正的迁移在**下次进程启动、且任何 DB / 日志句柄打开之前**执行（壳层 `setup::run_startup_migration` 与 adl-server `engine::run_startup_migration` 均调用 `adl-kernel::storage::apply_pending`），因此不存在持有 SQLite 句柄时搬文件的问题；不做运行中热迁移。
- **成功**：按分类复制 → 校验（尺寸一致 + SQLite `PRAGMA quick_check`）→ **切换 locator 指针并落盘**（清理之前的最后一步）→ 清理旧源。清理只删除自有文件（base-aware 白名单），**外部文件永不删除、其所在目录保留**并记入 `lastReport.keptDirs`；`pendingMigration` 清空、`lastReport` 记为成功。`retainSource: true` 时跳过清理。
- **失败**：不切换指针、不删除源文件（旧路径数据完好），`pendingMigration.failed = true` 并记录 `error`，应用仍以旧路径正常启动；`lastReport` 记为失败，**不自动重试**，等待用户在设置中重试或取消。失败时会 best-effort 删除本次新建的目标文件。
- **幂等**：目标已存在且大小一致的副本会被跳过，中断后重跑安全。
- **locator 落点覆盖**：`locator_path()` 支持环境变量 `ADL_STORAGE_LOCATOR_PATH`（未设置时回退 `<dirs::config_dir()>/ai-digital-life/storage-locator.json`），供测试/开发把指针落点重定向到临时文件，避免读写真实 `%APPDATA%` locator。

## 当前阶段

**Phase 0 底座**：

- Tauri 桌面壳、SQLite 状态
- 工作区管理、补丁预览/应用/回滚
- xterm.js 交互式终端（多会话 PTY，支持 CMD / PowerShell / Bash）
- CodeMirror 编辑器系统 + 文件预览 + 差异查看器（inline/side-by-side）
- 内置浏览器（Tauri WebView / iframe 双模式 + 新建标签对话框 + 收藏标签目录选择对话框 + 工作区顶级目录书签 + 4模式导航栏（open/tabs/list/search）+ SafeIframe 嵌入检查 + checkEmbed LRU 缓存 + Guard Effect 双路径验证 + 导航模式切换：就地导航/新建标签 + @radix-ui/react-switch + motion 动效 + 已打开标签过滤（filterTabIds）+ 多 iframe 状态保持（activatedTabIdsRef）+ 悬停关闭按钮（danger-hover）+ Flat 模式 ::after 渐变蒙版 + text-overflow: clip + 网站元数据持久化缓存（favicon data-URI + 标题，三层：Rust SQLite `site_meta_cache.rs` / preview JSON `.adl-cache/` / 前端 `siteMetaCache.ts`，预载门控 + 成功才写 + 引用计数删除）+ 标签加载状态（favicon 加载中 spinner + 标题未结算时"新建标签页"扫光动效，`titleResolved` 状态机 + `isRealTitle` 统一判定）+ 跨域重定向 favicon/标题兜底（方案 A 历史 URL 回写 `browserUpdateHistoryUrl` + 方案 B 会话级 `redirectMap`，`expectedNavigationUrlRef={url,at,tabId}` 显式导航检测 + 10s 新鲜度 + 发起 tab 绑定，参考 Chrome/Edge 重定向链消化语义 + Chromium `page_url_type`））
- Zustand 切片模式（35 切片 + 31 action 模块）+ 模块化分层（features/ + regions/）
- CSS 设计 Token 亮暗主题 + 自定义 Tooltip + 自定义滚动条
- i18n 国际化（13 领域 / 936 keys，TCopyContext + useTCopy 上下文驱动，TypeScript satisfies 类型安全）

> 截至 2026-09-06：工具链 rustc 1.97.1，629 Rust 测试通过、1753 前端测试通过。最新计数请运行 `cargo test --workspace` 与 `pnpm --dir frontend run test`。
>
> 质量检查：`cargo clippy --workspace --all-targets -- -D warnings`（0 警告）、`pnpm --dir frontend run lint`（0 errors，若干 pre-existing warnings）。

### 重构历史

共完成 **93 轮**迭代重构，完整记录见 [根目录 AGENTS.md](../AGENTS.md#重构历史)。

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
| Tooltip | 自定义 Tooltip 组件与原生 `title` 均可使用，具体方案开发时由用户决策 |
| 窗口 | 最小宽度 640px |

详见 [docs/design-system/](../docs/design-system/)

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
├── slices/                      # 35 个独立切片（含 5 浏览器 + 3 GitHub + 7 Phase 2 增强切片）
│   ├── uiSlice.ts / workspaceSlice.ts / gitSlice.ts
│   ├── editorSlice.ts / patchSlice.ts
│   ├── searchSlice.ts / diagnosticSlice.ts
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
└── actions/                     # 31 个跨切片 action 模块
    ├── workspaceActions.ts（448 行） / editorActions.ts
    ├── patchActions.ts / gitActions.ts / fetchActions.ts
    ├── streamActions.ts / generalActions.ts / searchActions.ts
    ├── commandActions.ts / browserCleanupActions.ts（112 行）
```

### 关键文件

| 文件 | 职责 |
|------|------|
| `frontend/src/app/stores/slicedStore.ts` | 切片合并 Store（真源） |
| `frontend/src/app/stores/StoreState.ts` | 完整类型接口 |
| `frontend/src/app/stores/slices/browserFoldersSlice.ts` | `BookmarkTabItem`（`TabFolderState.tabs` 元素类型：`{ tabId, url, title }`） |
| `frontend/src/app/stores/selectors.ts` | 性能选择器（useShallow） |

## 文档入口

- [README.md](./README.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [docs/architecture/core/system-overview.md](../docs/architecture/core/system-overview.md)
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

排查问题时**先定位根本原因**，不急于添加预防措施/防御性代码/解决方案。无法定位根因时，使用调试日志收起器（最高优先级）、复制调试日志按钮等调试手段，**禁止凭空猜测**。详见 [仓库根 AGENTS.md](../AGENTS.md#问题排查规范)。

## 未发布阶段禁止兼容性代码

产品未发布前，禁止添加数据格式兼容/旧版本迁移代码。任何向后兼容重导出或数据迁移逻辑均须移除。如有发布后需要兼容的情况，必须先与用户确认。

## 相关文件

- [仓库根 AGENTS.md](../AGENTS.md) — 项目治理规则
- [FUTURE-ROADMAP.md](../FUTURE-ROADMAP.md) — 远期规划
- [references/opencode/](../references/opencode/) — 参考项目 OpenCode 本地源码（MIT 许可）
- [references/pi/](../references/pi/) — 参考项目 Pi 本地源码（MIT 许可）
- [docs/analysis/opencode/](../docs/analysis/opencode/) — OpenCode 源码地图
- [docs/analysis/ai-digital-life/](../docs/analysis/ai-digital-life/) — ADL 源码地图（本项目的渐进式索引）

## 磁盘空间管理

### target/debug 成因与现状

`target/debug/deps` 曾达 **~126 GB**：`.pdb`（Windows 调试符号）97 GB 为主力 —— `[profile.dev]` 默认 `debug=2`（全量类型调试信息）为每个 exe/测试二进制生成约 300MB PDB。已通过 `.cargo/config.toml` 治理：

- 第三方依赖 `debug=1`（行号级）+ `opt-level=1`
- 自己 26 个包 `[profile.dev.package.X]` 白名单保留 `debug=2`（可断点查变量类型）
- 重开增量编译（`incremental=false` 已移除，ICE 于 1.97.1 修复）

### 清理策略（空间阈值触发全量清理）

| 条件 | 阈值 | 说明 |
|------|------|------|
| 空间 | `target/debug` > 30 GB | 超过即执行 `cargo clean` 全量删除 |

不再按时间窗口判断；超过 30 GB 直接全量清理。

> 所有删除均为**永久删除**：`cargo clean`（及 `clean-target.ps1`）直接物理删除构建产物，**不进入回收站/垃圾箱**，删除后无需清空回收站。

### 预防措施

```powershell
# 干跑预览（不实际删除）
powershell -File .cargo\clean-target.ps1 -WhatIf

# 执行清理（target/debug 超 30 GB 时全量 cargo clean）
powershell -File .cargo\clean-target.ps1
```

相关文件：`.cargo/config.toml`（alias `rebuild` = `clean && build`、`prune` = `clean`）。
