# AI Digital Life - 实现工作区规则

本目录是 `AI Digital Life` 的真实实现工作区，基于 **Rust + Tauri 2.x**。

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Rust stable + Tauri 2.x + tokio + rusqlite + serde + tracing |
| 前端 | React 19 + Vite + Zustand + TypeScript + CodeMirror 6 + xterm.js；Markdown 预览 markdown-it + starry-night（语法高亮）+ github-markdown-css（变量驱动单表，见 `frontend/scripts/generate-md-theme-vars.mjs`） |
| 桥接 | `#[tauri::command]` + `@tauri-apps/api` |
| 打包 | `cargo tauri build` |
| 包管理 | pnpm（前端）/ Cargo（Rust） |
| Rust 质量 | `cargo clippy` + `cargo fmt` + `rustfmt.toml` + `clippy.toml` |
| 前端质量 | ESLint v9（flat config）+ Prettier + TypeScript-ESLint + React Hooks plugin |
| Rust Lint | `cargo clippy --workspace --all-targets` |
| 前端 Lint | `cd frontend && npx eslint . && npx tsc --noEmit` |
| 门禁 | 本地执行（无远程 CI）：日常 `pnpm check:changed`（受影响范围）；全量 `check:full` / `cargo test --workspace` / 打包前必须先获用户批准；pre-push 钩子见 `.githooks/` |
| 凭据存储 | `crates/credential/`（keyring + 加密文件降级） |

### 存储路径解析（`adl-kernel::storage`）

- 所有应用数据路径由 `adl-kernel::storage` 的 `StoragePaths` 统一解析；locator 文件为 `<dirs::config_dir()>/ai-digital-life/storage-locator.json`（Plan A 阶段只读，缺失时回退默认；Plan B 起由启动期迁移写入指针切换结果），默认统一根 = 优先「与安装目录同级的 `&lt;安装目录名&gt;-data`」，该路径不可写（如 Windows 拦截的 Program Files 只读位置）时回退系统用户数据目录（壳层 `app_data_dir()`，见 `src-tauri/src/setup.rs::default_data_root`）。
- 日志目录：debug（dev）构建写仓库根 `.adl-logs`，release 构建写 `<root>/logs`。
- **已知行为**：补丁快照路径为 adl-server 的 `storage.paths().snapshot_dir`；默认目录外的旧快照不自动迁移，需手动移动（Plan B 只处理用户发起的路径变更）。

#### 启动期存储迁移（Plan B）

- **时机**：待迁移登记在 locator 的 `pendingMigration` 中（由设置页写入），真正的迁移在**下次进程启动、且任何 DB / 日志句柄打开之前**执行（壳层 `setup::run_startup_migration` 与 adl-server `engine::run_startup_migration` 均调用 `adl-kernel::storage::apply_pending`），因此不存在持有 SQLite 句柄时搬文件的问题；不做运行中热迁移。
- **成功**：按分类复制 → 校验（尺寸一致 + SQLite `PRAGMA quick_check`）→ **切换 locator 指针并落盘**（清理之前的最后一步）→ 清理旧源。清理只删除自有文件（base-aware 白名单），**外部文件永不删除、其所在目录保留**并记入 `lastReport.keptDirs`；`pendingMigration` 清空、`lastReport` 记为成功。`retainSource: true` 时跳过清理。
- **失败**：不切换指针、不删除源文件（旧路径数据完好），`pendingMigration.failed = true` 并记录 `error`，应用仍以旧路径正常启动；`lastReport` 记为失败，**不自动重试**，等待用户在设置中重试或取消。失败时会 best-effort 删除本次新建的目标文件。
- **幂等**：目标已存在且大小一致的副本会被跳过，中断后重跑安全。
- **locator 落点覆盖**：`locator_path()` 支持环境变量 `ADL_STORAGE_LOCATOR_PATH`（未设置时回退 `<dirs::config_dir()>/ai-digital-life/storage-locator.json`），供测试/开发把指针落点重定向到临时文件，避免读写真实 `%APPDATA%` locator。
- **已知限制**：`ADL_STORAGE_LOCATOR_PATH` 只覆盖 locator 文件路径，**不覆盖 `locator_dir()`** —— 由真实配置目录派生的路径（如 `credentials_dir`）仍指向真实位置。它是 dev/test 逃生口，不是数据目录重定向开关。

