# AI 数字生命 · 项目设计标准

> **版本**：v2.0
>
> **说明**：基于 Pi × OpenCode 源码核对 + 现状对齐修订。v1.0 的 8 处引用偏差已修正，新增决策 13/14。本文件为项目架构真源之一，重大修改需同步评审。
>
> **生成/升版时间**：2026-08-05
>
> **同源 HTML 版**：[project-design-standard.html](./project-design-standard.html)（渲染展示用，内容与此 Markdown 同步）

---

## 参考项目（用于后续参考、借鉴源码）

本标准的决策参照以下两个 MIT 许可开源项目，本地副本位于仓库 `references/` 下，供开发过程中查阅源码、借鉴设计模式与复用代码片段。

| 项目 | GitHub 仓库 | 本地路径 | 说明 |
|------|------------|----------|------|
| **OpenCode** | <https://github.com/anomalyco/opencode> | [`references/opencode/`](../../references/opencode/) | 完整功能体系、精致交互（会话 Part 体系、Provider.Service、Effect 类型化错误、Ruleset 权限） |
| **Pi** | <https://github.com/earendil-works/pi> | [`references/pi/`](../../references/pi/) | 轻量高效内核（状态持有 + 事件订阅 Agent、ToolRegistry 工具注册、append-only 树形 Fork、自动阈值压缩） |

> **说明**：
>
> - 两项目均为 **MIT** 许可。参考代码直接复用需遵守 MIT 许可要求，并在代码注释中标注来源。
> - OpenCode 源码地图：[`docs/analysis/opencode/`](../../docs/analysis/opencode/)
> - 查询、检索代码时优先使用 CodeGraph 知识图谱（三项目均有本地 `.codegraph/`，SQLite），详见技能 [`codegraph-knowledge-graph`](../../.opencode/skills/codegraph-knowledge-graph/SKILL.md)。

---

## 总览

| 统计项 | 数量 |
|--------|------|
| 核心决策项 | 14 |
| 架构层级 | 5 |
| 关键风险对策 | 7 |
| 演化阶段 | 3 |

**核心公式**："Pi 的轻量骨架" + "OpenCode 的功能血肉" = "可控、可扩展、体验好"的编码代理。

---

## Section 01 · 14 项核心决策矩阵

> 每一项决策均对照 Pi 与 OpenCode 真实源码核对，并结合项目现状修订。凡属自研抽象均已明确标注。

### 决策 01 · 架构风格（混合方案）

**选择**：分层主体 + 关键模块插件化

主体采用分层架构保证清晰可控，关键扩展点（模型 Provider、外部工具、自定义 Agent）采用插件化。插件化在 Rust 内核层通过 trait + registry 落地，前端仅通过 IPC 消费能力，双端一致。

| 分层架构 | 插件化模块 |
|----------|-----------|
| 层间单向依赖，结构清晰 | Provider、工具、Agent 可插拔 |
| 上手快，调试方便 | Rust trait + registry 落地 |
| 适合项目早期 | 为未来扩展留空间 |

**为什么这样选**：分层保证项目早期开发效率，关键模块插件化则避免了"大泥球"风险——新增 Provider 或工具不需要改动核心层代码。已落地的 `ProviderRegistry`、`AgentRegistry`、`ToolRegistry` 即此决策的体现。

---

### 决策 02 · Agent 设计（来自 Pi）

**选择**：状态持有 + 事件订阅（Pi 模式）

Agent 持有 state（messages + 上下文），通过 `subscribe()` 对外通知，流程线性可预测。状态由事件驱动更新（`processEvents` 归约），扩展可订阅事件流。

| 控制方式 | 扩展方式 |
|----------|----------|
| 事件发布/订阅模式 | 订阅生命周期事件介入 |
| subscribe() 监听事件 | Pi 共 33 个事件类型 |
| 流程顺序确定 | 事件流可追踪调试 |

**为什么这样选**：编码代理的核心流程是线性的（接收 Prompt → 思考 → 调用工具 → 生成回复），状态驱动让这条主线清晰可控，调试效率远高于策略路由。Pi 的真实实现是"可变状态对象 + 事件驱动更新"，本项目沿用该模式，不引入纯函数式事件溯源。

---

