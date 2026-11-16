# Adlo · 项目设计标准

> **版本**：v3.1
>
> **说明**：本文件为项目架构真源之一，重大修改需同步评审。
>
> **同源 HTML 版**：[project-design-standard.html](./project-design-standard.html)（索引页，完整内容以本 Markdown 为准）

---

## 总览

| 统计项 | 数量 |
|--------|------|
| 核心决策项 | 6 |
| 宿主架构层级 | 4 |
| 关键风险对策 | 5 |

**核心公式**：桌面应用宿主（工作区 / 终端 / 编辑器 / 浏览器 / 存储 / 系统能力）= 当前完整形态。

---

## Section 01 · 核心决策

### 决策 01 · 架构风格（混合方案）

**选择**：分层宿主

主体采用分层架构保证清晰可控：UI → Bridge → Backend 命令 → Domain crates → 存储，层间单向依赖。

| 分层宿主 |
|----------|
| 层间单向依赖，结构清晰 |
| 上手快，调试方便 |
| 双端一致（四端桥接对齐） |

**为什么这样选**：分层保证宿主清晰可控、双端行为一致，避免职责混杂与“大泥球”。

---

### 决策 07 · 宿主数据存储（混合方案）

**选择**：SQLite + 文件 + storage-locator 统一解析

所有应用数据路径由 `adl-kernel::storage` 的 `StoragePaths` 统一解析，locator 文件记录指针；SQLite（rusqlite）存结构化状态（工作区、补丁快照索引、站点元数据、剪贴板等），文件存大体量内容（日志、运行时安装包）。路径变更走启动期迁移（复制 → 校验 → 切换指针 → 清理旧源），不做运行中热迁移。

| 存储 | 恢复 |
|------|------|
| SQLite 结构化状态 | locator 指针 + 启动期迁移 |
| 文件存归档/日志/安装包 | 失败不切换指针、不删源文件 |
| 统一根 / 每类独立两模式 | 设置面板存储组统一管理 |

**为什么这样选**：宿主数据以“可迁移、可解释”为先——locator 指针让数据目录整体可搬，分类路径让用户按需安置；迁移只在启动期、任何 DB/日志句柄打开前执行，从机制上避开“持有句柄搬文件”。

---

### 决策 10 · UI 组件风格（现行）

**选择**：设计感精致型

充足留白、卡片化布局、流畅动画过渡，视觉层次清晰，强调品牌感和体验愉悦感。

| 视觉原则 | 交互原则 |
|----------|----------|
| 充足留白，不过度拥挤 | 核心操作鼠标可达 |
| 卡片 + 圆角 + 柔和阴影 | 快捷键作为进阶效率 |
| 品牌色渐变点缀 | 微动画提升愉悦感 |

**为什么这样选**：桌面 App 的用户对视觉体验有预期（参考 Linear、Notion 标准），目前已有设计系统基础，继续精致化路线可以形成品牌识别。

> **说明**：精致化路线以审美与交互范式为先，借鉴精致桌面应用的视觉语言，不照搬外部组件实现。

---

### 决策 12 · 错误处理（现行）

**选择**：双端结构化错误（Rust Result + TS 归类）

Rust 侧 `Result<T, AppError>` 结构化传播（`ErrorKind` 全覆盖：存储/工作区/配置/IO/迁移/安全/审批/补丁/终端/超时/限流/认证/网络等），前端 `captureTypedError` 统一归类，结构化 JSONL 日志可追溯。不引入“统一 Error Channel 总线”。

| 错误分类 | 处理流程 |
|----------|----------|
| UserError（用户操作） | Result<T, AppError> 传播 |
| SystemError（系统异常） | captureTypedError 归类 |
| ExternalError（外部依赖） | 结构化 JSONL 日志 |

**为什么这样选**：对齐现有双端体系，遵循 `error-handling.md` 规则，不做“大爆炸”式重构。

---

### 决策 13 · 双端一致性（项目硬规则）

**选择**：Tauri 桌面 / 浏览器模式**功能行为一致**，实现策略可因环境而异

