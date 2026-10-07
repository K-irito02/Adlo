# AI 数字生命 · 项目设计标准

> **版本**：v3.0
>
> **说明**：v3.0 剥离已失效的自研 Agent 体系表述——Agent 对话、模型接入与编排交由第三方 harness（当前为 deepseek dsh）提供，本仓库仅做宿主集成；取消分阶段规划，当前实现即完整形态（桌面应用宿主 + 第三方 harness 集成）。自研 Agent 相关决策（02/03/04/05/06/08/09/11）标退役存档，仅保留决策记录；现行决策改写对齐宿主现状。本文件为项目架构真源之一，重大修改需同步评审。
>
> **生成/升版时间**：2026-09-17
>
> **同源 HTML 版**：[project-design-standard.html](./project-design-standard.html)（渲染展示用，内容与此 Markdown 同步）

---

## 总览

| 统计项 | 数量 |
|--------|------|
| 核心决策项 | 14（现行 6 + 退役存档 8） |
| 宿主架构层级 | 4 + 外部 harness 进程 |
| 关键风险对策 | 5 |

**核心公式**："桌面应用宿主（工作区 / 终端 / 编辑器 / 浏览器 / 存储 / 系统能力）" + "第三方 harness 的 Agent 能力" = 当前即完整形态，不分阶段。

---

## Section 01 · 14 项核心决策矩阵

> 现行决策（01/07/10/12/13/14）描述宿主现状；退役决策（02/03/04/05/06/08/09/11）仅保留决策记录，其"已落地"表述已失效——自研 Agent 体系随 dsh 剥离删除，能力由第三方 harness 提供。凡属自研抽象均已明确标注。

### 决策 01 · 架构风格（混合方案，现行）

**选择**：分层宿主 + 第三方 harness 集成

主体采用分层架构保证清晰可控：UI → Bridge → Backend 命令 → Domain crates → 存储，层间单向依赖。Agent 对话、模型接入与编排不由本仓库实现，宿主通过第三方 harness 集成提供 Agent 能力（当前为 deepseek dsh：`crates/webapp-host` 进程托管、`dsh-bundle` / `dsh-version` 版本管理、`download-source` 下载源/镜像、中间区宿主渲染）。

| 分层宿主 | harness 集成 |
|----------|--------------|
| 层间单向依赖，结构清晰 | Agent 能力由外部 harness 提供 |
| 上手快，调试方便 | 本仓库仅负责进程托管与宿主渲染 |
| 双端一致（三桥接对齐） | 换 harness 不改宿主主体 |

**为什么这样选**：分层保证宿主清晰可控、双端行为一致；Agent 体系自研成本高且与宿主正交，交由专业第三方 harness（deepseek dsh）提供，宿主只保留集成面（拉起、版本、渲染），避免"大泥球"。

---

### 决策 02 · Agent 设计（⛔ 已退役·存档）

> **退役原因**：自研 Agent 体系已随 dsh 剥离删除（状态持有 + 事件订阅式 Agent 不再由本仓库实现）。Agent 对话与编排能力由第三方 harness（当前为 deepseek dsh）提供，本仓库仅做宿主集成。以下为历史决策记录，不作为实现依据。

原选择（历史）：状态持有 + 事件订阅——Agent 持有 state（messages + 上下文），通过 `subscribe()` 对外通知，状态由事件驱动更新。

---

### 决策 03 · 会话管理（⛔ 已退役·存档）

> **退役原因**：上下文 Epoch（自研抽象）随 Agent 会话体系一并剥离，`session/agent/provider/command/compaction/sessionFork` 前端领域已删除（见 `StoreState.ts`）。长会话管理由第三方 harness 负责。以下为历史决策记录，不作为实现依据。

原选择（历史）：上下文 Epoch（自研抽象）——以一次 Prompt→Response 周期为会话逻辑单元。

---

### 决策 04 · 工具系统（⛔ 已退役·存档）

> **退役原因**：`ToolRegistry` 及 Agent 工具注册体系已从 Rust/前端实现中移除，不再由本仓库提供。以下为历史决策记录，不作为实现依据。

原选择（历史）：注册中心 + 运行时参数校验——通过工具注册中心动态注册工具，参数 Schema 运行时校验（本项目 Rust 侧用类型化结构体 + serde）。

---

### 决策 05 · 扩展机制（⛔ 已退役·存档）

