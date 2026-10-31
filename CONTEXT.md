# 架构与实现说明

本文档记录 AI 数字生命的架构概念、实现落点与文件路径。规范用词（术语定义与同义项禁用）见 [GLOSSARY.md](./GLOSSARY.md)；本文档不重复定义术语。

---

## 架构概念

### 双根结构
项目仓库分为两个根目录：根目录负责规划与治理（文档、规则、配置），`ai-digital-life/` 负责实际代码实现（Rust 后端 + 前端 UI）。

### 双端一致性
所有功能必须在 **Tauri 桌面应用** 和 **浏览器模式** 中保持**功能行为一致**。由于两种模式的运行环境不同（Tauri 有 Rust 后端 + SQLite + 系统 API，浏览器仅有 WebView + Web API），实现策略可以因环境而异。通过统一接口抽象（如 `TerminalOutputStore`、`PreviewBridge`）隔离环境差异，消费端不感知底层实现。新增 IPC 方法需同步实现 `tauri-bridge.ts` / `preview-bridge/` / `mock-bridge.ts` 三层桥接。

### 主工作树与槽位（Worktree Slot）
**主工作树**指仓库本体 `SourceWorkspace/`（常驻 `main`，只做集成与全量验证）；**槽位**指 `SourceWorkspace-worktrees/slot-N/` 这类长期持有的 git worktree 目录，分支在其中轮换复用。并发会话按 **一分支 = 一工作树 = 一会话** 分配，工作树共享对象库（不重复克隆），并通过仓库外的会话注册表 `.sessions/<session>.json` 声明占用。操作手册见技能 [parallel-branch-development](.agents/skills/parallel-branch-development/SKILL.md)（唯一真源）。

### 检索结果分页窗口（Search Window）
文件面板内容检索的结果数量以窗口 `{ offset, limit }` 分页返回：后端"跳过 offset → 收满 limit → **多探一条**判定 `hasMore`"，`hasMore` 为精确值（"恰好取尽"≠"被截断"）；安全阀 5000 由服务端钳制，调用方无法绕过。常量 200/5000 为**跨语言契约**（TS `searchWindow.ts` ↔ Rust `search.rs`，两侧钉值测试，见 `.agents/rules/cross-language-constant-contract.md`）。前端四端桥共享同一归一化与切片语义（`shared/ipc/searchWindow.ts`）。UI 侧对应「加载更多」「显示全部」与「!」结果上限说明卡。

---

## 架构模式

### 命名空间投影 (Namespace Projection)
模块通过自己的导出命名空间暴露类型，消费者通过命名空间限定符访问：`import { Config } from "./config"` 后通过 `Config.ID`、`Config.Info` 引用。避免扁平化导入导致的命名冲突。对应本项目：`kernel/types/` 中 `Config`、`ConversationConfig` 等类型的组织方式。

### Global 节点 vs Location 节点
服务生命周期管理策略：
- **Global 节点**：进程级单例，如 Database、Git、全局配置
- **Location 节点**：每工作目录独立实例，如 Config、Permission

对应本项目：进程级服务（`adl-logging`、`errors` crate）vs 工作区级服务（`workspace`、`pty` crate）。

### Service + Layer 依赖注入
每个领域模块定义三要素：Service 接口声明（方法签名）、Layer 实现绑定（具体实现注入）、节点定义（依赖关系声明）。对应本项目：Rust 中 `trait` 定义 + Tauri `manage()` 状态注入模式。

### Schema 驱动类型系统
使用结构化 Schema 定义公共数据模型作为前后端契约层：
- 所有公共类型在一个独立层定义（本项目对应 `kernel/types/`）
- 使用 branded types 增强类型安全（如工作区 ID 而非裸 `String`）
- 契约默认只读，运行时可变性显式声明
- 通过 serde 序列化/反序列化确保跨语言边界一致性

---

## 后端概念

### Tauri Command
Tauri 的 IPC 调用机制。前端通过 `invoke()` 调用 Rust 后端函数，后端通过 `#[tauri::command]` 宏暴露命令。返回类型统一为 `Result<T, AppError>`。

### AppError
统一的错误枚举类型，位于 `crates/errors/`。所有 IPC 错误都通过此类型传播，禁止使用裸 `String` 错误。