### 决策 03 · 会话管理（来自 OpenCode）

**选择**：上下文 Epoch（**自研抽象**）

以 Epoch（一次 Prompt→Response 周期）为会话逻辑单元，四阶段框架为项目自研简化模型，映射到现有的 message / run 记录，不直接对应任何参考项目的内部结构。

| 阶段管理 | 压缩机制 |
|----------|----------|
| 每个 Epoch 明确阶段 | 超过阈值自动触发 |
| token 计数精确 | 保留最近 N 轮 turn |
| 映射现有 message/run | 长会话无感运行 |

**为什么这样选**：

> ⚠️ **版本说明**：OpenCode 并无"四阶段 Epoch 状态机"——其真实结构是 12 类 Part（Text/Tool/StepStart 等）+ PromptAdmitted/Prompted 事件 + Tool 事件，且 Epoch 一词在 OpenCode 中指系统上下文基线快照。本决策将 Epoch 定义为**自研逻辑抽象**，目的是给长会话管理一个清晰"骨架"，与现有 message/run 结构对齐。

---

### 决策 04 · 工具系统（来自 Pi）

**选择**：注册中心 + 运行时参数校验

通过工具注册中心（`ToolRegistry`）动态注册工具，参数 Schema 运行时校验，新增工具零侵入核心。Pi 采用 **TypeBox**（`Type.Object` 为其 Schema 语法）做运行时校验，本项目在 Rust 侧用类型化结构体 + serde 落地同等的运行时校验能力。

| 注册方式 | 执行流程 |
|----------|----------|
| registry.register() 调用 | execute(ctx) → result |
| parameters 运行时校验 | 流式反馈支持 |
| 新增工具零侵入核心 | 取消机制 |

**为什么这样选**：编码代理的工具数量不会爆炸级增长（核心工具几十个足够），不需要 Effect-TS 级别的类型安全——快速开发、快速迭代更重要。

> ⚠️ **版本说明**：v1.0 曾写"Type.Object 运行时参数校验"，易被误读为 zod；Pi 实际使用 **TypeBox**（pi-ai 直接 re-export `Type from "typebox"`），此处已修正。

---

### 决策 05 · 扩展机制（来自 Pi）

**选择**：Rust 层生命周期钩子（**目标态**）

以 Rust trait + hooks 链注册到内核层，监听 Agent 全生命周期事件。

> ⚠️ **现状**：后端暂无独立 Plugin hooks 系统，工具级注册已通过 `ToolRegistry` 落地，生命周期钩子为待建设项（见演进路线·当前缺口）。

| 生命周期钩子 | 能力扩展 |
|--------------|----------|
| Prompt 前预处理输入 | 注册工具、Agent |
| Tool 调用后处理结果 | 修改系统提示词 |
| 消息更新时修改输出 | Rust trait + Vec 有序注册 |

**为什么这样选**：与"状态驱动 Agent"天然契合——状态变更的关键节点就是事件钩子的切入点。

> ⚠️ **版本说明**：v1.0 引用的 `onBeforePrompt` / `onAfterToolCall` / `onMessageUpdate` 是 Claude Code 风格命名，Pi 实际为 `on("event_name")` 分发（共 33 个事件，如 `before_agent_start` / `tool_result` / `message_update`）。本项目改为 Rust 层 trait 钩子，名称以 Rust 习惯为准，不再照搬任一项目命名。

---

### 决策 06 · 模型集成（来自 OpenCode）

**选择**：动态 Provider 注册

配置文件声明 Provider（endpoint / options / enabled），运行时动态加载实例。

> ✅ **已落地**：`crates/model-gateway` 的 `ProviderRegistry` + (provider, model) 对路由 + SSE 真实流式传输。

| 注册方式 | 策略控制 |
|----------|----------|
| 配置文件声明式注册 | Provider allow/deny 策略 |
| ProviderRegistry 管理 | 模型选择策略 |
| 即插即用，无需改代码 | 动态模型获取 fetch_models |

**为什么这样选**：与 `ProviderRegistry` 现有实现完全兼容，用户在配置中新增 Provider 即可立刻使用——是"插件化架构"在模型层的具体落地。与 OpenCode 的 `Provider.Service` 注册表思路一致，亦与 Pi 的 `registerProvider` 扩展 API 兼容。