所有功能必须在 Tauri 桌面应用和浏览器模式中保持**功能行为一致**。由于两种模式的运行环境不同（Tauri 有 Rust 后端 + SQLite + 系统 API，浏览器仅有 WebView + Web API），实现策略可以因环境而异，通过统一接口抽象隔离差异。新增 IPC 方法必须同步实现 `tauri-bridge.ts` / `preview-bridge` / `mock-bridge`。

| 覆盖范围 | 实现约束 |
|----------|----------|
| UI 展示与交互一致 | tauri-bridge / preview-bridge / mock-bridge |
| IPC 桥接三端对齐 | 功能不能只在单一模式可用 |
| 功能双端可用 | WebView URL 变化不被动触发 Tauri |
| 存储后端可不同 | Tauri: SQLite/文件系统；浏览器: IndexedDB/localStorage |
| 系统能力可降级 | 浏览器模式无法使用的能力应有 Web API 替代 |

**为什么这样选**：这是项目治理硬规则（见 AGENTS.md 双端一致性）。浏览器预览承担高频开发与测试职能，若与桌面端行为不一致，将导致大量“仅桌面/仅浏览器”的隐性缺陷，也无法用浏览器自动化覆盖桌面场景。但两种环境的本质差异决定了某些功能的实现策略必须因环境而异，关键是通过统一接口确保功能行为一致。

---

### 决策 14 · 凭据与安全边界（项目硬规则）

**选择**：credential crate + capabilities 白名单

凭据只经 `crates/credential` 存储（keyring + 加密文件降级），WebView 不直接触达系统能力，通过 `#[tauri::command]` + capabilities 白名单暴露。

| 凭据管理 | 权限边界 |
|----------|----------|
| keyring 系统凭据库 | WebView 不直接访问系统能力 |
| 加密文件降级 | capabilities 白名单（禁通配） |
| 禁止写入配置/日志 | 敏感操作审批确认（ApprovalRequired） |

**为什么这样选**：项目治理硬规则（见 AGENTS.md 安全边界与禁止项）。权限思路落地为 capabilities 白名单（禁 `"all"` / `"**"` 通配）+ 敏感操作审批确认（`ApprovalRequired`）。

---

## Section 02 · 设计哲学与核心原则

### 轻量高效内核

- 分层清晰、内核轻量：宿主只做工作区/终端/编辑器/浏览器/存储，不背无关包袱
- 纯 SQLite 存储（JSONL 仅作调试日志）

### 完整功能体系

- 类型化错误分类：fromError() 归一化思路（对齐本项目 Result + captureTypedError）
- 精致 UI：审美与交互范式（非组件复用）

### 我们刻意不选的

- TUI 优先的极简 UI（不符合桌面用户预期）
- 纯 JSONL 存储（项目采用 SQLite，JSONL 仅作调试日志）
- Effect-TS 函数式编程（学习曲线陡）
- 单一 Error Channel 总线（实际为多通道类型化错误）

### 组合公式

```text
// 宿主主体（决定应用边界）
宿主 = 工作区管理 + 交互式终端 + 编辑器/预览/差异 + 内置浏览器 + 存储治理 + 系统能力

// 双端与质量（决定体验下限）
体验层 = Tauri/浏览器双端行为一致 + 设计 Token + i18n + 双端结构化错误

// 一句话总结
“专注的宿主” + “一致的双端体验” = “完整形态，不分阶段”
```

---

## Section 03 · 架构蓝图

> 四层宿主：UI 层 → 桥接层 → 后端命令层 → 存储层，每层职责明确。

### 专业视角

采用分层宿主架构。严格遵循层间单向依赖原则：**UI → Bridge → Backend Commands → Storage**。前端经四端桥接（tauri-bridge / preview-bridge / httpBridge / mock-bridge）调用统一 IPC，到达 Rust domain crates 或 adl-server（HTTP 路由，与 Tauri 壳共用领域逻辑）。关键契约（IPC 接口、共享类型）使用 TypeScript 类型作为单一真源（Rust→TS 自动生成）。

### 通俗视角

把系统想象成一家餐厅：

1. 顾客（用户）在前台（UI）点餐
2. 服务员（Bridge）把订单传给后厨
3. 后厨（Backend 命令 + domain crates）备菜、存档、记账
4. 冷库（Storage）存着食材和历史订单