### Kernel
共享类型与常量 crate，包含 `domain` 模块，使用 `serde` 序列化。作为前后端之间的公共类型契约层。

### EntityTable
`storage` crate 中的宏，用于自动生成 SQLite CRUD 操作代码，减少样板代码。

### Layer (adl-logging crate)
Tracing 日志系统的配置层，支持文件输出和结构化字段。

### Sidecar
桌面端启动的独立后端子进程（当前 Tauri 模式）。未来移动端可通过 SSH/Sidecar 连接桌面端或服务器。

### Harness 版本 UI（单一通用卡片）

DSH 与 OpenCode CLI 共用一张版本卡片 `features/harness/HarnessVersionCard.tsx`，只消费
`HarnessVersionBridge` 接口（版本状态、目录、任务、安装/更新/回退/卸载/重装/取消）；
卡片不读任何 store，工具差异全部落在适配器：

| 层 | 关键内容 |
|---|---|
| 通用卡片 | `features/harness/HarnessVersionCard.tsx`：来源三态、当前版本单值读数、检查更新（含更新徽章）、双通道选择、进度与取消、卸载二次确认 |
| 桥接接口 | `features/harness/harnessVersionBridge.ts`：卡片唯一依赖的接缝（测试注入假桥） |
| DSH 适配器 | `features/dsh/dshVersionBridge.ts`：把 DSH store/actions 映射为桥；运行态与来源读数经 `DshVersionReadout` 插槽注入 |
| DSH 组外壳 | `features/dsh/DshSettings.tsx`：块头锚点 `anchorFor('dsh','version')`、只读来源摘要卡 `anchorFor('dsh','source')`、组级重置 |
| OpenCode 适配器 | `features/opencode/opencodeVersionBridge.ts` + `OpencodeSettings.tsx`（终端可用性插槽） |

状态在 `stores/slices/dshSlice.ts`、动作在 `stores/actions/dshActions.ts`；样式为
`styles/regions/harness-version.css`（卡片）+ `styles/regions/dsh-settings.css`（组内控件）。
设置搜索索引的 `dsh/version`、`dsh/source` 锚点与 `dsh` / `opencode` 分组标识保持不变。

### DSH 宿主渲染

dsh 基于 npm 发布，启动方式为 `npx @deepseek-ai/dsh@<version> --profile web --no-open`。在应用中作为**普通浏览器标签**承载于中心的多标签宿主（`location='center'` + `isDsh`），面板↔中心为同一原生 WebView 的位置移动；关闭 dsh 标签即彻底退出进程（`dsh.close(false)`），不跨重启持久化。

### Harness 版本管理 (Harness Version)
dsh 与 OpenCode CLI 共用的版本内核，位于 `crates/harness-version/`：版本目录、选中/回退/卸载、安装任务、来源解析与目录限量由通用层承担，工具差异集中在 `spec.rs` 的 `HarnessSpec` 描述符（DSH = npm 通道；OpenCode = 平台包 tarball 通道）。DSH 的运行态（端口/标签/auth）仍在 `crates/server/src/handlers/dsh.rs`。

### OpenCode CLI
以命令行形式运行的 harness。版本安装到 `<data_dir>/harnesses/opencode/versions/<version>/bin/opencode.exe`（直接下载 npm 平台包，不经 node）；版本来源解析为宿主托管时，新建终端会把该 `bin` 目录前置到会话 PATH（见 ADR-0005），不写系统/用户环境变量。

### Harness 获取 (Provisioning)
安装包不预置任何 harness 版本。首启环境向导完成后弹一次独立的 harness 向导（DSH / OpenCode 两张卡，可跳过），用户点击安装后按下载源配置拉取；失败不阻塞应用，可随时在对应设置组重试。

### Download Source
可配置的下载源系统，位于 `crates/download-source/`。支持 npm 仓库地址、镜像源（如 npmmirror）、代理设置与「自动检测选源」（仅 `source_mode=auto` 时生效，手动选择后不再自动覆盖）。配置文件为 `<data_dir>/config/download-sources.json`。

