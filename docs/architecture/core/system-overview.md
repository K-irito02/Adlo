# System Overview (Rust + Tauri)

> **范围**：范围边界以 `.agents/rules/phase-boundary.md` 与根 `AGENTS.md` 为准。

## Purpose

This codebase is the runnable **desktop host** on top of **Rust + Tauri 2.x**:

- Tauri 桌面壳、SQLite 状态
- 工作区管理、补丁预览/应用/回滚、快照
- xterm.js 交互式终端 + CodeMirror 编辑器 + 内置浏览器
- 存储治理（`adl-kernel::storage` 统一路径解析 + 启动期迁移 + 设置面板存储组）
- 系统能力（剪贴板历史、系统监视器、CI 状态、GitHub 面板、凭据存储）
- harness 宿主集成：进程托管与拉起（`crates/webapp-host`）、版本管理与系统版本检测/升级回退（`crates/harness-version`，安装包不预置版本）、下载源与镜像配置（`crates/download-source`）、终端 PATH 注入（`crates/pty`）、中心多标签宿主渲染（`CenterEntryPage`，`location='center'`）

## Implemented Surface

The Rust backend provides shared DTOs, SQLite-backed metadata tables, workspace scanning/search/outline, conversation and run persistence, governed command execution, approval records, checkpoint-backed PatchSet application/rollback, and dsh host integration, while keeping all filesystem, process, SQL, and secret access inside Rust:

- secure Tauri shell with CSP and capability allowlist
- typed `#[tauri::command]` bridge consumed via `@tauri-apps/api`
- recent workspace restore
- SQLite state persistence (`rusqlite`) with versioned migrations
- workspace indexing via `tokio` tasks (no separate Node worker)
- runtime language and theme preferences
- task / approval shell entry surfaces in the WebView frontend
- persisted workspace, session, task, approval, and audit metadata
- lightweight Git snapshot capture for workspace safety visibility
- startup recovery markers and migration diagnostics
- React + Zustand workspace shell hosted inside the Tauri WebView
- patch-set, file-patch, and hunk persistence in SQLite
- structured workspace `read_file` / `search` / `outline` Tauri commands
- patch-first preview, explicit hunk decision, apply, and rollback flows
- apply-after-validate loop with structured validation results and automatic rollback on failure
- `notify`-driven workspace file change events delivered via Tauri events
- governed terminal PTY commands with versioned terminal-stream events (Rust-side execution; WebView only subscribes)
- versioned `digital-life://run-activity` events for per-run transparency (persisted for replay)
- dsh host integration: process托管/版本管理/下载源 + center-tab host rendering; DSH and OpenCode CLI share one generic harness version card via per-tool adapters

## Runtime Path

1. The Tauri Rust process resolves the user data directory, records the runtime lifecycle marker, and initializes config, logging (`tracing`), and persisted state.
2. It evaluates version changes, prepares upgrade backups, and records migration diagnostics.
3. It runs the startup storage migration (`pendingMigration`, before any DB/log handle opens).
4. It creates a Tauri window with explicit CSP and capability bindings.
5. The WebView loads the React frontend, which talks to the backend exclusively through the typed bridge (`tauri-bridge/` in Tauri shell, `preview-bridge/` + adl-server in browser mode, `mock-bridge.ts` for tests).
6. The frontend exposes the home shell and the workspace shell implemented with `React + Zustand`.
7. The frontend can open a workspace, inspect file content, inspect outline/search results, and review a patch preview.
8. Patch application creates a checkpoint payload bundle before files are written, runs validation, rolls back on failure, and can generate a repair preview for a second pass.
9. File changes are observed through `notify`, and the frontend receives structured conflict notifications via Tauri events instead of polling.

## Run Modes

| 模式 | 命令（在 `adlo/` 执行） | 后端 |
|------|-----------------------------------|------|
| Tauri 桌面 | `pnpm run dev:tauri` | Rust + Tauri WebView2 |
| 浏览器预览 | `pnpm run dev:browser` | adl-server 真实后端（http 优先，可回退） |
| 双端同时 | `pnpm run dev:both` | 两者（一致性验证） |

