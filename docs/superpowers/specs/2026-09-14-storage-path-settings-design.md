# 设置面板「存储」组：自定义数据路径 + 迁移 + 旧目录清理设计

> **日期：** 2026-09-14
> **状态：** 待复核
> **范围：** 右侧面板-设置面板新增「存储」组；应用级数据根目录与各分类目录的自定义、迁移、旧目录清理、信息提示
> **承接：** `2026-09-14-terminal-history-regions-design.md` §15.1「子项目 A」——本设计即该子项目的正式立项
> **关联约束：** 只改变数据**落点**，不改变任何数据的**技术方案**（SQLite 仍是 SQLite，文件仍是文件）

---

## 1. 问题陈述与需求

### 1.1 用户需求（原文归纳）

1. 在「右侧面板-设置面板」下新增「存储」组，把所有与「存储」有关的内容集中显示在该组中。
2. 用户可自定义数据存储路径；自定义后若旧路径已有历史数据，需**自动迁移**，并**彻底删除旧路径下的数据及目录**。
3. 每个目录只存放属于自己目录的数据，删除时清晰、不混乱。
4. 旧目录中若存在「不属于对应目录」的文件：首先确保项目自身不会产生这种情况；若为用户自行放入的外部文件，则**只迁移并删除我们的文件，目录保留**。
5. 项目中所有数据，除非必须在系统盘（C 盘），其它都支持自定义路径 → 迁移 → 删除旧数据及目录。
6. 不更改技术方案，只移动位置（例：终端只读历史的 SQLite 存储方案不变，只移动其所在文件/库的位置）。
7. 在相关位置添加详细、友好的信息提示。

### 1.2 澄清结论（已与用户确认）

| 议题 | 结论 |
|---|---|
| 自定义粒度 | 默认「统一根目录」；用户可切换到「每类完全独立」模式；两种模式用户自选 |
| 迁移生效时机 | **用户手动选择**：`立即迁移并重启` 或 `下次启动时迁移` |
| 覆盖范围 | 尽量全部可移；技术上不可移的项也要**全部列出**并附详细友好说明 |
| 既有存储项归属 | 终端历史磁盘预算、浏览器默认下载路径**搬进「存储」组**统一管理 |
| 浏览器模式 | 两端都可修改路径（浏览器模式手输，Tauri 模式支持目录选择对话框 + 手输） |

### 1.3 现状盘点（已核实，非推测）

**统一根 `data_dir`** 由 `ai-digital-life/src-tauri/src/setup.rs::resolve_data_dir()` 解析（Tauri `app.path().app_data_dir()`，Windows 默认在系统盘）。adl-server 子进程由 `AdServerHandle::spawn()` 以 `--data-dir <path>` 启动。**当前生产环境不可自定义。**

#### A. 可移动的数据（本项目自有，属「存储」组管理范围）

| # | 分类 | 技术 | 当前默认位置 | 备注 |
|---|---|---|---|---|
| 1 | 主业务库 | SQLite（`rusqlite`+`r2d2`，WAL/FK） | `<data_dir>/data.db`（+`-wal`/`-shm`） | 工作区、会话、任务、审批、剪贴板元数据、终端输出、git 可视缓存等 14+ 表 |
| 2 | 下载历史库 | SQLite | `<data_dir>/downloads.db` | `download_history` 表 |
| 3 | 站点元缓存库 | SQLite（单连接+Mutex） | `<data_dir>/site-meta-cache.db` | `site_meta_cache` 表 |
| 4 | 应用配置 | JSON 文件 | `<data_dir>/config/config.json` + 下载源 JSON | 跟随根目录 |
| 5 | 剪贴板资源 | 目录（图片/缩略图） | `<data_dir>/clipboard/images/`、`<data_dir>/clipboard/thumbs/` | 元数据在主库 |
| 6 | 项目快照 | 目录树 | `<data_dir>/snapshot/<project_hash>/` | Change-Engine |
| 7 | DSH 版本/包 | 目录 + `version.txt` + 二进制 | `<data_dir>/dsh-versions/`、`<data_dir>/dsh-bundle/` | |
| 8 | 日志 | 文件追加 | 项目根 `.adl-logs/terminal-logs*`、`debug-logs*` | 见 §6.3 决策点 L |
| 9 | 凭据**回退**文件 | AES-256-GCM 加密文件（HKDF，0600） | `<dirs::config_dir()>/ai-digital-life/credentials/<service>.<account>.enc` | 仅在 OS keyring 不可用时使用 |
| 10 | 默认下载目标 | 文件系统直写（用户文件） | 非系统盘 `<drive>/<user>/Downloads`，兜底 `~/Downloads` | 已可单次手选目标；此处管理**默认目录** |