代理三态 `auto | manual | none`（界面文案：自动检测 / 自定义 / 关闭）：`auto` 在构建 HTTP 客户端前对代理端点做 TCP 预检（5 s 缓存），不可达即静默改用直连，真实状态经 `/dsh/source-status` 的 `proxyEffective` 暴露给设置面板；`manual` 失败如实报 `proxy_unreachable`，不静默绕过。探测（`test_source`）与真实下载共用同一套代理解析与回退决策，失败按 `proxy_unreachable / network / http / unknown` 分类后由前端本地化。版本目录请求启用 reqwest `gzip` 并把超时放宽到 60 s（OpenCode 完整 packument 约 25 MB / 12k 版本，gzip 后约 3.6 MB）。代理解析与 reqwest 同源：同一 scheme 下 `HTTP(S)_PROXY`（非空即胜出，即便不可解析）→ Windows 注册表 `ProxyServer` → `ALL_PROXY`；注册表读取 `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings` 的 `ProxyEnable / ProxyServer / ProxyOverride`（直连名单同步生效）。PAC（`AutoConfigURL`）与 hyper-util 一样不解析，因此「未检测到代理，当前直连」的文案成立。两项决策记录见 [ADR-0006](./docs/adr/0006-proxy-auto-silent-direct-fallback.md)（自动回退/手动不回的取舍）与 [ADR-0007](./docs/adr/0007-auto-preference-vs-resolved-source.md)（下拉显示偏好、解析与可用性分列）。

### 环境依赖 (Env Dependency)
应用运行所需的六项外部依赖：`node`、`git`、`bash`、`webview2`、`adlserver`、`netprobe`。由 `crates/adl-env/` 的 provider 检测/安装，状态经 adl-server 的 `GET /env/status` 暴露（`EnvStatus`：六依赖状态 + 任务快照 + `dataDir` + `dshReady`）。

### 宿主托管 (Host Source)
依赖的一种来源类型：由应用自己下载并安装到数据目录的副本（区别于系统已安装版本）。实际来源由 `auto`（宿主优先）/`system`/`host` 三种偏好解析，强制来源缺失时返回 `none` 而不静默降级。宿主版本由 `crates/adl-hosted/` 托管。

### env-baseline.json
环境依赖的最低/稳定版本基线资源（`ai-digital-life/src-tauri/resources/env-baseline.json`，随包发布）。记录 node stable 与 dist 源、git stable/tag/asset/base、webview2 minimum；用于判定 `meetsBaseline` 与安装版本。

### runbook
面向人/agent 的可执行修复手册，按依赖各一份（Node、Git/Bash、WebView2、adl-server、网络下载、模型凭据）。唯一真源为 `ai-digital-life/frontend/src/app/features/environment/runbooks/`（前端 `?raw` 内联），`docs/runbooks/README.md` 仅为索引。固定五段：症状 / 检查命令 / 安装步骤 / 验证步骤 / 回滚。

### 首启环境向导 (First-run Env Wizard)
首次启动时引导用户检查并补齐环境依赖的四步向导；可跳过（记录跳过状态并显示续接横幅），设置面板「环境」组可随时重新进入。环境向导完成或跳过后，另有一次独立的 harness 向导（见「Harness 获取」）。

---

## 前端概念

### Store (Zustand 状态管理)
前端全局状态管理，采用**切片合并模式**（Sliced Store Pattern）。每个功能域拥有独立 slice，通过 `slicedStore.ts` 合并为单一 Store。

### Bridge (桥接层)
前端与后端的通信抽象层，分为三层：
- **Tauri Bridge**：生产环境，通过 `invoke()` 调用
- **Preview Bridge**：浏览器开发模式，通过 HTTP API 调用
- **Mock Bridge**：纯前端模拟，用于测试

### IPC 域拆分
桥接层按功能域拆分为多个子接口文件（`shared/ipc/` 目录），每个域文件定义该域的接口类型。新增域时按 [新增 IPC 域清单](./docs/development/adding-an-ipc-domain.md) 逐项接线（Rust handler/路由、四端桥接、store、UI、i18n、契约测试）。