---

### 决策 07 · 状态管理（混合方案）

**选择**：SQLite 存储 + 增量事件流抽象

事件按 append-only 语义写入 SQLite 会话表，当前 state = fold(events, initial) 归约得出。SQLite 为存储介质，事件流为逻辑抽象，兼顾现状与事件溯源收益。

| 存储 | 恢复 |
|------|------|
| SQLite 追加行 O(1) 高效 | fold 归约重放事件 |
| 完整可追溯时间线 | 配合快照加速 |
| 天然支持时间旅行 | 支持回放任意点 |

**为什么这样选**：与"原生 Fork"和"上下文 Epoch"必须配套——DAG 分支的每个节点就是一个事件序列的分叉点，增量事件流让分支创建零拷贝成本。

> ⚠️ **版本说明**：v1.0 写"JSONL 追加写"不准确——OpenCode 实际用 **SQLite**（drizzle），JSONL 仅用于调试日志；Pi 的 JSONL 是 append-only entry 树，落盘的是每轮最终 entry，并非 token 级事件流。本项目定为 **SQLite 介质 + 事件流逻辑抽象**（fold 归约在 SQLite 表上实现），不引入 JSONL。

---

### 决策 08 · 压缩策略（来自 OpenCode）

**选择**：自动阈值触发

超过 token 阈值自动压缩早期内容，保留最近 N 轮 turn + 保护区 token，用户零感知。

> ✅ **已落地**：`PRUNE_MINIMUM=20K` 触发 / `PRUNE_PROTECT=40K` 保护区 / 保留最近 2 轮 turn + 2K~8K token。

| 触发条件 | 压缩范围 |
|----------|----------|
| token 计数超阈值 | 保留最近 N 轮 turn |
| PRUNE_MINIMUM=20K 触发 | 保护区 token（2K~8K） |
| 压缩前可选通知用户 | 更早内容生成摘要 |

**为什么这样选**：编码任务是超长会话，用户不应该被"请压缩上下文"打断。自动压缩在后台悄悄完成，配合 turn 粒度可以精准决定"保留哪些、压缩哪些"。

> ⚠️ **版本说明**：v1.0 写"保留最近 N 个 Epoch"单位有误——OpenCode 实际保留最近 N 轮 turn（tail_turns 默认 2）+ token 保护区（2K~8K），本项目的 `PRUNE_MINIMUM` / `PRUNE_PROTECT` / `DEFAULT_TAIL_TURNS` 常量即源于此，已按真实机制修正。

---

### 决策 09 · 会话分支（来自 Pi）

**选择**：原生 Fork（DAG / 树结构）

任意会话点创建分支，子分支继承父上下文，形成有向无环图（DAG / 树）。

> ✅ **已落地**：`session_fork` 命令 + `forkSession`/`listSessionForks` IPC + 前端 Fork UI。

| 数据模型 | 使用场景 |
|----------|----------|
| 每个节点有 parentId | 探索不同方案对比 |
| 每个节点标记 branchId | Agent 行为调试 |
| 天然零拷贝分支 | 方案 A/B 测试 |

**为什么这样选**：这是产品差异化核心功能——"让用户尝试不同方案对比优劣"是编码代理的高频场景，与增量事件流组合后，分支创建几乎是零成本的。

> ✅ **真实来源**：Pi 的 session-manager 即 append-only 树（每 entry 带 parentId，`branch()`/`fork()` 移动 leaf 指针不改历史），本项目 Fork 机制与其同构。

---

### 决策 10 · UI 组件风格（来自 OpenCode）

**选择**：设计感精致型

充足留白、卡片化布局、流畅动画过渡，视觉层次清晰，强调品牌感和体验愉悦感。

> ✅ **已落地**：CSS 设计 Token（亮暗主题）+ 自定义 Tooltip/滚动条 + i18n 936 keys。

| 视觉原则 | 交互原则 |
|----------|----------|
| 充足留白，不过度拥挤 | 核心操作鼠标可达 |
| 卡片 + 圆角 + 柔和阴影 | 快捷键作为进阶效率 |
| 品牌色渐变点缀 | 微动画提升愉悦感 |