#### B. 不可移动的数据（受 OS / 浏览器运行时约束，只做说明展示）

| # | 分类 | 技术 | 位置 | 为什么不可移 |
|---|---|---|---|---|
| 1 | 凭据（主） | OS keyring（`keyring v3`） | Windows Credential Manager / macOS Keychain / Linux Secret Service | 由操作系统凭据管理器托管，路径不归应用控制 |
| 2 | 机器身份锚 | 文件 | `%LOCALAPPDATA%/ai-digital-life-machine-id`（Win）/ `/etc/machine-id`（Linux） | 用于派生凭据加密密钥；移动或丢失会导致已加密凭据**永久无法解密** |
| 3 | UI 状态 | `localStorage` | 浏览器 origin 隔离存储（`adl-ui:*`、`adl-theme-mode` 等） | 由 WebView 的 origin 存储区管理，无文件路径概念 |
| 4 | 头像缓存 | IndexedDB | `adl-avatars`（store `avatars`，Blob，TTL 7 天） | 同上，浏览器 origin 隔离存储 |
| 5 | WebView2 运行时数据 | OS 运行时 | WebView2 user-data 目录（缓存/History/Cookies） | 由 WebView2 运行时自管，改路径需改整个 WebView 环境 |
| 6 | 工作区级缓存 | 文件 | `<workspaceRoot>/.adl-cache/site-meta-cache.json`（浏览器预览） | 属**工作区**作用域，随工作区目录移动，非应用数据 |

#### C. 既有存储相关设置项（搬入「存储」组）

| 项 | 现位置 | 结论 |
|---|---|---|
| 终端历史磁盘预算 `terminalHistoryBudgetBytes` | 设置面板「终端」组 | 搬入「存储」组 |
| 浏览器默认下载路径 `downloadSettings.default_path` | 设置面板「浏览器」组 | 搬入「存储」组 |

---

## 2. 目标与非目标

### 2.1 目标

- 新增设置组「存储」，集中展示并管理 §1.3-A 的全部分类，且**明示** §1.3-B 的不可移项及原因。
- 支持两种模式：`unified`（统一根目录，默认）与 `per_category`（每类完全独立）。
- 任一分类路径变更后，支持**用户手动选择**的迁移时机：立即（迁移并重启）或下次启动。
- 迁移全程遵守「自有文件白名单」；只迁移/删除本项目文件，外部文件保留且保留其父目录。
- 项目自身代码保证「每个目录只放自己目录的数据」（见 §6.2 不变量）。
- 全流程有详细、友好的信息提示（预检、进度、成功/失败报告、不可移项说明）。
- 双端（Tauri / 浏览器）功能行为一致。

### 2.2 非目标

- 不改变任何数据的技术方案（SQLite/文件/加密方案均不变），仅改变落点。
- 不实现跨设备同步、云备份、加密整个数据目录。
- 不搬迁 §1.3-B 的不可移项（仅说明）。
- 不为「数据格式」提供旧版本兼容（本设计迁移的是**用户的路径变更**，与版本兼容无关）。
- 不做本地目录的权限提升（不申请管理员权限）。

---

## 3. 架构

### 3.1 核心构件

| 构件 | 职责 | 位置 |
|---|---|---|
| `StorageLocator` | 存储路径的**唯一真源**（bootstrap 文件），记录模式、根目录、每类 override、待迁移状态、上次迁移报告 | `<app_config_dir>/storage-locator.json` |
| `StorageService` | 读取 locator → 校验 → 解析出每类最终路径；提供 `resolve(Category) -> PathBuf` | `crates/kernel/src/storage.rs`（新） |
| `MigrationEngine` | 按白名单执行「复制 → 校验 → 删源 → 尝试删目录 → 生成报告」，含失败回滚 | `crates/kernel/src/storage_migration.rs`（新） |
| `StorageStatus` IPC | 状态查询、路径设置、立即应用、取消待迁移 | `src-tauri/src/commands/storage.rs`（新） |
| `StorageSettings` | 设置组 UI | `frontend/src/app/features/storage-settings/StorageSettings.tsx`（新） |

### 3.2 为什么需要独立的 locator 文件（关键设计决策）