### 中心标签（Center Tab）
中心多标签宿主中的标签，`kind` 为 `launcher`（统一入口页 `CenterEntryPage`，三入口：deepseek harness / 浏览器 / 终端；标签与 `+` 按钮显示「新建入口页」）/`browser`（浏览器视图）/`terminal`（终端视图）。浏览器/终端中心标签通过 `refId` 指向底层标签；底层标签以 `location: 'panel' | 'center'` 标记所属宿主，位置排他。面板的破坏性操作（关闭/清空/删除）跳过 `location === 'center'` 的标签；标题栏标签条支持切换、真关闭与移回对应面板。

### 浏览器宿主会话隔离（UDF Isolation）
WebView2 的 `PreferredColorScheme` 在同一用户数据目录（UDF）会话内实际全局（上游 WebView2Feedback #4920），新建控制器会闪到另一宿主。故面板沿用默认 UDF，中心/静默各走独立 `data_directory`（`webview/center`、`webview/silent`）。代价：独立 UDF = 独立空 profile，中心与面板的 Cookie/localStorage/登录态互不共享（中心升级后需重新登录一次）；后端主题另有"是否已显式同步"状态位，启动窗口内用创建时刻前端值，防重启首帧落到硬编码默认主题。决策记录见 [ADR-0001](./docs/adr/0001-browser-udf-isolation.md)。

### Divider Strip（分隔线桥接条）
中心浏览器 WebView2 与右侧面板浏览器 WebView2（面板导航器收起时）零间隙贴边时，两者均为 OS 级子窗口，吃掉右面板 resize handle 命中带。修复是在接缝上架一条 6px 全高透明子 WebView（`adl-divider-strip`），夺回命中权并把拖拽增量回传主窗口；兄弟窗口（重）建经 store `siblingWebviewNonce` 重建回到最上层。显隐只看面板侧不变量（导航器收起 **且** 面板活动 tab 已入池承载可见 WebView，见 `shouldShowStrip`）；排序指纹仅含 z-order 信号（tabId/tab 数/nonce，不含 URL）；面板进入 overlay 态（中心 WebView 已隐藏）时**仍需**条带兜底。

### Branded Types（标记类型）
编译时名义类型（nominal typing）模式，定义在 `frontend/src/shared/branded.ts`。使用 TypeScript `unique symbol` 交叉类型实现零运行时开销的类型安全：
- `WorkspaceID`、`TerminalSessionID` 等 ID 类型
- 赋值时必须显式转型（`asWorkspaceID(str)`），防止 ID 类型间混用
- 桥接层保持使用 `string` 传输，前端边界处通过 `as string` 剥离品牌

### Typed Error Classes（类型化错误类）
前端定义在 `frontend/src/shared/typedErrors.ts`，17 个具体错误类（其中 15 个对应 Rust `AppError` 变体，另 `InvokeError`、`PreviewApiError` 为前端专用；Rust 端共 18 个变体，`Timeout` / `RateLimit` / `AuthError` 无对应前端类，经 `fromIpcErrorCode` 回落到 `InternalError`）。支持 `instanceof` 判断，`fromIpcErrorCode(code, message)` 工厂函数从 IPC 错误码转换。

### EventBuffer（事件缓冲区）
前端定义在 `frontend/src/shared/eventBuffer.ts`，泛型缓冲区类，用于收集高频事件
（终端输出）后批量刷出，减少 React re-render 次数：
- `flush()` — 清空并返回所有缓冲事件
- `drainWithReconciliation(mergeKey, reducer)` — 按 key 去重合并
- `scheduleFlush(callback)` — 微任务级批量刷新

### ConfigTransform（可重放配置变换）
前端 `frontend/src/app/stores/configStateMachine.ts` 和 Rust `crates/kernel/src/types/config.rs` 共同实现，采用可重放的配置变换模式：
- `createConfigState(base)` — 创建状态 + transform 日志
- `applyTransform(state, transform)` — 应用变换并追加日志
- `reloadFromBase(base, transforms)` — 在新基线上重放
- `rollbackLastTransform(state)` — 撤销最后一次变换

### PermissionEngine（三态权限引擎）
Rust 端 `crates/kernel/src/command_risk.rs`，采用 deny/ask/allow 三态模型：
- `PermissionDecision` 枚举：`Allow < Ask < Deny`（PartialOrd 优先级）
- `PermissionRule` 结构：`pattern` 支持 `*`（单段）和 `**`（多段）通配符