#### 存储设置组（Plan C）

- 设置面板新增「存储」组：统一根 / 每类独立两种模式；浏览器默认下载路径已搬入该组统一管理，行为不变。
- 双端实现策略：Tauri 经 `storage_*` 命令直写 locator 并可 `app_restart` 立即迁移；浏览器（preview/http + mock 四端 `StorageBridge` 方法集一致——Tauri/Preview/Mock 三实现 + HTTP preview 传输形态，见 `frontend/src/shared/ipc/__tests__/storage-parity.test.ts`）手输路径，`restartApp` 返回 `NOT_SUPPORTED` 并提示下次启动生效。
- 可配置 10 条可迁移路径（`database`、`downloads_db`、`site_meta_db`、`tree_cache`、`config`、`clipboard`、`snapshot`、`dsh`、`logs`、`credentials_fallback`，顺序与 `StorageCategory::key()` 一致）+ 1 个设置值路径（`downloads_default` 为用户文件落点，仅记录浏览器默认下载目录，不迁移、不统计占用、不扫描外部文件）与不可移动 6 项（keyring、机器身份、localStorage、IndexedDB、WebView2、工作区缓存）在 UI 中全部列出并附原因说明。
- 磁盘空间分歧（已接受）：服务端 `freeBytes` 恒为 0（"unknown"）；UI 不渲染空间 verdict，`freeBytes == 0` 即视为未知并跳过空间判定（与壳层 `free_bytes > 0` 门控同约定）。
- 预检非纯只读（B7）：`preflight` 会创建目标父目录并写入 `.adl-write-probe` 探测文件，供 UI 预检目标可写性。

## 项目形态

当前形态：**桌面应用宿主 + 第三方 Agent harness 集成**。Agent 对话、模型接入、多 Agent 编排及其配套能力（MCP / Compaction / Session Fork / 自定义命令 / 权限 Ruleset / Custom Agent 等）不由本仓库实现，交由接入的第三方 harness（当前为 deepseek dsh）提供，本仓库仅负责宿主集成（进程托管、版本管理、下载源/镜像、宿主渲染）：