`config.json` 自身位于 `<root>/config/` 下。若把「根目录路径」存进 `config.json`，则路径配置会随被移动的数据一起移动，形成循环依赖（找不到 config 就不知道根在哪）。

因此新增一个**极小（<2 KB）、永不迁移、位于系统配置目录**的 `storage-locator.json` 作为「指针」：

- Windows：`%APPDATA%\<bundle-id>\storage-locator.json`
- macOS：`~/Library/Application Support/<bundle-id>/storage-locator.json`
- Linux：`~/.config/<bundle-id>/storage-locator.json`（经 Tauri `app_config_dir()`）

该文件属于「必须在系统盘」的例外（§1.1-5 明确允许）；它不含业务数据，仅含路径指针。

### 3.3 启动顺序（迁移发生在一切 DB/文件句柄打开之前）

```
Tauri setup / adl-server 启动
  → 读取 storage-locator.json（不存在则用默认：unified，root=app_data_dir）
  → 若存在 pendingMigration：执行 MigrationEngine（见 §7）
       成功 → 更新 locator、写报告、清理旧目录，继续启动
       失败 → 保留旧路径可用，标记 failed+报告，继续启动（UI 显示横幅）
  → StorageService 解析出全部分类路径
  → 之后才 open data.db / downloads.db / site-meta-cache.db、启动日志、config watcher、快照等
```

这是把迁移**收敛为单一路径**的关键：无论用户选「立即」还是「下次启动」，真正的迁移都发生在「下次进程启动、DB 打开之前」，因此不存在持有 SQLite 句柄时搬文件的问题。

---

## 4. 配置模型

### 4.1 `storage-locator.json` Schema

```jsonc
{
  "version": 1,
  "mode": "unified",              // "unified" | "per_category"
  "root": null,                    // unified: 自定义根；null=默认 app_data_dir
  "categories": {                  // per_category 模式下生效；unified 下忽略
    "database": null,              // null = 使用默认位置
    "downloads_db": null,
    "site_meta_db": null,
    "config": null,
    "clipboard": null,
    "snapshot": null,
    "dsh": null,
    "logs": null,
    "credentials_fallback": null,
    "downloads_default": null
  },
  "pendingMigration": {            // 非 null 表示有待执行的迁移
    "from": { "mode": "unified", "root": "...", "categories": {} },
    "to":   { "mode": "per_category", "root": null, "categories": { "clipboard": "D:\\adl\\clipboard" } },
    "requestedAt": 1757836800000
  },
  "lastReport": {                  // 最近一次迁移报告（成功或失败）
    "at": 1757836800000,
    "ok": true,
    "movedFiles": 42,
    "movedBytes": 104857600,
    "removedDirs": ["...", "..."],
    "keptDirs": [ { "path": "...", "foreignFiles": ["user-note.txt"] } ],
    "error": null
  }
}
```

**不变量**：`storage-locator.json` 是存储路径的唯一真源。UI 中「存储」组的路径显示**只**来自 `storage_get_status` 命令，不经由 `ConfigSnapshot`。

### 4.2 默认解析规则

| 模式 | 规则 |
|---|---|
| `unified`（默认） | 所有分类 = `root ?? app_data_dir()` 下的既有相对布局（§5.1） |
| `per_category` | 每个非 null 的分类使用其 override；null 的分类回退到 `unified` 规则 |

**默认 = 现有行为**：`mode=unified` 且 `root=null` 时，路径与当前完全一致（`<app_data_dir>/data.db` 等），因此存量用户升级后行为不变。

---

## 5. 目录布局与自有文件白名单

### 5.1 统一模式下的相对布局（保持现状，不重组）

```
<root>/
├── data.db, data.db-wal, data.db-shm        # database
├── downloads.db (+wal/shm)                  # downloads_db
├── site-meta-cache.db (+wal/shm)            # site_meta_db
├── config/                                  # config（config.json、下载源 JSON）
├── clipboard/images/**, clipboard/thumbs/** # clipboard
├── snapshot/<project_hash>/**               # snapshot
├── dsh-versions/**, dsh-bundle/**           # dsh
└── logs/**                                  # logs（默认跟随根目录，见 §6.3）
```

> **决策点 L（已定，见 §6.3）**：`logs` 默认跟随统一根目录 `<root>/logs`；开发态（debug 构建）保留写仓库根 `.adl-logs` 的覆盖开关，以不破坏现有调试工作流。