### Design Token
设计系统的基础原子值，定义在 `frontend/src/design-system/tokens.ts`。包含 ShadowToken、ColorToken、SpacingToken 等类型。

---

## 项目形态

当前形态：**桌面应用宿主 + 第三方 Agent harness 集成**。宿主侧包括架构底座（Rust crate 架构、Tauri 壳层、安全边界 capability 权限策略、SQLite 持久化、日志系统）、工作区、终端、编辑器、浏览器、存储治理与系统能力；Agent 对话、模型接入与编排能力由接入的第三方 harness（当前为 deepseek dsh）提供，本仓库仅负责宿主集成（进程托管、版本管理、宿主渲染）。

---

## 功能域

### 编辑器 (Editor)
前端代码编辑器面板，基于 CodeMirror，支持多标签页、语法高亮、diff 对比。

### 工作区 (Workspace)
项目管理模块，支持 Git 操作（clone/commit/diff/worktree）、文件树、大纲解析、搜索。

### 浏览器 (Browser)
内嵌 WebView（Tauri 模式）和 iframe（浏览器模式）面板，支持多标签页、书签、历史记录。网站元数据缓存（favicon data-URI + 标题）为三层架构：Tauri 端 `crates/browser/src/site_meta_cache.rs`（SQLite）、浏览器端 preview JSON 文件（`.adl-cache/`）、前端内存层 `siteMetaCache.ts`（唯一渲染真源）。

### 终端 (Terminal)
伪终端管理模块。Tauri 模式后端通过 `crates/pty/` 管理进程，浏览器模式通过 `previewTerminalService.ts`（Node.js）管理；前端通过 xterm.js 渲染，浏览器模式采用轮询机制（1000ms，`preview-pty-bridge.ts`）。

### 变更引擎 (Change Engine)
代码变更预览、应用、回滚、checkpoint 管理。位于 `crates/change-engine/`。

---

## 数据库

### SQLite (rusqlite)
本地持久化存储，通过 `r2d2` 连接池管理，`WAL` 模式。`sql/` 目录包含 schema 和索引 SQL 文件。

### Storage Layer
位于 `crates/storage/`，提供 CRUD 抽象、实体表宏、数据清理。

### 存储分类与占用
`adl-kernel::storage::StorageCategory` 定义 10 条可迁移分类与 1 个设置值路径；设置页占用由 `category_usage(category, path)` 统计，经 `category_statuses`（`src-tauri/src/commands/storage.rs` 与 `crates/server/src/handlers/storage.rs` 各一份）输出。`Harnesses` 分类是单一目录（`<root>/harnesses/`，其下按工具分 `dsh/versions`、`opencode/versions`），占用统计与迁移预检（`category_roots`）同根。

### 整树自有分类
`adl-kernel::storage::whitelist::owns_entire_tree(category)` 标记「基目录下所有文件都归应用所有」的分类（Config / Harnesses）；`scan_foreign` 据此跳过整树扫描，避免对 harness 版本目录的大量文件做无意义遍历。

---

## 启动模式

| 模式 | 命令 | 引擎 | 终端 |
|------|------|------|------|
| Tauri 桌面 | `pnpm run dev:tauri` | Tauri WebView2 | xterm.js + Rust PTY（`pty_commands.rs`） |
| 浏览器预览 | `pnpm run dev:browser` | Vite | xterm.js + 轮询（`preview-pty-bridge.ts`，1000ms） |
| 双端启动 | `pnpm run dev:both` | 两者 | 两者 |

### 开发实例 (Dev Instance)
以 `pnpm dev*` 从某个工作树启动的应用实例：`scripts/instance-id.mjs` 为槽位目录派生 identifier 后缀并把 storage locator 落到 `<worktree>/ai-digital-life/target/adl-instance/`（主工作树沿用默认身份，与正式安装共用数据）；`scripts/dev-port.mjs` 分配 `5173+N` 稳定前端端口并生成实例令牌，`vite` 以 `strictPort` 绑定，启动器用 `GET /__adl_dev_instance__` 校验「应答的是不是自己 spawn 的 vite」。