## Validation Status

Quality gates see `.agents/rules/quality-gates.md` and `mandatory-testing.md`. They run **locally only** (no remote CI), scoped to the change by default: `pnpm --dir adlo/frontend check:changed` runs lint/format on changed files, type and contract invariants, and `vitest related` for affected tests. Full gates (`check:full`, `cargo test --workspace`) and Tauri packaging are executed only after explicit user approval.

Optional desktop smoke: `pnpm run e2e:build` then `pnpm run e2e` (WDIO + embedded WebDriver, real Tauri window, ~15s). It is opt-in, not part of `check:all`, and never replaces human visual verification — see skill `desktop-e2e-wdio`.

## Security Baseline

- explicit `app.security.csp` in `tauri.conf.json` (no empty CSP); packaged builds append nonce/hash to `style-src`, so `dangerousDisableAssetCspModification: ["style-src"]` is required for runtime `<style>` injection; `img-src` / `media-src` must include `blob:` (Office embedded media / object URLs); workspace WS and dev IPC need `connect-src` `ws:`/`wss:`; `script-src` includes `'wasm-unsafe-eval'` for starry-night WASM; `worker-src 'self'` (no blob workers)
- capability-based command allowlist via `src-tauri/capabilities/*.json` (`default.json` + `browser-remote.json`, no `"all"` / `"**"`)
- `withGlobalTauri` disabled
- no raw filesystem, process, or SQL access from the WebView
- shell/dialog plugins configured with strict scope
- secrets stored via the OS credential store (`crates/credential/`); never in config files or logs

## Persistence