### 5.2 自有文件白名单（迁移与清理的唯一依据）

| 分类 | 白名单（允许复制/删除的路径模式） |
|---|---|
| `database` | `<root>/data.db`、`data.db-wal`、`data.db-shm` |
| `downloads_db` | `<root>/downloads.db`、`downloads.db-wal`、`downloads.db-shm` |
| `site_meta_db` | `<root>/site-meta-cache.db`、`site-meta-cache.db-wal`、`site-meta-cache.db-shm` |
| `config` | `<root>/config/**`（整个子目录均为本项目所有） |
| `clipboard` | `<root>/clipboard/images/**`、`<root>/clipboard/thumbs/**` |
| `snapshot` | `<root>/snapshot/**`（含按 `<project_hash>` 命名的子目录） |
| `dsh` | `<root>/dsh-versions/**`、`<root>/dsh-bundle/**` |
| `logs` | `<logDir>/**`：`terminal-logs*.txt`、`debug-logs*.txt` |
| `credentials_fallback` | `<credDir>/**`：仅 `*.enc`（且文件名符合 `<service>.<account>.enc` 形态） |
| `downloads_default` | **无白名单**——用户文件，永不自动删除，仅迁移其「默认目录」设置值 |

### 5.3 「每个目录只放自己数据」——项目自身不变量（需求 3 的落地）

- `clipboard/` 下只允许 `images/` 与 `thumbs/`；`snapshot/` 下只允许 `<project_hash>/`；`config/` 下只允许本项目配置文件。这些由代码写入路径保证，并新增**单元测试断言**（§11）。
- 分类目录若出现白名单之外的文件/子目录，一律视为**外部文件**：迁移时不复制、清理时不删除、其父目录不删除。
- `snapshot/` 按 `<project_hash>` 组织，天然满足「每目录只放自己项目的数据」。

---

## 6. 设置 UI 设计（「存储」组）

### 6.1 组结构与交互

新增 `SettingsGroupId = "storage"`，加入 `SettingsNav`。`StorageSettings.tsx` 结构：

```
存储
├── [模式]  ( ) 统一根目录（默认）   ( ) 每类完全独立
├── ── 统一模式 ──
│   根目录: <当前路径，只读显示>
│   [选择目录] [手动输入]                  ← 两端都可用
├── ── 每类独立模式（默认展开全部 10 类，按「核心数据 / 高级」分组）──
│   [核心数据]
│     主业务库 ⓘ · 下载历史库 ⓘ · 站点元缓存库 ⓘ · 应用配置 ⓘ · 剪贴板资源 ⓘ
│   [高级]
│     项目快照 ⓘ · DSH 版本与包 ⓘ · 日志 ⓘ · 凭据回退文件 ⓘ · 默认下载目标 ⓘ
│   每行：名称 ⓘ | 当前路径(只读) | [选择] [输入] | 占用大小
├── ── 存储引擎（搬入项）──
│   终端历史磁盘预算   ← 原「终端」组
│   浏览器默认下载路径 ← 原「浏览器」组
├── ── 索引文件（只读）──
│   数据位置索引: <app_config_dir>/storage-locator.json   ⓘ 请勿删除
├── ── 不可移动（说明区）──
│   🔒 凭据管理器 (OS keyring)       <一句话原因>
│   🔒 机器身份文件                  <…>
│   🔒 界面状态 (localStorage)       <…>
│   🔒 头像缓存 (IndexedDB)          <…>
│   🔒 WebView2 运行时数据           <…>
│   🔒 工作区级缓存                  <…>
└── ── 迁移报告（仅当 lastReport 存在时显示）──
```

- 每个分类行在名称后带 ⓘ 信息图标：**悬停/聚焦显示 Tooltip，展开显示一行描述**，说明「这里存了什么」+「与哪些界面/功能相关」（完整文案见 §6.4）。这是硬性要求：10 类**每一类都必须有**，不得省略。
- 每行路径为**只读显示**；点击「选择目录」调用 `workspace.pickDirectory()`（Tauri）；「手动输入」在 Tauri 与浏览器模式**都**提供（满足「两端都可改」）。浏览器模式无原生目录对话框，仅手输。
- 变更任意路径后点「应用」，弹出时机选择对话框（§7.2）。
- 「不可移动」区每项后附信息图标 + Tooltip + 一行说明，文案走 i18n。
- 搬入项（终端预算、下载路径）沿用既有行为与既有 i18n key；仅迁移 UI 归属，旧组不再显示它们。