> **退役原因**：Rust 层 Agent 生命周期钩子（目标态）不再建设——其依附的 Agent 体系已剥离。宿主扩展点为新增 Tauri Command / capability / 存储分类（须遵循对应规则）。以下为历史决策记录，不作为实现依据。

原选择（历史）：Rust 层生命周期钩子（目标态）——以 Rust trait + hooks 链监听 Agent 全生命周期事件。

---

### 决策 06 · 模型集成（⛔ 已退役·存档）

> **退役原因**：`crates/model-gateway`、`ProviderRegistry`、(provider, model) 对路由、SSE 流式传输、`ProviderManager` / `ModelPicker` UI 已全部从实现中移除（`RightPanel` 测试断言其不被引用）。模型接入由第三方 harness 提供，本仓库不做内置模型管理。以下为历史决策记录，不作为实现依据。

原选择（历史）：动态 Provider 注册——配置文件声明 Provider，运行时动态加载实例，`ProviderRegistry` 管理 + 动态模型获取。

---

### 决策 07 · 宿主数据存储（混合方案，现行）

**选择**：SQLite + 文件 + storage-locator 统一解析

所有应用数据路径由 `adl-kernel::storage` 的 `StoragePaths` 统一解析，locator 文件记录指针；SQLite（rusqlite）存结构化状态（工作区、补丁快照索引、站点元数据、剪贴板等），文件存大体量内容（终端历史归档、日志、dsh bundle）。路径变更走启动期迁移（复制 → 校验 → 切换指针 → 清理旧源），不做运行中热迁移。

| 存储 | 恢复 |
|------|------|
| SQLite 结构化状态 | locator 指针 + 启动期迁移 |
| 文件存归档/日志/bundle | 失败不切换指针、不删源文件 |
| 统一根 / 每类独立两模式 | 设置面板存储组统一管理 |

**为什么这样选**：宿主数据以"可迁移、可解释"为先——locator 指针让数据目录整体可搬，分类路径让用户按需安置；迁移只在启动期、任何 DB/日志句柄打开前执行，从机制上避开"持有句柄搬文件"。

> ⚠️ **版本说明**：原"SQLite 介质 + 事件流逻辑抽象（fold 归约）/ Epoch 分组"已随 Agent 会话体系退役，不再作为宿主存储模型。

---

### 决策 08 · 压缩策略（⛔ 已退役·存档）

> **退役原因**：`PRUNE_MINIMUM` / `PRUNE_PROTECT` 自动阈值压缩随 Agent 会话体系一并移除，代码中已无残留。长会话压缩由第三方 harness 负责。以下为历史决策记录，不作为实现依据。

原选择（历史）：自动阈值触发——超过 token 阈值自动压缩早期内容，保留最近 N 轮 turn + 保护区 token。

---

### 决策 09 · 会话分支（⛔ 已退役·存档）

> **退役原因**：`session_fork` 命令、`forkSession` / `listSessionForks` IPC 与前端 Fork UI 已全部移除，代码中已无残留。会话分支能力（如需）由第三方 harness 提供。以下为历史决策记录，不作为实现依据。

原选择（历史）：原生 Fork（DAG / 树结构）——任意会话点创建分支，子分支继承父上下文（append-only 树结构）。

---

### 决策 10 · UI 组件风格（现行）

**选择**：设计感精致型

充足留白、卡片化布局、流畅动画过渡，视觉层次清晰，强调品牌感和体验愉悦感。

> ✅ **已落地**：CSS 设计 Token（亮暗主题）+ 自定义 Tooltip/滚动条 + i18n（22 领域）。

| 视觉原则 | 交互原则 |
|----------|----------|
| 充足留白，不过度拥挤 | 核心操作鼠标可达 |
| 卡片 + 圆角 + 柔和阴影 | 快捷键作为进阶效率 |
| 品牌色渐变点缀 | 微动画提升愉悦感 |

**为什么这样选**：桌面 App 的用户对视觉体验有预期（参考 Linear、Notion 标准），目前已有设计系统基础，继续精致化路线可以形成品牌识别。

> ⚠️ **说明**：精致化路线以审美与交互范式为先，借鉴精致桌面应用的视觉语言，不照搬外部组件实现。

---

### 决策 11 · 热重载能力（⛔ 已退役·存档）