- Tauri 桌面壳、SQLite 状态
- 工作区管理、补丁预览/应用/回滚、快照
- xterm.js 交互式终端（多会话 PTY，支持 CMD / PowerShell / Bash）+ 一个终端标签内多终端窗口（每个窗口独立 PTY、数量无上限；均分/自由布局、比例与自由像素拖拽、卷帘门裁剪 + 自定义滚动条、恢复自动布局、自定义布局卡片：拖拽排序/交换位置/双击标注）；按标签持久化布局与标注、重启逐窗格新建 shell
- CodeMirror 编辑器系统 + 文件预览 + 差异查看器（inline/side-by-side）+ 存盘链（Ctrl+S/空闲自动保存/切换前落盘，后端原子写）+ 内外变更跟手（watcher 批次驱动重载，干净自动重载、脏草稿优先）+ Git 分支 worktree 切换（sibling 目录零重写、divergence 徽标、本地/远程/同步三选项、替换式工作区）
- 文件检索结果新鲜度（工作区 watcher 自动重算 + 点击校验重定位 + 「已失效」行内标记 + App 级错误边界；开文件就绪才切换＋失败时内容区友好错误）+ 检索结果分页窗口（Rust `SearchWindow` offset/limit + 精确 `hasMore` 多探一条判定 + 服务端硬上限钳制 20000（默认 5000，用户可在检索设置自定义步长/上限，超 5000 出卡顿警告）+ 前端单一来源 `searchWindow.ts` 四端同语义 + 「加载更多/显示全部/!」说明卡）+ 检索设置（工具栏齿轮入口 + 忽略/限制/绑定三 tab：手动勾选树（复用文件树行 chrome + 三态勾选 + 半选圆点 + 祖先展开）与 `.gitignore` 链（类 git 语义自动合并，前后两端镜像实现）并集生效 + 按工作区持久化；绑定 tab：跟随高亮/固定工作区（持久化）双模式）+ 检索绑定工作区（默认跟随文件面板高亮，可切换；后端 `search`/`search-in-files` 接受显式 `workspacePath`，命中打开走同一根）+ 内容检索 ripgrep 式无大小上限（流式逐行，NUL 二进制跳过，非 UTF-8 尽力匹配，超 8MB 单行截断）+ 跳转落点高亮（预览覆盖层直角贴边 + 远距瞬时定位）与编辑器揭示"渲染实测闭环 + 语言扩展就绪闸门"（首次点击即精准居中）
- 内置浏览器（Tauri WebView / iframe 双模式 + 新建标签对话框 + 收藏标签目录选择对话框 + 工作区顶级目录书签 + 4模式导航栏（open/tabs/list/search）+ SafeIframe 嵌入检查 + checkEmbed LRU 缓存 + Guard Effect 双路径验证 + 导航模式切换：就地导航/新建标签 + @radix-ui/react-switch + motion 动效 + 已打开标签过滤（filterTabIds）+ 多 iframe 状态保持（activatedTabIdsRef）+ 悬停关闭按钮（danger-hover）+ Flat 模式 ::after 渐变蒙版 + text-overflow: clip + 网站元数据持久化缓存（favicon data-URI + 标题，三层：Rust SQLite `site_meta_cache.rs` / preview JSON `.adl-cache/` / 前端 `siteMetaCache.ts`，预载门控 + 成功才写 + 引用计数删除）+ 标签加载状态（favicon 加载中 spinner + 标题未结算时"新建标签页"扫光动效，`titleResolved` 状态机 + `isRealTitle` 统一判定）+ 跨域重定向 favicon/标题兜底（方案 A 历史 URL 回写 `browserUpdateHistoryUrl` + 方案 B 会话级 `redirectMap`，`expectedNavigationUrlRef={url,at,tabId}` 显式导航检测 + 10s 新鲜度 + 发起 tab 绑定，参考 Chrome/Edge 重定向链消化语义 + Chromium `page_url_type`）+ 分隔线透明桥接条（dsh↔浏览器 WebView 零间隙贴边时 6px 透明子窗口夺回拖拽命中权，`divider_strip_*` 命令 + `siblingWebviewNonce` z-order 重建））
- 第三方 harness 宿主集成（当前为 deepseek dsh）：进程托管与拉起（`crates/webapp-host`）、内嵌版本管理（`crates/dsh-bundle`）与系统版本检测/升级回退（`crates/dsh-version`）、下载源与镜像配置（`crates/download-source`）、中心多标签宿主渲染（统一入口页 CenterEntryPage：deepseek harness / 浏览器 / 终端三入口；dsh 版本管理位于设置面板「DSH」组版本管理块 / 浏览器视图 / 终端视图，标题栏标签条切换/拖拽排序；dsh 作为普通浏览器标签承载，`location='center'`；Tauri 双宿主 WebView2 / 浏览器 iframe + 嵌入被拒外部打开兜底；智能体站点正文链接拦截（白名单 origin 整站匹配，仅 Tauri WebView2 可注入，浏览器模式开关置灰））
- 存储治理：`adl-kernel::storage` 统一路径解析 + 启动期迁移 + 设置面板存储组（见上文"存储路径解析"）
- 运行环境依赖管理：`adl-env`（6 个 provider：node/git/bash/webview2/adlserver/netprobe；来源偏好 `env-sources.json` + 基线 `env-baseline.json` 资源；auto 优先宿主、强制来源不静默降级）+ `adl-hosted`（版本目录托管 `<数据根>/env-hosted/<dep>/installed/<v>`、原子换装与 adopt、`InstallLock`、进程宿主、进度任务）；adl-server 暴露 `GET /env/status` 与 `POST /env/{install,uninstall,select-source,set-custom-path,recheck}`（`EnvStatus` 含六依赖 + `task` + `dataDir` + `dshReady`）；设置面板「网络」组（源/代理/测试连接，自 DSH 搬迁）与「环境」组（7 依赖行、聚合条、复制给 agent、卸载/重装）+ 首启环境向导（四步，可跳过并续接）+ 6 份 runbook（`frontend/src/app/features/environment/runbooks/`，索引 `docs/runbooks/README.md`）；宿主 Git = MinGit（不含 Bash，Bash 仅取自系统 Git for Windows / WSL / MSYS2 / 手填路径）；adl-server 作为 sidecar 随包（`binaries/adl-server-<triple>.exe` 暂存、运行时 `adl-server.exe`、`scripts/build-stage-sidecar.ps1` 静态 CRT、`stage:sidecar` 预置）
- Markdown 预览主题（文件/变更面板）：github-markdown-css 变量驱动单表（`frontend/scripts/generate-md-theme-vars.mjs` 生成 + 自校验，切换只翻容器 `data-md-theme`，零取数零闪烁）+ 6 主题按亮暗分组跟随应用主题并持久化（`adl:files.markdownTheme{Light,Dark}`）+ 工具栏主题按钮（水滴图标，交互同图表主题选择器：悬停即时预览/离开恢复/点击打勾确认）+ starry-night 语法高亮（common 约 35 语言，本地 `onig.wasm` 优先、失败回落纯文本）+ 正文链接可点击（章节锚点跳转/相对文件索引打开/`#fragment` 剥离/按所属工作区解析/裸域不自动成链）+ 「打开方式」设置组（网址落点三选一、文件打开二选一、智能体站点链接拦截 + 白名单）
- 系统能力：剪贴板历史、系统监视器、凭据存储（keyring + 加密文件降级）（通信/CI/GitHub 面板已随 remove-communicate-panel 删除，能力面 bridge/IPC 保留）
- Zustand 切片模式（32 切片 + 18 action 模块）+ 模块化分层（features/ + regions/）
- CSS 设计 Token 亮暗主题 + 自定义 Tooltip + 自定义滚动条
- i18n 国际化（22 领域，TCopyContext + useTCopy 上下文驱动，TypeScript satisfies 类型安全）