**为什么这样选**：桌面 App 的用户对视觉体验有预期（参考 Linear、Notion 标准），目前已有设计系统基础，继续精致化路线可以形成品牌识别。

> ⚠️ **说明**：OpenCode 的 UI 基于 SolidJS + Kobalte，本项目为 React，借鉴其审美与交互范式，不照搬组件实现。

---

### 决策 11 · 热重载能力（来自 OpenCode）

**选择**：配置级热重载

配置、Provider 配置、Skill 文件变更即时生效，无需重启 Agent。**代码级热重载（插件源码改完即生效）明确不在本期范围**。

> ✅ **已落地**：Hot Reloadable Config（配置热重载）。

| 覆盖范围 | 实现思路 |
|----------|----------|
| 配置文件变更即时生效 | 文件系统 watcher 监听 |
| Provider 配置与注册 | 重建派生配置状态 |
| Skill 指令文件 | 代码级变更需重启 |

**为什么这样选**：开发者体验是"数字生命"产品的灵魂——写 Skill、调 Provider 配置时，"改完立刻生效" vs "重启应用等 10 秒"，体验差一个数量级。

> ⚠️ **版本说明**：v1.0 声称"插件/代码即时生效、无需重启"不属实——OpenCode 只有 RPC 触发的全量实例重建，Pi 也无代码级热重载。配置级热重载即可覆盖高频开发者体验诉求，代码级热重载列为远期实验（不承诺）。

---

### 决策 12 · 错误处理（来自 OpenCode）

**选择**：双端结构化错误（Rust Result + TS 归类）

Rust 侧 `Result<T, AppError>` 结构化传播，前端 `captureTypedError` 统一归类，结构化 JSONL 日志可追溯。**不再引入"统一 Error Channel 总线"**。

| 错误分类 | 处理流程 |
|----------|----------|
| UserError（用户操作） | Result<T, AppError> 传播 |
| SystemError（系统异常） | captureTypedError 归类 |
| ProviderError（模型层） | 结构化 JSONL 日志 |

**为什么这样选**：

> ⚠️ **版本说明**：v1.0 主张"统一 Error Channel 总线"系夸大——OpenCode 实际是 Effect 类型化错误（9 类 NamedError）+ `fromError()` 归一化，经多条通道流动，并非单一总线。本项目对齐现有体系：Rust Result + TS captureTypedError，遵循 `error-handling.md` 规则，不做"大爆炸"式重构。

---

### 决策 13 · 双端一致性（项目硬规则）

**选择**：Tauri 桌面 / 浏览器模式行为一致

所有功能必须在 Tauri 桌面应用和浏览器模式中保持一致。新增 IPC 方法必须同步实现 `tauri-bridge.ts` / `preview-bridge` / `mock-bridge`。

| 覆盖范围 | 实现约束 |
|----------|----------|
| UI 展示与交互一致 | tauri-bridge / preview-bridge / mock-bridge |
| IPC 桥接三端对齐 | 功能不能只在单一模式可用 |
| 功能双端可用 | WebView URL 变化不被动触发 Tauri |

**为什么这样选**：这是项目治理硬规则（见 AGENTS.md 双端一致性）。浏览器预览承担高频开发与测试职能，若与桌面端行为不一致，将导致大量"仅桌面/仅浏览器"的隐性缺陷，也无法用浏览器自动化覆盖桌面场景。

---

### 决策 14 · 凭据与安全边界（项目硬规则）

**选择**：credential crate + capabilities 白名单

凭据只经 `crates/credential` 存储（keyring + 加密文件降级），WebView 不直接触达系统能力，通过 `#[tauri::command]` + capabilities 白名单暴露。

| 凭据管理 | 权限边界 |
|----------|----------|
| keyring 系统凭据库 | WebView 不直接访问系统能力 |
| 加密文件降级 | capabilities 白名单（禁通配） |
| 禁止写入配置/日志 | Ruleset 权限（Allow/Ask/Deny） |

**为什么这样选**：项目治理硬规则（见 AGENTS.md 安全边界与禁止项）。Pi 明确无内置权限系统（依赖容器化隔离），OpenCode 有完整 Rule/Ruleset 权限体系——本项目取其精华，落地为 Rust 侧 Ruleset + capabilities 白名单，且禁止 `"all"` / `"**"` 通配。