> **退役原因**：Hot Reloadable Config（配置热重载）随 Agent 配置体系一并移除，代码中已无残留。宿主配置变更经设置面板落盘，需要重启生效的项由 UI 明确提示。以下为历史决策记录，不作为实现依据。

原选择（历史）：配置级热重载——配置、Provider 配置、Skill 文件变更即时生效，代码级热重载明确不承诺。

---

### 决策 12 · 错误处理（现行）

**选择**：双端结构化错误（Rust Result + TS 归类）

Rust 侧 `Result<T, AppError>` 结构化传播（`ErrorKind` 全覆盖：存储/工作区/配置/IO/迁移/安全/审批/补丁/终端/模型/超时/限流/认证/网络等），前端 `captureTypedError` 统一归类，结构化 JSONL 日志可追溯。**不再引入"统一 Error Channel 总线"**。

| 错误分类 | 处理流程 |
|----------|----------|
| UserError（用户操作） | Result<T, AppError> 传播 |
| SystemError（系统异常） | captureTypedError 归类 |
| ExternalError（外部依赖：harness 进程/网络/下载源） | 结构化 JSONL 日志 |

**为什么这样选**：

> ⚠️ **版本说明**：v1.0 主张"统一 Error Channel 总线"系夸大——实际落地是多通道类型化错误，经多条通道流动，并非单一总线。本项目对齐现有体系：Rust Result + TS captureTypedError，遵循 `error-handling.md` 规则，不做"大爆炸"式重构。

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

**为什么这样选**：这是项目治理硬规则（见 AGENTS.md 双端一致性）。浏览器预览承担高频开发与测试职能，若与桌面端行为不一致，将导致大量"仅桌面/仅浏览器"的隐性缺陷，也无法用浏览器自动化覆盖桌面场景。但两种环境的本质差异（系统 API vs Web API、SQLite vs IndexedDB）决定了某些功能的实现策略必须因环境而异，关键是通过统一接口确保功能行为一致。

---

### 决策 14 · 凭据与安全边界（项目硬规则）

**选择**：credential crate + capabilities 白名单

凭据只经 `crates/credential` 存储（keyring + 加密文件降级），WebView 不直接触达系统能力，通过 `#[tauri::command]` + capabilities 白名单暴露。

| 凭据管理 | 权限边界 |
|----------|----------|
| keyring 系统凭据库 | WebView 不直接访问系统能力 |
| 加密文件降级 | capabilities 白名单（禁通配） |
| 禁止写入配置/日志 | 敏感操作审批确认（ApprovalRequired） |

**为什么这样选**：项目治理硬规则（见 AGENTS.md 安全边界与禁止项）。权限思路落地为 capabilities 白名单（禁 `"all"` / `"**"` 通配）+ 敏感操作审批确认（`ApprovalRequired`），Agent 侧 Ruleset 已随 Agent 体系退役。

---

## Section 02 · 设计哲学与核心原则

> 以下原则中，Agent 体系相关借鉴已随自研 Agent 剥离退役；仅保留对宿主仍有指导意义的部分。

### 轻量高效内核（历史借鉴）

**仍有效的：**

- 分层清晰、内核轻量：宿主只做工作区/终端/编辑器/浏览器/存储，不背 Agent 包袱
- 纯 SQLite 存储（JSONL 仅作调试日志）

**已退役的（随 Agent 体系剥离）：**

- 状态驱动 Agent、事件订阅扩展（33 个生命周期事件）
- 工具注册中心（ToolRegistry）、原生 Fork、自动阈值压缩

**我们刻意不选的：**

- TUI 优先的极简 UI（不符合桌面用户预期）
- 纯 JSONL 存储（项目采用 SQLite，JSONL 仅作调试日志）

### 完整功能体系（历史借鉴）

**仍有效的：**

- 类型化错误分类：fromError() 归一化思路（对齐本项目 Result + captureTypedError）
- 精致 UI：审美与交互范式（非组件复用）

**已退役的（随 Agent 体系剥离）：**

- 动态 Provider 注册（Provider.Service）、自动阈值压缩、Ruleset 权限、配置热重载

**我们刻意不选的：**

- Effect-TS 函数式编程（学习曲线陡）
- 代码级热重载（不承诺）
- 单一 Error Channel 总线（实际为多通道类型化错误）

### 🎯 组合公式