### 6.2 组件与数据流

```
StorageSettings
  → tauri-bridge/ipc: storage_get_status()            # 读 locator + 各路径占用
  → tauri-bridge/ipc: storage_set_paths(patch)        # 校验并写 pending 或立即
  → tauri-bridge/ipc: storage_apply_now()             # 写 pending + 触发重启
  → tauri-bridge/ipc: storage_cancel_pending()
  → tauri-bridge/ipc: storage_scan_foreign(category)  # 预检外部文件（只读）
```

三端同步实现：`tauri-bridge`（→ Rust command）、`preview-bridge`（→ adl-server HTTP 端点）、`mock-bridge`（内存），遵守双端一致性规则。

### 6.3 日志默认落点（已定：L2 + 开发态覆盖）

**结论**：`logs` 默认跟随统一根目录 → `<root>/logs`。

**理由**：用户需求明确「所有非必须系统盘的数据都可自定义」，日志不属于「必须系统盘」；且现状存在两处日志目录（Tauri 壳 `setup.rs:51-53` 写 `<仓库根>/.adl-logs`，adl-server `engine.rs:16-22` 写 `<ai-digital-life>/.adl-logs`）且均取自编译期 `env!("CARGO_MANIFEST_DIR")`，打包后在安装机上不可靠。改为跟随 `<root>/logs` 既统一两处，又让生产路径正确、可迁移可清理。

**开发态保留**：debug 构建下提供一个环境变量覆盖（沿用 `ADL_CLI_LOG_MODE` 风格），使本地开发仍写仓库根 `.adl-logs`，现有调试文档与习惯不受影响。手动导出的 `debug-logs.txt` / `debug-logs-browser.txt` 属「导出动作」而非常驻数据，保持写仓库根不变。

### 6.4 分类提示信息与关联功能（需求补充：每类必须说明「存了什么 + 与什么有关」）

> 硬性要求：10 类中**每一类**都必须在 UI 中有详细、友好的说明，且若该数据与界面/功能有关联，必须额外点明关联对象，让用户清楚「动它会影响到什么」。

| 分类 | 提示文案要点（「这里存了什么」） | 关联的界面 / 功能（「与什么有关」） |
|---|---|---|
| `database` 主业务库 | 应用的核心数据库，保存工作区列表、会话、任务、审批记录、补丁与回滚信息、终端只读历史、剪贴板元数据、Git 可视化缓存等 | 左侧工作区导航器、会话与聊天面板、终端面板（只读历史区）、剪贴板历史、Git 可视化、检索/审批相关面板 |
| `downloads_db` 下载历史库 | 浏览器下载任务的记录（文件名、来源、时间、状态） | 内置浏览器的「下载」列表与管理 |
| `site_meta_db` 站点元缓存库 | 已访问网站的标题与图标（favicon）缓存，用于加速标签显示 | 内置浏览器标签页的标题与图标、历史/书签显示 |
| `config` 应用配置 | 应用设置（语言、主题、日志模式、终端预算、浏览器阈值、DSH 源等） | 设置面板全部设置项的持久化 |
| `clipboard` 剪贴板资源 | 剪贴板历史中的图片与缩略图文件 | 剪贴板历史面板的图片预览与回填 |
| `snapshot` 项目快照 | 补丁应用前的文件快照，用于回滚与差异比对 | 补丁预览/应用/回滚、差异查看器 |
| `dsh` DSH 版本与包 | DeepSeek Harness 的已下载版本与打包产物 | DSH 设置组的版本管理、运行 DSH |
| `logs` 日志 | 终端日志与调试日志文件，用于问题排查 | 调试工具（日志收起器、复制调试日志）、问题排查流程 |
| `credentials_fallback` 凭据回退文件 | 仅在操作系统凭据管理器不可用时，以加密文件形式保存的凭据 | 需要凭据的功能（如 CI 访问令牌、API Token）；**主凭据不在此**（见不可移动区） |
| `downloads_default` 默认下载目标 | 浏览器下载文件的默认保存目录（存的是**用户文件**，不是应用数据） | 内置浏览器下载行为的默认落点；**永不自动删除** |

**展示方式**：每行名称后 ⓘ 图标，Tooltip（短）与行内描述（长）两段文案并存；关联功能以「与…有关」句式给出，并在改变路径时于确认对话框中重复提示受影响的功能。

### 6.5 迁移确认对话框中的附加说明