---

## Section 02 · 设计哲学与核心原则

### Pi 基因 · 轻量高效内核

**我们吸收的：**

- 状态驱动 Agent：线性流程、可预测、易调试
- 事件订阅扩展：subscribe() + 33 个生命周期事件
- 工具注册中心：新增工具不改核心（ToolRegistry）
- 原生 Fork：append-only 树 + parentId 零拷贝分支
- 自动阈值压缩：DEFAULT_COMPACTION_SETTINGS 默认开启

**我们刻意不选的：**

- TUI 优先的极简 UI（不符合桌面用户预期）
- 无内置权限系统（依赖容器化，本项目需内置 Ruleset）
- 纯 JSONL 存储（项目采用 SQLite，JSONL 仅作调试日志）

### OpenCode 基因 · 完整功能体系

**我们吸收的：**

- 动态 Provider 注册：即插即用模型接入（Provider.Service）
- 自动阈值压缩：PRUNE_MINIMUM/保护区 + 摘要
- 类型化错误分类：fromError() 归一化思路
- 精致 UI：审美与交互范式（非组件复用）
- Ruleset 权限：Allow/Ask/Deny + 通配匹配
- 配置热重载：改动配置无需重启

**我们刻意不选的：**

- Effect-TS 函数式编程（学习曲线陡）
- SQLite 直存全量状态（我们叠加事件流逻辑抽象）
- 代码级热重载（两项目均未实现，不承诺）
- 单一 Error Channel 总线（实际为多通道类型化错误）

### 🎯 组合公式

```text
// 核心内核（决定流程可控性）
Agent 核心 = Pi 状态持有 + 事件订阅 + Epoch 抽象（自研）

// 扩展能力（决定开发效率）
扩展层    = Pi 工具注册中心 + 生命周期事件 + OpenCode 动态 Provider + Ruleset

// 会话持久化（决定长会话体验）
会话层    = Pi 原生 Fork (树) + SQLite + 事件流逻辑抽象 + 自动压缩

// 用户体验（决定产品印象）
表现层    = OpenCode 精致 UI + 配置热重载 + 双端结构化错误

// 一句话总结
"Pi 的轻量骨架" + "OpenCode 的功能血肉" = "可控、可扩展、体验好"的编码代理
```

---

## Section 03 · 架构蓝图

> 五层架构：UI 层 → 桥接层 → Agent 层 → 内核层 → 持久化层，每层职责明确。

### 👨‍💻 专业视角

采用分层 + 插件化混合架构。严格遵循层间单向依赖原则：**UI → Bridge → Agent → Core → Storage**。插件通过 Core 层的 Extension Manager 注入，不允许跨层直接调用。关键契约（IPC 接口、工具定义）使用 TypeScript 类型作为单一真源。

### 🧑 通俗视角

把系统想象成一家餐厅：

1. 顾客（用户）在前台（UI）点餐
2. 服务员（Bridge）把订单传给后厨
3. 主厨（Agent）看菜单，决定怎么做
4. 帮厨（Core 工具）切菜、炒菜、装盘
5. 传菜口（Storage）存着做好的菜和历史订单

想加新菜品？不需要装修后厨，找帮厨登记一下就行。

### 五层架构图

> ⬇️ 依赖方向：上层依赖下层，下层不得依赖上层

**🎨 UI 表现层**
`React 组件` `设计系统 Token` `会话视图 (DAG 可视化)` `面板 (工具/设置)` `热重载 UI`

**🌉 桥接层**
`Tauri Bridge (桌面)` `Preview Bridge (浏览器)` `Mock Bridge (测试)` `IPC 契约统一`

**🤖 Agent 层（状态驱动 · 来自 Pi）**
`Agent Runtime` `事件订阅 (subscribe)` `AgentRegistry / Router` `生命周期钩子（目标态）` `工具注册中心 (ToolRegistry)`

**⚙️ 内核层（插件化模块）**
`工具注册中心 （Pi 风格）` `ProviderRegistry （OpenCode 风格）` `模型调用网关 (ModelGateway)` `结构化错误 (AppError)` `配置热重载管理器` `Ruleset 权限门禁`