```text
// 宿主主体（决定应用边界）
宿主 = 工作区管理 + 交互式终端 + 编辑器/预览/差异 + 内置浏览器 + 存储治理 + 系统能力

// Agent 能力（决定智能上限，由外部提供）
智能层 = 第三方 harness（当前为 deepseek dsh：进程托管 + 版本管理 + 宿主渲染）

// 双端与质量（决定体验下限）
体验层 = Tauri/浏览器双端行为一致 + 设计 Token + i18n + 双端结构化错误

// 一句话总结
"专注的宿主" + "专业的 harness" = "完整形态，不分阶段"
```

---

## Section 03 · 架构蓝图

> 四层宿主：UI 层 → 桥接层 → 后端命令层 → 存储层，每层职责明确；第三方 harness 作为外部进程由宿主拉起与渲染，不在层内。

### 👨‍💻 专业视角

采用分层宿主架构。严格遵循层间单向依赖原则：**UI → Bridge → Backend Commands → Storage**。前端经三桥接（tauri-bridge / preview-bridge / mock-bridge）调用统一 IPC，经 `#[tauri::command]`（桌面）或 HTTP（浏览器预览）到达 Rust domain crates。第三方 harness（deepseek dsh）为外部进程：`webapp-host` 负责拉起与健康检查，`dsh-bundle` / `dsh-version` 管版本，中间区负责渲染（Tauri 独立 WebView2 子窗口 / 浏览器 iframe）。关键契约（IPC 接口、共享类型）使用 TypeScript 类型作为单一真源（Rust→TS 自动生成）。

### 🧑 通俗视角

把系统想象成一家餐厅 + 外请主厨：

1. 顾客（用户）在前台（UI）点餐
2. 服务员（Bridge）把订单传给后厨
3. 后厨（Backend 命令 + domain crates）备菜、存档、记账
4. 冷库（Storage）存着食材和历史订单
5. 主厨（第三方 harness，外请）只管做"智能菜"，上菜口（中间区渲染）由餐厅提供

想换主厨？不用装修餐厅，换个外请团队就行。

### 四层架构图

> ⬇️ 依赖方向：上层依赖下层，下层不得依赖上层

**🎨 UI 表现层**
`React 组件` `设计系统 Token` `工作区/终端/编辑器/浏览器面板` `设置（含存储组/dsh 设置）` `i18n`

**🌉 桥接层**
`Tauri Bridge (桌面)` `Preview Bridge (浏览器)` `Mock Bridge (测试)` `IPC 契约统一`

**⚙️ 后端命令层**
`Tauri Commands / HTTP handlers` `Domain Crates（workspace/command/pty/browser/clipboard/credential/storage…）` `结构化错误 (AppError)` `capabilities 白名单`

**💾 存储层**
`SQLite 状态（工作区/补丁快照索引/站点元数据/剪贴板…）` `文件（终端历史归档/日志/dsh bundle）` `storage-locator 指针` `启动期迁移`

**🤖 外部 harness（非层内，宿主集成）**
`webapp-host 拉起 + 健康检查` `dsh-bundle 内嵌版本` `dsh-version 系统版本检测/升级回退` `download-source 下载源/镜像` `中间区宿主渲染`

### 🔌 宿主集成点（harness 相关）

**🧩 进程托管**

- `webapp-host` 拉起 dsh 进程，就绪探测 + 失败重试 + `.cmd` 回退（Windows）
- Tauri 独立 WebView2 子窗口承载，`browser_set_bounds` 跟随布局

**📦 版本管理**

- 内嵌版本（`dsh-bundle`：manifest + package 校验）与系统版本（PATH 检测）双源
- 查最新 / 升级 / 回退 / 卸载（npm registry + 可配镜像）

**🖥️ 宿主渲染**

- 浏览器模式：iframe + 加载失败时外部打开兜底
- 右面板遮挡时经 State + MutationObserver 协同隐藏 WebView（WebView2 为 OS 级表面，不可用 z-index 覆盖）

---

## Section 04 · 宿主数据模型

> locator 指针 + SQLite 状态 + 文件归档的组合，这是宿主数据面的全貌。原"事件流 + Epoch + 会话树"模型已随 Agent 会话体系退役（见决策 03/07/09 存档）。

### 👨‍💻 专业视角

所有应用数据路径由 `adl-kernel::storage` 的 `StoragePaths` 统一解析，locator 文件（`<config_dir>/ai-digital-life/storage-locator.json`）记录指针，默认统一根为 `app_data_dir()`。SQLite 存结构化状态，文件存大体量内容；路径变更登记为 `pendingMigration`，在下次启动、任何 DB/日志句柄打开前执行迁移。