改变某分类路径后，确认对话框除显示新旧路径、待迁移文件数/大小外，还须显示：

- 该分类的 ⓘ 说明（§6.4 同源文案）；
- 「关联功能」提示：例如改 `database` 时提示「工作区、会话、终端历史、剪贴板、Git 可视化等将切换到新位置」；
- 存在 `pendingMigration` 时的「下次启动迁移」提示与取消入口。

---

## 7. 迁移流程

### 7.1 单一执行路径

无论用户选择「立即」还是「下次启动」，真正的迁移**只在下次进程启动、DB 打开之前执行**（§3.3）。区别仅在于是否立刻重启进程。

### 7.2 用户时机选择（需求 2 + 澄清结论）

用户在「存储」组点「应用」后，弹出对话框：

- **立即迁移并重启**：写入 `pendingMigration` → 触发应用重启（浏览器/预览模式经 dev launcher 重启 adl-server 子进程）→ 重启时执行迁移。
- **下次启动时迁移**：仅写入 `pendingMigration`，当前运行不受影响（UI 显示「有待迁移的路径变更」横幅）。
- **可选勾选项「迁移后保留旧路径数据（不删除）」**：默认不勾选（见 §14-D3）。勾选后迁移仍会复制+校验并切换指针，但**跳过旧源清理**，旧文件原地保留供用户自行处置。
- 对话框同时展示 §6.4 该分类说明与关联功能提示、待迁移文件数/大小、外部文件保留说明。
- 提供「取消」；`storage_cancel_pending()` 可随时撤销待迁移。

### 7.3 迁移算法（`MigrationEngine`）

对每个发生变化的分类，执行：

1. **预检（Pre-flight）**——在「设置路径时」和「启动迁移前」各做一次：
   - 源 = 目标？→ 拒绝（无变化）。
   - 目标位于源内部？→ 拒绝（会造成自复制）。
   - 目标父目录可创建且可写？→ 否则报错。
   - 目标所在盘可用空间 ≥ 待迁移字节 + 安全余量（+10% 且至少 100 MB）？→ 否则报错。
   - 目标已存在本项目文件（非空）？→ 二次确认或拒绝（避免覆盖）。
   - 目标位于系统盘 → 仅**警告**不阻断（用户需求允许，但提示系统盘风险）。
2. **复制**：仅按 §5.2 白名单复制自有文件，保留相对结构。目标已存在的同名文件默认拒绝（除非是上次中断的同一批，见幂等）。
3. **校验**：文件数量一致；逐文件大小一致；SQLite 类附加 `PRAGMA quick_check`。
4. **切换指针**：更新 `storage-locator.json`（此时新路径生效）。
5. **清理旧源**：只删除白名单内自有文件；随后对每个旧目录 `remove_dir`（仅当已空）。
   - 若目录非空（含外部文件）：**保留目录**，记录到报告的 `keptDirs` + `foreignFiles`。
   - 若用户勾选了「保留旧路径数据」：跳过本步全部删除动作，报告中标记 `retained=true`。
6. **生成报告**：写入 `lastReport`（成功/失败、文件数、字节数、已删目录、保留目录及外部文件原因）。
7. **失败回滚**：任一步失败 → 不切换指针（保持旧路径可用）、不删除任何源文件、把 `pendingMigration` 标记为 `failed` 并附错误，**不再自动重试**（用户须在设置中「重试」或「取消」）。

### 7.4 幂等与中断安全

- 复制是幂等的：中断后重启，`pendingMigration` 仍在，重新执行时对已完整存在的目标文件跳过（按大小判定），完成后才切换指针。
- 指针切换是**原子**的最后一步，且清理在切换之后：即使清理中途崩溃，数据也已在新路径可用，旧源残留最多是冗余（下次启动可继续清理，或用户手动删除）。
- 源文件删除**只在**「复制+校验全部通过」之后发生。

### 7.5 外部文件处理（需求 4）

- 预检时通过 `storage_scan_foreign(category)` 列出各源目录中白名单之外的文件，在时机选择对话框中展示：「检测到 N 个不属于本应用的文件，迁移后将保留这些文件及其所在目录」。
- 迁移只复制/删除白名单文件；外部文件**永不被移动、永不被删除**；其所在目录因非空而**保留**。
- 报告明确列出保留的目录与外部文件名。

---

## 8. 双端一致性