**💾 持久化层（SQLite + 事件流逻辑抽象）**
`SQLite 会话存储` `会话 Fork（树结构）` `Snapshot 快照索引 (加速恢复)` `压缩后摘要 (CompactionPart)` `结构化日志`

### 🔌 插件化扩展点（关键模块）

**🧩 Agent / 工具扩展点**

- `ToolRegistry.register()` — 注册新工具
- `AgentRegistry.register()` — 注册自定义 Agent
- 生命周期钩子（目标态，Rust trait）
- 事件订阅（Pi 33 事件启发）

**🔌 Provider 扩展点**

- 配置文件声明式注册
- endpoint / options / enabled
- 兼容 OpenAI / Anthropic 契约
- `ProviderRegistry.register()` 动态注册
- 配置热重载立即生效

**📜 Skill 扩展点**

- Markdown 文件 + Frontmatter
- name / description / setup
- 文件 watcher 自动热重载
- 触发时注入 system prompt
- 内置使用示例 / 步骤说明

---

## Section 04 · 核心数据模型

> SQLite 存储上的事件流逻辑抽象 + Epoch + 树形分支的组合数据结构，这是整个项目最复杂的部分。

### 👨‍💻 专业视角

当前 state 由 `fold(events, initialState)` 归约得出，不直接存储为完整快照。每个 Event 是不可变记录，以 append-only 语义写入 SQLite 会话事件表。Epoch 作为事件的逻辑分组，对应一次完整的 Prompt→Response 周期（自研抽象）。树形分支通过 parentId 形成，不做物理拷贝。定期生成 snapshot 加速重放（snapshot + 其后 events = 当前 state）。

### 🧑 通俗视角

想象拍视频（增量事件流）而不是拍照片（全量快照）：

- 视频的每一帧就是一个 Event
- 一段连续的镜头就是一个 Epoch
- 想分镜（Fork）就从某帧开始另拍一条线
- 视频太长（上下文超限）就把前面剪成精华版（压缩）
- 为了跳过片头，每隔一段时间存一个"关键帧"（snapshot）
- 所有素材统一存在一个"数据库仓库"（SQLite）里，而不是散落的视频文件

### 📦 数据模型定义

```ts
// ===== 会话存储核心类型（SQLite 事件表 + 逻辑抽象） =====

type EventID = string;  // ULID：时间有序，支持排序
type EpochID = string;
type BranchID = string;
type SessionID = string;

// EventType 为自研简化模型：对齐现有 message/run 结构，非借鉴任何参考项目
enum EventType {
  PROMPT_ADMITTED = "prompt_admitted",
  PROMPTED        = "prompted",
  TOOL_CALL       = "tool_call",
  TOOL_RESULT     = "tool_result",
  MESSAGE_UPDATE  = "message_update",
  EPOCH_COMPACTED = "epoch_compacted",
  BRANCH_CREATED  = "branch_created",
}

// 不可变事件 —— 只能追加，不能修改（append-only 写入 SQLite 事件表）
interface Event<T = unknown> {
  id: EventID;
  type: EventType;
  epochId: EpochID;
  branchId: BranchID;
  sessionId: SessionID;
  parentEventId: EventID | null;  // 树形链，用于 Fork
  timestamp: number;
  payload: T;
}

// ===== Epoch（一次 Prompt → Response 周期，自研抽象） =====
enum EpochKind {
  FULL    = "full",       // 完整 Epoch，事件都在
  COMPACT = "compact",    // 压缩 Epoch，仅存摘要
}

interface Epoch {
  id: EpochID;
  branchId: BranchID;
  parentEpochId: EpochID | null;  // 形成树
  kind: EpochKind;
  tokenCount: number;
  summary?: string;  // COMPACT 模式的摘要
  eventIds: EventID[];
  createdAt: number;
}

// ===== Snapshot（加速恢复的关键帧） =====
interface Snapshot {
  id: string;
  branchId: BranchID;
  lastEventId: EventID;   // snapshot 覆盖到这个事件为止
  state: AgentState;        // 归约后的完整 state
  createdAt: number;
}

// ===== AgentState（fold 归约结果） =====
interface AgentState {
  messages: Message[];
  contextTokens: number;
  currentEpochId: EpochID | null;
  activeBranchId: BranchID;
  toolStates: Record<string, unknown>;
}

// ===== 恢复算法伪代码 =====
function restoreState(sessionId, branchId) {
  // 1. 找最新 snapshot
  const snap = findLatestSnapshot(sessionId, branchId);
  // 2. 取 snap 之后的事件（增量）
  const events = loadEventsSince(sessionId, branchId, snap.lastEventId);
  // 3. fold 归约 = 增量还原
  return events.reduce((state, event) => applyEvent(state, event), snap.state);
}
```