### 🧑 通俗视角

想象搬家公司 + 档案室：

- locator 是"新家地址卡"，所有东西按卡上的地址放
- SQLite 是档案柜：工作区清单、补丁快照索引、网站元数据、剪贴板各就各位
- 文件是仓库：终端历史归档、日志、dsh 安装包放架子上
- 搬家（迁移）只在开门前进行：先复印、再验货、再换地址卡，最后清理旧家；验货失败就不换卡，旧家东西完好

### 📦 存储布局

```text
<统一根>/
├── database            # 主 SQLite：工作区、补丁快照索引等结构化状态
├── downloads_db        # 浏览器下载记录库
├── site_meta_db        # 站点元数据缓存（favicon data-URI + 标题）
├── config              # 应用配置
├── clipboard           # 剪贴板历史
├── snapshot            # 补丁快照（原硬编码路径已收敛至此）
├── dsh/                # dsh 相关
│   ├── dsh-bundle/     # 内嵌版本（manifest.json + package/ + version.txt）
│   └── …               # 版本管理数据
├── logs/               # 日志（debug 构建另写仓库根 .adl-logs）
└── credentials_fallback# keyring 不可用时的加密文件降级
```

- 可迁移 9 分类（顺序与 `StorageCategory::key()` 一致）：`database`、`downloads_db`、`site_meta_db`、`config`、`clipboard`、`snapshot`、`dsh`、`logs`、`credentials_fallback`；另有 1 设置值路径（`downloads_default`，仅记录不迁移）与不可移动项（keyring、机器身份、localStorage、IndexedDB、WebView2、工作区缓存）
- 迁移语义：按分类复制 → 校验（尺寸 + SQLite `PRAGMA quick_check`）→ 切换 locator 指针并落盘 → 清理旧源（base-aware 白名单，外部文件永不删除）；失败不切换指针、不删源、不自动重试
- 终端历史：会话结束即定稿归档，按标签累积跨重启保留，超磁盘预算时最旧优先整段淘汰（始终保留最近 20 段）

---

## Section 05 · 关键风险与应对

> 宿主 + 外部 harness 形态下的主要风险。原 Agent 体系风险（事件树/压缩/钩子/Provider token）已随退役失效，不再列出。

### 风险 01 · dsh 宿主进程托管可靠性

dsh 为外部进程：拉起失败、端口占用、版本不匹配、进程意外退出都会让中间区无内容可渲染。

**✅ 应对策略**

1. `webapp-host` 拉起后做就绪探测，失败重试；Windows 下先直调、失败回退 `.cmd`
2. 系统 dsh 与内嵌 bundle 双源：优先可用源，检测经缓存避免重复探测
3. 版本管理支持查最新 / 升级 / 回退 / 卸载，升级失败保留旧版可用
4. 浏览器模式 iframe 加载被拒（X-Frame-Options / CSP）时退化为"外部打开"按钮

### 风险 02 · 结构化错误 vs 现有 captureTypedError

现有前端已实现 captureTypedError 体系（Zustand slice 中显式捕获），Rust 侧已有 `Result<T, AppError>` 结构化错误。双端如何归类对齐？

**✅ 应对策略**

1. 不引入"统一 Error Channel 总线"，对齐现有双端体系
2. Rust 侧：`Result<T, AppError>` 结构化传播，`ErrorKind` 全覆盖分类
3. 前端：captureTypedError 统一归类 + 结构化 JSONL 日志
4. 新增模块沿用现有模式，不做"大爆炸"式重构

### 风险 03 · 存储迁移丢数据

路径变更涉及搬运 SQLite 与大文件：中途失败、句柄占用、目标不可写都可能丢数据或留双份。

**✅ 应对策略**

1. 只在启动期、任何 DB/日志句柄打开前迁移，不做运行中热迁移
2. 按分类复制 → 校验（尺寸 + `PRAGMA quick_check`）→ 切换指针 → 清理旧源
3. 失败不切换指针、不删源文件、不自动重试，等用户在设置中重试或取消
4. 清理用 base-aware 白名单，外部文件永不删除；预检用 `.adl-write-probe` 探测目标可写性

### 风险 04 · 设计感 UI + Tauri 双端一致性