### 四层架构图

> ⬇️ 依赖方向：上层依赖下层，下层不得依赖上层

**🎨 UI 表现层**
`React 组件` `设计系统 Token` `工作区/终端/编辑器/浏览器面板` `设置（含存储组）` `i18n`

**🌉 桥接层**
`Tauri Bridge (桌面)` `Preview Bridge (浏览器预览，http 优先可回退)` `HTTP Bridge (httpBridge，ad-server 基底)` `Mock Bridge (测试)` `IPC 契约统一`

**⚙️ 后端命令层**
`Tauri Commands / HTTP handlers` `Domain Crates（workspace/pty/browser/clipboard/credential/storage/change-engine…）` `结构化错误 (AppError)` `capabilities 白名单`

**💾 存储层**
`SQLite 状态（工作区/补丁快照索引/站点元数据/剪贴板…）` `文件（日志/安装包）` `storage-locator 指针` `启动期迁移`

---

## Section 04 · 宿主数据模型

> locator 指针 + SQLite 状态 + 文件归档的组合，这是宿主数据面的全貌。

### 专业视角

所有应用数据路径由 `adl-kernel::storage` 的 `StoragePaths` 统一解析，locator 文件（`<config_dir>/adlo/storage-locator.json`）记录指针，默认统一根为 `app_data_dir()`。SQLite 存结构化状态，文件存大体量内容；路径变更登记为 `pendingMigration`，在下次启动、任何 DB/日志句柄打开前执行迁移。

### 通俗视角

想象搬家公司 + 档案室：

- locator 是“新家地址卡”，所有东西按卡上的地址放
- SQLite 是档案柜：工作区清单、补丁快照索引、网站元数据、剪贴板各就各位
- 文件是仓库：日志、安装包放架子上
- 搬家（迁移）只在开门前进行：先复印、再验货、再换地址卡，最后清理旧家；验货失败就不换卡，旧家东西完好

### 存储布局

```text
<统一根>/
├── database            # 主 SQLite：工作区、补丁快照索引等结构化状态
├── downloads_db        # 浏览器下载记录库
├── site_meta_db        # 站点元数据缓存（favicon data-URI + 标题）
├── config              # 应用配置
├── clipboard           # 剪贴板历史
├── snapshot            # 补丁快照（原硬编码路径已收敛至此）
├── harnesses/          # 外部运行时版本目录
├── logs/               # 日志（debug 构建另写仓库根 .adl-logs）
└── credentials_fallback# keyring 不可用时的加密文件降级
```

- 可迁移 10 条（顺序与 `StorageCategory::key()` 一致）：`database`、`downloads_db`、`site_meta_db`、`tree_cache`、`config`、`clipboard`、`snapshot`、`harnesses`、`logs`、`credentials_fallback`；另有 1 设置值路径（`downloads_default`，仅记录不迁移）与不可移动项（keyring、机器身份、localStorage、IndexedDB、WebView2、工作区缓存）
- 迁移语义：按分类复制 → 校验（尺寸 + SQLite `PRAGMA quick_check`）→ 切换 locator 指针并落盘 → 清理旧源（base-aware 白名单，外部文件永不删除）；失败不切换指针、不删源、不自动重试
- 终端：一个终端标签可容纳多个窗格（各自独立 PTY 会话）；窗格为内存会话，不产生历史归档文件，应用重启后按标签恢复窗格结构/布局并逐窗格新建 shell

---

## Section 05 · 关键风险与应对

### 风险 01 · 结构化错误对齐

现有前端已实现 captureTypedError 体系（Zustand slice 中显式捕获），Rust 侧已有 `Result<T, AppError>` 结构化错误。双端如何归类对齐？

**✅ 应对策略**

1. 不引入“统一 Error Channel 总线”，对齐现有双端体系
2. Rust 侧：`Result<T, AppError>` 结构化传播，`ErrorKind` 全覆盖分类
3. 前端：captureTypedError 统一归类 + 结构化 JSONL 日志
4. 新增模块沿用现有模式，不做“大爆炸”式重构