---

## Section 05 · 关键风险与应对

> 14 项决策之间存在兼容性挑战。提前识别风险，准备对应策略。

### 风险 01 · 增量事件 + 树形分支 + 自动压缩

三者叠加的数据结构复杂度极高。增量事件是线性序列，但分支要求树结构，自动压缩又需要理解"哪些事件属于哪个分支"。一个节点压缩错了可能导致整条分支损坏。**本项目坚持任意节点 Fork，复杂度风险需以机制化解而非功能缩水。**

**✅ 应对策略**

1. 每个事件同时记录 branchId + parentEventId，通过索引表维护分支树
2. **父节点冻结**：已作为其他分支父节点的事件不可再增子节点，防止树结构退化
3. 压缩时仅处理该分支的祖先链（从叶子向上回溯），不跨分支
4. 压缩前先生成 snapshot 备份，压缩失败可回滚
5. 任意节点 Fork：通过 parentId 定位分叉点，新分支只复制指向（引用共享），不物理拷贝

### 风险 02 · 结构化错误 vs 现有 captureTypedError

现有前端已实现 captureTypedError 体系（Zustand slice 中显式捕获），Rust 侧已有 `Result<T, AppError>` 结构化错误。双端如何归类对齐？

**✅ 应对策略**

1. 不引入"统一 Error Channel 总线"，对齐现有双端体系
2. Rust 侧：`Result<T, AppError>` 结构化传播，分类 User/System/Provider
3. 前端：captureTypedError 统一归类 + 结构化 JSONL 日志
4. 新增模块沿用现有模式，不做"大爆炸"式重构

### 风险 03 · 配置热重载 + 状态一致性

配置热重载时，运行中的 Agent 可能持有旧配置引用（如旧 Provider endpoint），与热重载后的新配置不一致。

**✅ 应对策略**

1. 明确热重载范围：仅配置文件 / Provider 配置 / Skill 文件，不含代码
2. 热重载流程：重新加载配置 → 重建派生状态（Provider 实例、Agent 配置）
3. 运行中的请求不中断，下次调用采用新配置
4. 配置校验失败时保留旧配置并告警，不回滚到损坏状态
5. 代码级热重载明确不承诺（两参考项目均未实现）

### 风险 04 · 生命周期钩子 + 事件流完整性

Agent 生命周期钩子（Rust trait，目标态）介入输入/输出时，这些介入操作本身需被记录，否则会话重放恢复时钩子行为无法重放，导致结果不一致。

**✅ 应对策略**

1. 要求：钩子若修改输入/输出，必须将修改内容注入到事件 payload 中
2. Prompt 前预处理返回新 Prompt 时，自动生成 `PROMPT_MODIFIED` 事件
3. 工具结果修改时，生成 `TOOL_RESULT_MODIFIED` 事件
4. 文档明确：钩子只做副作用（发通知、写日志）不要求记录；但改数据必须记录

### 风险 05 · 动态 Provider + 自动压缩阈值

不同 Provider 的 token 计算标准不一致（OpenAI 用 tiktoken，Anthropic 另有算法）。如果中途切换 Provider，token 计数基线变化，可能导致"以为没超阈值，实际超了"，触发模型错误。

**✅ 应对策略**

1. 压缩阈值采用保守策略：以最大 token 上限的 80% 作为触发线
2. 切换 Provider 时，强制重新计算当前 context tokens（用新 Provider 的 tokenizer）
3. 存储中同时保存"字符数"作为兜底参考，字符数阈值也触发压缩检查
4. Provider 契约要求暴露 `getTokenizer()` 方法，供上层使用

### 风险 06 · 设计感 UI + Tauri 双端一致性