| 能力 | Tauri 模式 | 浏览器/预览模式 |
|---|---|---|
| 查看路径与占用 | Rust command | adl-server 端点（同一 `StorageService` 逻辑） |
| 选择目录 | `workspace.pickDirectory()` 原生对话框 | 无原生对话框 → 仅手输 |
| 手输路径 | 支持 | 支持 |
| 修改路径 | 支持 | 支持 |
| 立即迁移 | 写 pending + 应用重启 | 写 pending + dev launcher 重启 adl-server 子进程 |
| 下次启动迁移 | 支持 | 支持（下次启动预览服务时执行） |
| 不移动项说明 | 展示 | 展示（同文案） |

- 新增 IPC 方法在 `tauri-bridge` / `preview-bridge` / `mock-bridge` **三端同步实现**（项目规则）。
- adl-server 增加对应 HTTP 端点，复用 `StorageService`，避免双份逻辑。

---

## 9. 错误处理与信息提示（需求 7）

### 9.1 提示分级

| 阶段 | 触发 | 呈现 |
|---|---|---|
| 预检失败 | 空间不足 / 不可写 / 目标在源内部 / 无变化 | 行内红色错误 + 明确原因与建议（如「请选择其它磁盘或释放 X MB」） |
| 预检警告 | 目标在系统盘 / 检测到外部文件 / 目标已有本项目数据 | 黄色警告 + 继续/取消 |
| 迁移进行 | 启动迁移 | 模态「正在迁移数据…」，显示当前分类、进度（已复制/总数） |
| 迁移成功 | 完成 | 成功横幅：已迁移 N 个文件 / 共 X MB；旧目录「已删除」或「因外部文件保留」 |
| 迁移失败 | 任一步失败 | 失败横幅 + `lastReport.error` 详情；说明「旧数据完好，可重试」 |
| 待迁移 | 存在 pendingMigration | 设置页顶部常驻横幅：「已安排下次启动迁移」+ 取消按钮 |
| 不可移项 | 始终 | 每项一句友好说明（见 §9.2） |

- 所有横幅**仅在活跃状态下可见**，不常驻空提示（项目规则）。
- 全部文案走 i18n（新增 `settings` 域或新 `storage` 域 key，中英对齐，`keys.test.ts` 自动校验）。

### 9.2 不可移项说明文案示例（i18n key）

- keyring：`凭据由操作系统凭据管理器安全保管，位置由系统决定，无需也无法自定义。`
- 机器身份：`该文件用于派生凭据加密密钥；若移动，已保存的凭据将无法解密，因此不可移动。`
- localStorage / IndexedDB：`由 WebView 按站点隔离存储，随应用整体管理，无独立路径。`
- WebView2：`由 WebView2 运行时自管，修改需重建整个浏览器环境。`
- 工作区缓存：`属于具体工作区，随工作区目录移动，不属于应用数据目录。`

---

## 10. 影响面清单（实施时需逐项改造的路径调用点）

| 落点 | 当前解析处 | 改造 |
|---|---|---|
| `data_dir` 根 | `src-tauri/src/setup.rs::resolve_data_dir`、`state.rs`、`main.rs` | 改为 `StorageService` 解析 |
| 主库 | `crates/server/src/engine.rs`、`crates/storage/src/connection.rs` | 传入解析后路径 |
| 下载库 | `src-tauri/src/setup.rs`、`crates/browser/src/download_manager.rs` | 同上 |
| 站点元库 | `crates/browser/src/site_meta_cache.rs`、`src-tauri/src/setup.rs` | 同上 |
| config | `crates/kernel/src/config.rs`、`config_watcher.rs` | 同上 |
| 剪贴板 | `crates/clipboard/src/store.rs` | 同上 |
| 快照 | `crates/change-engine/src/snapshot.rs` | 同上 |
| DSH | `crates/server/src/handlers/dsh.rs`、`crates/dsh-version`、`crates/dsh-bundle`、`crates/download-source` | 同上 |
| 日志 | `crates/adl-logging/src/manager.rs`、`crates/kernel/src/logger.rs`、`engine.rs::resolve_log_dir` | 同上（受 §6.3 决策） |
| 凭据回退文件 | `crates/credential/src/lib.rs` | 增加路径注入（keyring 主路径不动） |
| 默认下载目标 | `crates/browser/src/download_manager.rs::default_download_dir` | 读取设置值 |
| adl-server | `crates/server/src/bin/adl-server.rs`、`src-tauri/src/adl_server.rs` | `--data-dir` 由 locator 驱动 |
| 前端设置 | `kernel/types.ts` `SettingsGroupId`、`SettingsNav.tsx`、`SettingsPanel.tsx`、新建 `StorageSettings.tsx` | 新增组与组件 |
| 终端/浏览器设置 | `TerminalSettings.tsx`、`BrowserDownloadSettings.tsx` | 移除被搬入项 |