All application data paths resolve through `adl-kernel::storage` (`StoragePaths`); the pointer file is `<config_dir>/adlo/storage-locator.json` (overridable via `ADL_STORAGE_LOCATOR_PATH` for dev/test — `locator_dir()` and everything derived from it, e.g. `credentials_dir`, then follows that file's directory so parallel dev instances stay isolated):

- locator `pendingMigration` executes at next process startup, before any DB/log handle opens (no hot migration); success switches the pointer then cleans owned files only (external files never deleted); failure keeps the old path and records the error without auto-retry
- settings panel storage group: unified-root vs per-category modes; 10 migratable paths + 1 settings-value path (`downloads_default`) + 6 non-movable items listed with reasons
- patch snapshot path converged to adl-server `storage.paths().snapshot_dir`
- debug builds log to `.adl-logs/` (repo root for shell/preview, `adlo/.adl-logs/` for adl-server); release builds log to `<data_root>/logs/`

SQLite stores schema version, workspaces, sessions, tasks, approvals, audit records, checkpoints, conversation data, patch sets/hunks/decisions, command execution/validation records, and run activity events. UI preferences (language `system` default with OS-following, theme mode, log level, etc.) persist via the same storage layer with localStorage cache on the frontend.

## 已实现能力清单（详细）

> 由 `adlo/AGENTS.md` 迁出（2026-10-25）：AGENTS 常驻代理上下文，清单属于参考材料。

- Tauri 桌面壳、SQLite 状态
- 工作区管理、补丁预览/应用/回滚、快照
- xterm.js 交互式终端（多会话 PTY，支持 CMD / PowerShell / Bash）+ 一个终端标签内多终端窗口（每个窗口独立 PTY、数量无上限；均分/自由布局、比例与自由像素拖拽、卷帘门裁剪 + 自定义滚动条、恢复自动布局、自定义布局卡片：拖拽排序/交换位置/双击标注）；按标签持久化布局与标注、重启逐窗格新建 shell
- CodeMirror 编辑器系统 + 文件预览 + 差异查看器（inline/side-by-side）+ 存盘链（Ctrl+S/空闲自动保存/切换前落盘，后端原子写；按文件串行保存 + 保存代际 + 草稿守卫，保存回声不会误报冲突、旧响应不会覆盖在途新草稿）+ 内外变更跟手（当前工作区 + 侧栏全部已添加工作区各一个监听根，批次带批次归属、按工作区刷新；干净自动重载、脏草稿优先；自写回声按内容指纹识别，真外部修改才立旗；保存前对新鲜信号读盘复核）+ Git 分支 worktree 切换（sibling 目录零重写、divergence 徽标、本地/远程/同步三选项、替换式工作区）+ 本地 Git 仓库初始化（非 Git 工作区一键 `git init`，只创建 `.git`、不联网、不改动现有文件）
- 右侧面板第一行工具栏折叠：工具切换器「折叠/展开工具栏」按钮（单折角图标，位于扩大/还原按钮左侧，两按钮间细分隔线）+ 全局统一状态 `adl:ui.rightPanelToolbarCollapsed`（五个面板共用，不按面板拆分）+ 折叠后内容区顶边与中心的终端/浏览器内容区对齐（隐藏 40px 工具栏，中心工具栏不受影响）
- 文件检索结果新鲜度（工作区 watcher 自动重算 + 点击校验重定位 + 「已失效」行内标记 + App 级错误边界；开文件就绪才切换＋失败时内容区友好错误）+ 检索结果分页窗口（Rust `SearchWindow` offset/limit + 精确 `hasMore` 多探一条判定 + 服务端硬上限钳制 20000（默认 5000，用户可在检索设置自定义步长/上限，超 5000 出卡顿警告）+ 前端单一来源 `searchWindow.ts` 四端同语义 + 「加载更多/显示全部/!」说明卡）+ 检索设置（工具栏齿轮入口 + 忽略/限制/绑定三 tab：手动勾选树（复用文件树行 chrome + 三态勾选 + 半选圆点 + 祖先展开）与 `.gitignore` 链（类 git 语义自动合并，前后两端镜像实现）并集生效 + 按工作区持久化；绑定 tab：跟随高亮/固定工作区（持久化）双模式）+ 检索绑定工作区（默认跟随文件面板高亮，可切换；后端 `search`/`search-in-files` 接受显式 `workspacePath`，命中打开走同一根）+ 内容检索 ripgrep 式无大小上限（流式逐行，NUL 二进制跳过，非 UTF-8 尽力匹配，超 8MB 单行截断）+ 跳转落点高亮（预览覆盖层直角贴边 + 远距瞬时定位）与编辑器揭示"渲染实测闭环 + 语言扩展就绪闸门"（首次点击即精准居中）
- 内置浏览器（Tauri WebView / iframe 双模式 + 新建标签对话框 + 收藏标签目录选择对话框 + 工作区顶级目录书签 + 4模式导航栏（open/tabs/list/search）+ SafeIframe 嵌入检查 + checkEmbed LRU 缓存 + Guard Effect 双路径验证 + 导航模式切换：就地导航/新建标签 + @radix-ui/react-switch + motion 动效 + 已打开标签过滤（filterTabIds）+ 多 iframe 状态保持（activatedTabIdsRef）+ 悬停关闭按钮（danger-hover）+ Flat 模式 ::after 渐变蒙版 + text-overflow: clip + 网站元数据持久化缓存（favicon data-URI + 标题，三层：Rust SQLite `site_meta_cache.rs` / preview JSON `.adl-cache/` / 前端 `siteMetaCache.ts`，预载门控 + 成功才写 + 引用计数删除）+ 标签加载状态（favicon 加载中 spinner + 标题未结算时"新建标签页"扫光动效，`titleResolved` 状态机 + `isRealTitle` 统一判定）+ 跨域重定向 favicon/标题兜底（方案 A 历史 URL 回写 `browserUpdateHistoryUrl` + 方案 B 会话级 `redirectMap`，`expectedNavigationUrlRef={url,at,tabId}` 显式导航检测 + 10s 新鲜度 + 发起 tab 绑定，参考 Chrome/Edge 重定向链消化语义 + Chromium `page_url_type`）+ 分隔线透明桥接条（dsh↔浏览器 WebView 零间隙贴边时 6px 透明子窗口夺回拖拽命中权，`divider_strip_*` 命令 + `siblingWebviewNonce` z-order 重建））
- harness 宿主集成：进程托管与拉起（`crates/webapp-host`）、版本管理（`crates/harness-version`）与系统版本检测/升级回退、下载源与镜像配置（`crates/download-source`）、终端 PATH 注入（`crates/pty`）、中心多标签宿主渲染（`CenterEntryPage`，`location='center'`）
- 存储治理：`adl-kernel::storage` 统一路径解析 + 启动期迁移 + 设置面板存储组（见上文"存储路径解析"）
- 运行环境依赖管理：`adl-env`（6 个 provider：node/git/bash/webview2/adlserver/netprobe；来源偏好 `env-sources.json` + 基线 `env-baseline.json` 资源；auto 优先宿主、强制来源不静默降级）+ `adl-hosted`（版本目录托管 `<数据根>/env-hosted/<dep>/installed/<v>`、原子换装与 adopt、`InstallLock`、进程宿主、进度任务）；adl-server 暴露 `GET /env/status` 与 `POST /env/{install,uninstall,select-source,set-custom-path,recheck}`（`EnvStatus` 含六依赖 + `task` + `dataDir` + `dshReady`）；设置面板「网络」组（源/代理/测试连接，自 DSH 搬迁）与「环境」组（7 依赖行、聚合条、复制给 agent、卸载/重装）+ 首启环境准备（五项任务清单，不可跳过）+ 6 份 runbook（`frontend/src/app/features/environment/runbooks/`，索引 `docs/runbooks/README.md`）；宿主 Git = PortableGit（含 Bash，Bash 也可取自系统 Git for Windows / WSL / MSYS2 / 手填路径）；adl-server 作为 sidecar 随包（`binaries/adl-server-<triple>.exe` 暂存、运行时 `adl-server.exe`、`scripts/build-stage-sidecar.ps1` 静态 CRT、`stage:sidecar` 预置）
- Markdown 预览主题（文件/变更面板）：github-markdown-css 变量驱动单表（`frontend/scripts/generate-md-theme-vars.mjs` 生成 + 自校验，切换只翻容器 `data-md-theme`，零取数零闪烁）+ 6 主题按亮暗分组跟随应用主题并持久化（`adl:files.markdownTheme{Light,Dark}`）+ 工具栏主题按钮（水滴图标，交互同图表主题选择器：悬停即时预览/离开恢复/点击打勾确认）+ starry-night 语法高亮（common 约 35 语言，本地 `onig.wasm` 优先、失败回落纯文本）+ 正文链接可点击（章节锚点跳转/相对文件索引打开/`#fragment` 剥离/按所属工作区解析/裸域不自动成链）+ 「打开方式」设置组（网址落点三选一、文件打开二选一、智能体站点链接拦截 + 白名单）
- 媒体预览：图片/音视频走 `GET /workspace/media` 的 **HTTP Range 流式**（任意体积、可拖动进度、无 base64/体积上限）；图片/视频缩放（100% = 适配视区、10%–800%、按钮 ×1.25 / Ctrl+滚轮 ×1.1 指针锚定、放大后拖拽平移、换文件复位）；Office/PDF 按需 `fetch` 字节并做大文件确认门；内置解码器不支持的编码（mkv/avi 等）统一「无法预览」卡片 + 「用系统默认程序打开」
- 系统媒体卡片（Windows SMTC）：宿主自建 `SystemMediaTransportControls` 会话（身份 `com.adlo.app`，进程/窗口 AUMID + HKCU `DisplayName`/`IconUri`）；本地媒体预览与内置浏览器标签页**同级、无优先级**，多播放源每 3 秒轮播；Chromium `MediaSessionService` 已关闭，标签页的站点 `navigator.mediaSession` 元数据与进度经注入脚本镜像进同一张卡片，卡片按钮按当前源路由
- 系统能力：剪贴板历史、系统监视器、凭据存储（keyring + 加密文件降级）（通信/CI/GitHub 面板已随 remove-communicate-panel 删除，能力面 bridge/IPC 保留）
- Zustand 切片模式（切片/action 数量以 `slicedStore.ts` 实测为准）+ 模块化分层（features/ + regions/）
- CSS 设计 Token 亮暗主题 + 自定义 Tooltip + 自定义滚动条
- i18n 国际化（25 领域/语言，TCopyContext + useTCopy 上下文驱动，TypeScript satisfies 类型安全）