浏览器预览（Chromium）和 Tauri 桌面（WebView2）的渲染引擎差异、系统字体差异、DPI 缩放差异，可能导致精致 UI 在 WebView2 中"看起来不精致"（字体发虚、动画掉帧、颜色偏差）。

**✅ 应对策略**

1. 设计 Token 必须抽象：颜色、字号、间距全部用 CSS 变量，平台层覆盖
2. 字体栈优先用 Web Font（Inter / HarmonyOS Sans），不依赖系统字体
3. 关键组件建立"双端验证清单"，每次修改后人工确认两端表现一致
4. 启用 CSS `will-change` + `transform` 动画，避免重排导致的掉帧

### 风险 07 · 凭据管理 + 权限门禁误放

WebView 若绕过 Tauri Command 直接触达系统能力，或 capabilities 使用通配权限，将破坏安全边界；凭据若落入普通配置或日志，会造成泄露。

**✅ 应对策略**

1. 凭据只经 `crates/credential` 存储（keyring + 加密文件降级）
2. capabilities 白名单禁止 `"all"` / `"**"` 通配，新增命令必须登记
3. 敏感工具（文件写、命令执行）走 Ruleset 权限（Allow/Ask/Deny）
4. 日志中凭据脱敏，禁止明文打印

---

## Section 06 · 分阶段演进路线

> v2.0 对齐现状：标注已完成项与剩余缺口。每阶段结束后做验收，再进入下一阶段。

### ✅ 已完成 · Phase 0–2（🟢 底座与全功能 MVP 已落地）

- ✅ Tauri 桌面壳 + SQLite 状态
- ✅ ProviderRegistry 动态 Provider 注册
- ✅ (provider, model) 对路由 + SSE 真实流式
- ✅ 自动压缩（PRUNE_MINIMUM=20K / 保护区 40K）
- ✅ Session Fork（任意节点分叉 + Fork UI）
- ✅ Snapshot / Revert
- ✅ Ruleset 权限（Allow/Ask/Deny）
- ✅ MCP / LSP / 多 Agent / Sub-agent
- ✅ Hot Reloadable Config（配置级热重载）
- ✅ Durable Session Execution
- ✅ 设计 Token + 自定义 Tooltip/滚动条
- ✅ i18n（13 领域 / 936 keys）

### 🔧 当前缺口 · 待建设（🟡 补齐数据结构与扩展机制）

- SQLite 上的事件流逻辑抽象（append-only 表 + fold 归约）
- 任意节点 Fork 的树形索引与父节点冻结机制
- 生命周期钩子（Rust trait + Vec 有序注册）
- 钩子修改数据的 `PROMPT_MODIFIED` / `TOOL_RESULT_MODIFIED` 事件
- Snapshot 加速恢复：每 N 轮自动快照
- 开发模式：事件流可视化调试面板

### 🔵 远期 · 体验打磨（提体验：Fork UI 深化 + 精致化）

- Fork 分支树可视化，分支间快速切换对比
- Skill Markdown 文件 watcher + 自动加载完善
- Provider 配置热重载 + 切换无重启
- UI 组件升级：微动画 + 卡片化 + 响应式打磨
- 双端验证清单常态化执行
- （不承诺）代码级热重载实验性探索

---

## 📝 本标准的使用说明

- **✅ 当做决策时的依据**：遇到"要不要做 X？怎么做 X？"的问题时，先查对应决策项，按标准走。
- **⚖️ 标准冲突时的优先级**：本标准 > 现有代码习惯 > Pi/OpenCode 原版实现。即"先按自己定的规矩来"。
- **🔄 修订机制**：遇到标准覆盖不到的新场景，按同样的"对比两方案优缺点 → 选一个 → 记录理由"流程补充本标准，不允许拍脑袋决定。
- **🔒 冻结项**：14 项核心决策中，决策 1–12 在 6 个月内不得变更（除非有充分的技术反证）；决策 13–14 为项目硬规则，任何时候不得放宽。频繁推翻架构是最大的开发杀手。

---

*AI 数字生命 · 项目设计标准 v2.0 · 基于 Pi × OpenCode 源码核对 + 现状对齐修订 · 本文件为项目架构真源之一，重大修改需同步评审*