---

## 11. 测试计划（红绿测试）

| 层 | 测试 |
|---|---|
| Rust 单元 | `StorageService` 路径解析（unified / per_category / 默认回退）；白名单匹配（含 wal/shm、外部文件） |
| Rust 迁移 | 正常迁移；外部文件保留目录；目标空间不足 → 回滚且源完好；目标在源内部 → 拒绝；中断后幂等重跑；`quick_check` 失败 → 回滚 |
| Rust 不变量 | 断言各分类只写入白名单路径（§5.3） |
| Rust 集成 | `storage-locator.json` 读写与原子切换；`--data-dir` 由 locator 驱动 |
| 前端 | `StorageSettings` 模式切换、每类行渲染、搬入项显示、不可移区文案、时机对话框；**断言 10 类每类均有 ⓘ 说明与关联功能提示**（§6.4）；i18n 中英 key 对齐（`keys.test.ts`） |
| 双端 | 同一 `StorageService` 逻辑在 Tauri 与 adl-server 下解析结果一致 |
| 回归 | 终端历史预算、浏览器下载路径（已搬入）行为不变；现有 terminal/browser/migration 测试不回归 |

---

## 12. 风险与边界

| 风险 | 处理 |
|---|---|
| 目标目录已有本项目数据 → 覆盖 | 预检拒绝 + 二次确认 |
| 迁移中途崩溃/断电 | 幂等复制；指针原子切换置于清理之前 |
| 用户在系统盘设置路径 | 允许但显式警告（需求允许该情形） |
| 外部文件被误删 | 白名单 + 只删自有文件 + 非空目录保留 |
| 凭据加密文件移动后不可解密 | 仅移动回退文件（密钥派生自机器身份，与路径无关）；机器身份不可移 |
| 项目规则冲突（开发期禁止迁移代码） | 本迁移是**用户路径变更**的运行时功能，非版本兼容；已获用户明确要求（见 §1.1-2） |
| 用户误删 `storage-locator.json` → 回退默认目录 | UI 只读展示该文件并提示「请勿删除」；删除后应用回退默认目录，数据不会损坏（仅找不到自定义位置） |
| 立即迁移需重启 | 已与用户确认「用户手动选择」；对话框明确提示重启 |

---

## 13. 实施顺序（供后续 writing-plans 使用）

1. `StorageService` + locator 读写 + 路径解析（含默认回退），先不接任何消费方。
2. 逐类把 §10 的调用点切到 `StorageService`（按分类小步提交，保持现有默认行为不变）。
3. `MigrationEngine` + 白名单 + 预检 + 报告 + 回滚；Rust 单元/集成测试。
4. `storage_*` IPC + adl-server 端点 + 三端桥接。
5. `StorageSettings` UI + i18n + 时机对话框 + 搬运既有存储项。
6. 双端联调与回归；文档同步（含 `AGENTS.md` 存储说明与终端 spec §15.1 收敛）。

---

## 14. 决策点（已全部确认）

| 编号 | 决策 | 结论 |
|---|---|---|
| L | 日志默认落点 | **跟随统一根目录 `<root>/logs`**；debug 构建保留写仓库根 `.adl-logs` 的开发态覆盖开关（§6.3） |
| D1 | 统一模式是否把 3 个 DB 文件重组进子目录 | **否**，保持现状相对布局（§5.1） |
| D2 | 「每类独立」默认展开的分类集合 | **是，全部 10 类**，按「核心数据 / 高级」视觉分组；**每类必须有详细友好说明 + 关联功能提示**（§6.4） |
| D3 | 立即迁移前是否强制备份 | **否**；改为确认对话框可选「迁移后保留旧路径数据（不删除）」 |
| — | 索引文件位置 | 固定于系统配置目录 `<app_config_dir>/storage-locator.json`，UI 只读展示并提示「请勿删除」（§3.2/§6.1） |
| — | 「立即迁移」语义 | 写待迁移标记 + 自动重启；迁移统一在启动早期、DB 打开前执行（§3.3/§7.1） |

**全部决策已确认，可进入 writing-plans。**