> 截至 2026-09-15（存储功能 Plan A/B/C + 根因修复落地后实测）：工具链 rustc 1.97.1，616 Rust 测试通过（60 套件，0 失败）、1947 前端测试通过（234 文件）。最新计数请运行 `cargo test --workspace` 与 `pnpm --dir frontend run test`。
>
> 质量检查：`cargo clippy --workspace --all-targets -- -D warnings`（0 警告）、`pnpm --dir frontend run lint`（0 errors，若干 pre-existing warnings）。

## 安全边界

| 层 | 允许 | 禁止 |
|----|------|------|
| Rust Backend | 文件系统、SQLite、模型请求、凭据 | 直接操作 DOM |
| WebView | UI 渲染、状态编排、订阅事件 | 直接访问系统能力、密钥、原始 SQL |

跨进程能力通过 `#[tauri::command]` + `capabilities/*.json` 白名单暴露。

## 双端一致性

所有功能必须双端可用；规范见 [根目录 AGENTS.md](../AGENTS.md#双端一致性)。

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
├── slices/                      # 27 个独立切片（含 8 浏览器，以 slicedStore.ts 实测为准）
│   ├── uiSlice.ts / workspaceSlice.ts / gitSlice.ts（含 gitVisSlice）
│   ├── editorSlice.ts / patchSlice.ts
│   ├── searchSlice.ts / diagnosticSlice.ts
│   ├── clipboardSlice.ts（含 clipboardHistorySlice）/ terminalSlice.ts
│   ├── centerTabsSlice.ts           # 中心标签
│   ├── dshSlice.ts                  # dsh 宿主
│   ├── referenceSlice.ts            # 引用管理
│   ├── systemMonitorSlice.ts        # 系统监视器
│   ├── notificationSlice.ts / errorToastSlice.ts / toastSlice.ts / fileOpNoticeSlice.ts
│   ├── browserSlice.ts              # 浏览器核心（导航布局、持久化、跨领域）
│   ├── browserTabsSlice.ts          # 浏览器标签页
│   ├── browserBookmarkSlice.ts      # 浏览器书签
│   ├── browserHistorySlice.ts       # 浏览器历史记录
│   ├── browserFoldersSlice.ts       # 浏览器标签文件夹
│   ├── browserLandingSlice.ts       # 浏览器着陆页（快捷站点、端口、背景）
│   ├── browserSearchEnginesSlice.ts # 搜索引擎管理
│   └── browserDownloadsSlice.ts     # 下载记录与设置
└── actions/                     # 18 个跨切片 action 模块（*Actions.ts，+ helpers/类型文件）
    ├── workspaceActions.ts / workspaceLifecycleActions.ts / workspaceTreeActions.ts
    ├── editorActions.ts / patchActions.ts
    ├── gitActions.ts / gitBranchActions.ts / gitFileOpsActions.ts / gitSnapshotActions.ts / gitVisActions.ts
    ├── fetchActions.ts / generalActions.ts / searchActions.ts
    ├── referenceActions.ts / utilitiesActions.ts
    ├── centerActions.ts / dshActions.ts / browserCleanupActions.ts
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
- [parallel-branch-development.md](../parallel-branch-development.md) — 并行分支开发手册（工作树/槽位、开工自检）
- [docs/architecture/core/system-overview.md](../docs/architecture/core/system-overview.md)
- [docs/design-system/README.md](../docs/design-system/README.md)

## 调试工具

| 功能 | 说明 |
|------|------|
| 日志收起器 | `frontend/src/app/utils/debugLogCollector.ts`，拦截所有 console 输出，自动收起存储 |
| 复制按钮 | 页面右上角可拖拽"复制调试日志"按钮 |
| 自动写入 | `.adl-logs/`（debug 构建）；Tauri 桌面壳 `debug-logs*.txt`、浏览器模式 `debug-logs-browser*.txt` |
| 后端命令 | `src-tauri/src/commands/app.rs` → `write_debug_logs_to_project` |
| 浏览器后端 | `frontend/dev/previewWorkspaceService/`（目录，`logging.ts` → `writeDebugLogs`） |

**优先级**：调试日志收起器是最高优先级的调试手段，遇到 UI/交互问题时优先使用。详见 [仓库根 AGENTS.md](../AGENTS.md#问题排查与调试)。

### 开发阶段日志 CLI 覆盖（session-only）

用户与 agent 可在终端启动时直接指定三项日志设置（**只对本次进程生效，不写回 `config.json`**）：

```powershell
pnpm dev:tauri   -- --log-level trace --terminal-log-mode multi --debug-log-mode append
pnpm dev:browser -- --log-level debug
pnpm dev:preview -- --log-mode multi          # 兼容简写：同时设两个模式
```

| flag | 等价环境变量 | 取值 |
|------|--------------|------|
| `--log-level` | `ADL_LOG_LEVEL` | `error` \| `warn` \| `info` \| `debug` \| `trace` |
| `--terminal-log-mode` | `ADL_TERMINAL_LOG_MODE` | `overwrite` \| `append` \| `multi` |
| `--debug-log-mode` | `ADL_DEBUG_LOG_MODE` | `overwrite` \| `append` \| `multi` |
| `--log-mode`（简写） | `ADL_CLI_LOG_MODE` | 同时设终端与调试 |

- **优先级**：CLI flag > `ADL_*` env > `config.json` > 默认值；另有 `RUST_LOG` 作为**硬顶**（见下）
- **硬顶**：`RUST_LOG` 设了就是多层 filter 的 AND 上限——`RUST_LOG=error` 时 CLI `--log-level trace` 也顶不开；想运行期调高级别，先 unset `RUST_LOG`
- 非法取值打印 `[ADL-CLI] ignoring invalid …` 告警后忽略（不阻断启动）；重复 flag 取最后一次；手写 `config.json` 的大小写不敏感（`"INFO"` 照收）
- 启动会打印自证行：`[ADL-LOG] logger ready level=… prefix=…` 与 `[ADL-CLI] … (session override, not persisted)`
- **级别语义**：`log-level` 控制 stdout 层；**文件层下限恒为 `debug`**（保留 post-mortem 能力），即可调高到 trace、不会低于 debug
- env 是跨进程通道：shell 派生的 `adl-server` 子进程自动继承，单一 env 同时覆盖两个后端进程
- **传递通道只有 env**：flag 由启动脚本转成 `ADL_*` 环境变量后注入子进程。**不要**把 flag 透传给 `cargo tauri dev`——实测它会把 `--` 之后的参数当作 cargo 自身的参数并报 `unexpected argument '--log-level'`
- **运行期同步**：桌面 UI 改设置 → 壳立即生效并落盘，同时 POST 到 adl-server 的 `/app/log-settings`（仅运行时、**不落盘**，避免用 server 的旧内存快照覆盖壳刚写的其它字段）；浏览器模式经 `/app/preferences`（含落盘）
- **会话覆盖锁定**：CLI/env 锁定的字段，UI 改后运行期保持 CLI 值、仅落盘（下次无覆盖启动生效），前端弹顶部提示"下次启动生效"；落盘失败会回滚运行期
- **浏览器模式失败即失败**：ad-server 不可达时 `app` 域不再回退 mock，直接以错误卡呈现；设置面板另有"未连接后端"离线标识

### 日志文件落点（debug 构建；实证 2026-10-11）

`resolve_log_dir` 以各 crate 的 `CARGO_MANIFEST_DIR` 上推两级作为 `dev_project_root`，因此**两个进程的 `.adl-logs` 目录不同**：

| 进程 / 模式 | 日志目录 | 文件 |
|-------------|----------|------|
| Tauri 桌面壳（`src-tauri`） | `<仓库根>/.adl-logs/` | `terminal-logs*.txt`（壳 tracing）、`debug-logs*.txt`（壳调试日志） |
| 浏览器前端（dev preview service） | `<仓库根>/.adl-logs/` | `debug-logs-browser*.txt`（与壳的 `debug-logs*.txt` **分名**，避免 `dev:both` 下互相覆盖） |
| adl-server 后端引擎（`crates/server`） | `<仓库根>/ai-digital-life/.adl-logs/` | `adl-server-logs*.txt` |

- `multi` 模式额外写 `<前缀>-<时间戳>.txt` 会话文件；`overwrite` / `append` 只写固定名文件
- release 构建不写 `.adl-logs`，统一落 `<数据根>/logs/`
- 检索提示：`.adl-logs/` 被 `.gitignore` 排除，`Glob`/`Grep` 找不到，须用 `LS`/`Read` 绝对路径

## 问题排查规范

先定位根因，禁止凭空猜测；调试手段与优先级见 [根目录 AGENTS.md](../AGENTS.md#问题排查与调试) 与 [dev-rules.md](../../.agents/rules/dev-rules.md#问题排查规范)。

## 未发布阶段禁止兼容性代码

见根目录 [禁止项](../AGENTS.md#禁止项)。

## 相关文件

- [仓库根 AGENTS.md](../AGENTS.md) — 项目治理规则
- [FUTURE-ROADMAP.md](../FUTURE-ROADMAP.md) — 未来想法
- [docs/analysis/ai-digital-life/](../docs/analysis/ai-digital-life/) — ADL 源码地图（本项目的渐进式索引）

## 磁盘空间管理

### target/debug 成因与现状

`target/debug/deps` 以 `.pdb`（Windows 调试符号）为主 —— `[profile.dev]` 默认 `debug=2`（全量类型调试信息）为每个 exe/测试二进制生成约 300MB PDB。已通过 `.cargo/config.toml` 治理：

- 第三方依赖 `debug=1`（行号级）+ `opt-level=1`
- 自己 24 个包 `[profile.dev.package.X]` 白名单保留 `debug=2`（可断点查变量类型，见 `.cargo/config.toml` 白名单实测 24 个）
- 重开增量编译（`incremental=false` 已移除，ICE 于 1.97.1 修复）

### 清理策略（空间阈值触发全量清理）

| 条件 | 阈值 | 说明 |
|------|------|------|
| 空间 | `target/debug` > 30 GB | 超过即执行 `cargo clean` 全量删除 |

不再按时间窗口判断；超过 30 GB 直接全量清理。

> 清理脚本 `clean-target.ps1` 自身带 30GB 阈值判断（`$Threshold = 30`，未超阈即跳过）；本项目无远程 CI，清理只在本地按需执行。

> 所有删除均为**永久删除**：`cargo clean`（及 `clean-target.ps1`）直接物理删除构建产物，**不进入回收站/垃圾箱**，删除后无需清空回收站。

### 预防措施

```powershell
# 干跑预览（不实际删除）
powershell -File .cargo\clean-target.ps1 -WhatIf

# 执行清理（target/debug 超 30 GB 时全量 cargo clean）
powershell -File .cargo\clean-target.ps1
```

相关文件：`.cargo/config.toml`（alias `rebuild` = `clean && build`、`prune` = `clean`）。