浏览器预览（Chromium）和 Tauri 桌面（WebView2）的渲染引擎差异、系统字体差异、DPI 缩放差异，可能导致精致 UI 在 WebView2 中"看起来不精致"（字体发虚、动画掉帧、颜色偏差）。WebView2 为 OS 级渲染表面，CSS z-index 无法覆盖。

**✅ 应对策略**

1. 设计 Token 必须抽象：颜色、字号、间距全部用 CSS 变量，平台层覆盖
2. 字体栈优先用 Web Font（Inter / HarmonyOS Sans），不依赖系统字体
3. 关键组件建立"双端验证清单"，每次修改后人工确认两端表现一致
4. 浮动层出现时经 `browser_set_bounds` 移出 WebView（State + MutationObserver 双路检测）；面板 Resize Handle 用"区域逃逸"（向左扩展 8px 进无 WebView 区）
5. 启用 CSS `will-change` + `transform` 动画，避免重排导致的掉帧

### 风险 05 · 凭据管理 + 权限门禁误放

WebView 若绕过 Tauri Command 直接触达系统能力，或 capabilities 使用通配权限，将破坏安全边界；凭据若落入普通配置或日志，会造成泄露。

**✅ 应对策略**

1. 凭据只经 `crates/credential` 存储（keyring + 加密文件降级）
2. capabilities 白名单禁止 `"all"` / `"**"` 通配，新增命令必须登记
3. 敏感操作走审批确认（`ApprovalRequired`）
4. 日志中凭据脱敏，禁止明文打印

---

## Section 06 · 项目形态（完整形态，不分阶段）

> 本项目不做分阶段规划，当前实现即所规划的完整形态：**桌面应用宿主 + 第三方 Agent harness 集成**。范围边界与排除项以 `phase-boundary.md` 规则为准，功能清单真源见 `ai-digital-life/AGENTS.md`。

### ✅ 已实现（完整形态）

- ✅ Tauri 桌面壳 + SQLite 状态 + 安全边界（capability 白名单）+ 双端一致（三桥接）
- ✅ 工作区管理、文件树、大纲解析、搜索、Git 可视化、补丁预览/应用/回滚、快照
- ✅ xterm.js 交互式终端（多会话 PTY）+ 一个终端标签多终端窗口（独立 PTY、均分/自由布局引擎、自定义布局卡片）
- ✅ CodeMirror 编辑器 + 文件预览 + 差异查看器
- ✅ 内置浏览器（WebView / iframe 双模式、标签/书签/历史/下载、站点元数据缓存）
- ✅ 第三方 harness 宿主集成（进程托管、内嵌与系统版本管理、下载源/镜像、宿主渲染）
- ✅ 存储治理（统一路径解析 + 启动期迁移 + 设置面板存储组）
- ✅ 系统能力（剪贴板历史、系统监视器、CI 状态、GitHub 面板、凭据存储）
- ✅ 设计 Token + 自定义 Tooltip/滚动条 + i18n（22 领域）

### ⛔ 本仓库不实现（由第三方 harness 或未立项）

- 内置 Agent / 多 Agent 编排、内置模型接入 / Provider 管理、Compaction / Session Fork / 自定义命令 / 权限 Ruleset / Custom Agent 等 Agent 配套能力——由第三方 harness 提供
- 插件市场、浏览器自动化运行时、复杂云协作 / ACP / HTTP API / CodeMode——未来想法，未立项

---

## 📝 本标准的使用说明

- **✅ 当做决策时的依据**：遇到"要不要做 X？怎么做 X？"的问题时，先查对应决策项，按标准走。
- **⚖️ 标准冲突时的优先级**：本标准 > 现有代码习惯 > 外部参考实现。即"先按自己定的规矩来"。
- **🔄 修订机制**：遇到标准覆盖不到的新场景，按同样的"对比两方案优缺点 → 选一个 → 记录理由"流程补充本标准，不允许拍脑袋决定。
- **🔒 冻结项**：现行决策（01/07/10/12/13/14）为宿主架构依据，其中 13–14 为项目硬规则，任何时候不得放宽。退役决策（02/03/04/05/06/08/09/11）仅为历史存档，不作为决策依据。频繁推翻架构是最大的开发杀手。

---

*AI 数字生命 · 项目设计标准 v3.0 · 自研 Agent 体系剥离 + 完整形态对齐（2026-09-17）· 本文件为项目架构真源之一，重大修改需同步评审*