### 风险 02 · 存储迁移丢数据

路径变更涉及搬运 SQLite 与大文件：中途失败、句柄占用、目标不可写都可能丢数据或留双份。

**✅ 应对策略**

1. 只在启动期、任何 DB/日志句柄打开前迁移，不做运行中热迁移
2. 按分类复制 → 校验（尺寸 + `PRAGMA quick_check`）→ 切换指针 → 清理旧源
3. 失败不切换指针、不删源文件、不自动重试，等用户在设置中重试或取消
4. 清理用 base-aware 白名单，外部文件永不删除；预检用 `.adl-write-probe` 探测目标可写性

### 风险 03 · 设计感 UI + Tauri 双端一致性

浏览器预览（Chromium）和 Tauri 桌面（WebView2）的渲染引擎差异、系统字体差异、DPI 缩放差异，可能导致精致 UI 在 WebView2 中“看起来不精致”（字体发虚、动画掉帧、颜色偏差）。WebView2 为 OS 级渲染表面，CSS z-index 无法覆盖。

**✅ 应对策略**

1. 设计 Token 必须抽象：颜色、字号、间距全部用 CSS 变量，平台层覆盖
2. 字体栈优先用 Web Font（Inter / HarmonyOS Sans），不依赖系统字体
3. 关键组件建立“双端验证清单”，每次修改后人工确认两端表现一致
4. 浮动层出现时经 `browser_set_bounds` 移出 WebView（State + MutationObserver 双路检测）；面板 Resize Handle 用“区域逃逸”（向左扩展 8px 进无 WebView 区）
5. 启用 CSS `will-change` + `transform` 动画，避免重排导致的掉帧

### 风险 04 · 凭据管理 + 权限门禁误放

WebView 若绕过 Tauri Command 直接触达系统能力，或 capabilities 使用通配权限，将破坏安全边界；凭据若落入普通配置或日志，会造成泄露。

**✅ 应对策略**

1. 凭据只经 `crates/credential` 存储（keyring + 加密文件降级）
2. capabilities 白名单禁止 `"all"` / `"**"` 通配，新增命令必须登记
3. 敏感操作走审批确认（`ApprovalRequired`）
4. 日志中凭据脱敏，禁止明文打印

---

## Section 06 · 完整形态

> 当前实现即完整形态。范围边界以 `phase-boundary.md` 规则为准，功能清单真源见 `adlo/AGENTS.md`。

- ✅ Tauri 桌面壳 + SQLite 状态 + 安全边界（capability 白名单）+ 双端一致（四端桥接）
- ✅ 工作区管理、文件树、大纲解析、搜索、Git 可视化、补丁预览/应用/回滚、快照
- ✅ xterm.js 交互式终端（多会话 PTY）+ 一个终端标签多终端窗口（独立 PTY、均分/自由布局引擎、自定义布局卡片）
- ✅ CodeMirror 编辑器 + 文件预览 + 差异查看器
- ✅ 内置浏览器（WebView / iframe 双模式、标签/书签/历史/下载、站点元数据缓存）
- ✅ 存储治理（统一路径解析 + 启动期迁移 + 设置面板存储组）
- ✅ 系统能力（剪贴板历史、系统监视器、CI 状态、GitHub 面板、凭据存储）
- ✅ 设计 Token + 自定义 Tooltip/滚动条 + i18n（25 领域）

---

## 📝 本标准的使用说明

- **✅ 当做决策时的依据**：遇到“要不要做 X？怎么做 X？”的问题时，先查对应决策项，按标准走。
- **⚖️ 标准冲突时的优先级**：本标准 > 现有代码习惯 > 外部参考实现。即“先按自己定的规矩来”。
- **🔄 修订机制**：遇到标准覆盖不到的新场景，按同样的“对比两方案优缺点 → 选一个 → 记录理由”流程补充本标准，不允许拍脑袋决定。
- **🔒 冻结项**：现行决策（01/07/10/12/13/14）为宿主架构依据，其中 13–14 为项目硬规则，任何时候不得放宽。

---

*Adlo · 项目设计标准 v3.1 · 本文件为项目架构真源之一，重大修改需同步评审*
