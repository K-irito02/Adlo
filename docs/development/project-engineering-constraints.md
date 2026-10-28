# AI数字生命 项目级工程规则与约束

## 目标与适用范围

本文件定义 `AI数字生命` 桌面应用的项目级工程规则，适用于：

- `ai-digital-life/` 实现工作区（Rust + Tauri 2.x）中的实现、测试、打包与发布流程
- 仓库根目录中的架构、规范、实施方案

本文件是对 [AGENTS.md](../../AGENTS.md) 中项目治理规则的补充，聚焦产品与工程落地约束。优先级：根 `AGENTS.md`（项目治理）> `ai-digital-life/AGENTS.md`（实现工作区）> `.agents/rules/`（Agent 执行规则）；与规则文件重叠处以规则文件为准。

## 技术与阶段基线

当前技术基线见 [ai-digital-life/AGENTS.md](../../ai-digital-life/AGENTS.md#技术栈) 的技术栈表。

当前阶段边界：

- 当前形态：**桌面应用宿主 + 第三方 Agent harness 集成**（见根 `AGENTS.md#项目形态` 与 `.agents/rules/phase-boundary.md`）
- Agent 对话、模型接入与编排由第三方 harness（当前为 deepseek dsh）提供，本仓库仅负责宿主集成
- 未来想法见 `FUTURE-ROADMAP.md`（未立项）
- 未经显式决策，不得把未立项的复杂能力伪装成当前必需项

## 总体工程原则

- 桌面优先，工作区优先，任务优先
- **双端一致性优先：所有功能必须在 Tauri 桌面和浏览器预览模式（`preview-bridge/` + adl-server 真实后端）下保持功能行为一致**
- 默认本地优先与离线可降级，不把核心能力绑定到远端服务可用性
- 默认可恢复、可回滚、可审计，不接受只考虑"成功路径"的设计
- 默认最小权限，不以开发便利为由扩大 Renderer、IPC 或文件系统权限
- 默认可观测，不允许关键链路在失败后无日志、无错误码、无上下文
- 默认可测试，设计阶段必须考虑单测、集成测试和关键场景回归入口
- 默认国际化和主题兼容，不允许把中文文案或固定颜色硬编码为实现前提

## 双端一致性约束

应用同时支持两种运行模式，必须保持**功能行为一致性**：

| 模式 | 桥接层 | 数据来源 | 测试价值 |
|------|--------|----------|----------|
| Tauri 桌面 | `tauri-bridge/`（+ 入口 `tauri-bridge.ts`） | Rust 后端 + SQLite | 生产环境真实行为 |
| 浏览器预览 | `preview-bridge/`（http 优先，可回退） | adl-server 真实后端 | 快速迭代 + Agent 测试 |

**必须遵守的一致性规则：**
1. 新增 Tauri Command 时，必须同步实现 `tauri-bridge/`、`preview-bridge/`、`mock-bridge.ts`（+ `mock/`）三端（新增清单见 `ai-digital-life/CONTRIBUTING.md`）
2. UI 组件的条件渲染只允许以下 4 种平台差异：
   - 窗口控制按钮（仅 Tauri）
   - 标题栏拖拽（仅 Tauri）
   - 窗口图标同步（仅 Tauri）
   - 目录选择器（Tauri 原生，浏览器 Preview API）
3. 所有其他功能必须在两种模式下**功能行为一致**
4. 使用 `pnpm run dev:both`（在 `ai-digital-life/` 目录执行）同时验证两种模式

**实现策略差异原则：**

由于 Tauri 桌面模式和浏览器模式的运行环境本质不同，某些功能的实现策略可以因环境而异，但必须满足：

1. **功能行为一致**：用户可感知的输入→输出、交互流程、数据结果在两种模式下相同
2. **统一接口抽象**：通过 TypeScript 接口隔离环境差异，消费端不感知底层实现
3. **存储后端可不同**：Tauri 模式可使用 SQLite/文件系统，浏览器模式可使用 IndexedDB/localStorage
4. **系统能力可降级**：浏览器模式无法使用的能力（如原生对话框、keyring）应有合理的 Web API 替代

> **示例**：终端输出持久化 — Tauri 模式写入 SQLite，浏览器模式写入 IndexedDB。两者实现同一个 `TerminalOutputStore` 接口（示意），功能行为完全一致。

## 分层与边界

必须保持以下层次边界：

- `Tauri Core (Rust)` 负责应用生命周期、系统集成、窗口管理、Capability 与权限编排、恢复编排
- `Tauri Commands` 是 WebView 与后端的唯一桥接面：类型化、capability 白名单、结构化错误返回
- `WebView Frontend (React)` 负责界面、交互编排和表现层状态，不直接触达系统能力
- 后台任务通过 `tokio::spawn`（或专用线程）承载索引、检索、长耗时计算，不直接承担 UI 状态
- harness 宿主集成（`webapp-host`/`harness-version`/`download-source`）负责第三方 harness 的进程托管、版本管理、下载源与宿主渲染
- 基础设施（`adl-kernel::storage` 路径解析 / `adl-logging` / `errors` 等）负责实现细节

明确禁止：

- WebView 直接调用文件系统、进程、网络特权、数据库原语或任意命令执行
- Tauri Command 设计成宽泛的「万能命令」（如接受任意 SQL 或任意路径写入）
- 低层 crate 依赖高层 crate
- 多个事件总线并行成为事实标准
- UI 组件内部承载跨页面业务规则、恢复策略或持久化细节
- `tauri.conf.json` 或 `capabilities/*.json` 使用 `"all"` / `"**"` 通配权限

## 跨平台约束

当前以 `Windows` 优先，但工程设计必须保持跨平台兼容能力，不得封死未来 `macOS` 与 `Linux` 路径。

必须满足：

- 路径处理统一通过跨平台抽象，不拼接平台相关分隔符
- 文件名、大小写敏感性、保留字符、权限失败都要按跨平台差异建模
- 快捷键方案允许平台映射，不把 `Ctrl` 绑定写死为唯一语义
- 字体回退链、系统主题监听、系统托盘、通知、开机启动等能力必须允许平台适配
- 安装、升级、卸载、恢复目录和日志目录必须由平台适配层统一管理

## 国际化规则

首批正式支持语言：

- `zh-CN`
- `en-US`

### 架构约束

- 所有用户可见文案必须通过 i18n 资源提供，不允许在组件、store、IPC 返回值中硬编码展示文案
- 文案 key 必须稳定、语义化，不允许以中文句子本身作为 key
- 默认语言与回退链必须明确：默认 `system`（跟随 OS：中文→`zh-CN`，其余→`en-US`，见 `resolveLanguage.ts`）
- 语言切换必须为运行时可切换能力，不要求重启应用
- 数字、日期、时间、相对时间、货币、列表拼接必须走 locale-aware 格式化
- 错误消息分离为"内部错误码/诊断信息"和"用户可见文案"，避免把内部英文异常直接展示给用户
- 排版必须考虑中英文长度差异，不允许依赖固定宽度文案布局
- 搜索、命令、设置、菜单等核心入口的本地化策略必须一致，不能部分模块有翻译、部分模块退回源码文案
- 新增语言时必须保持所有 locale 文件 key 完全对称（`CopyKey` 类型强制检查）

### i18n 上下文机制

- 所有组件通过 `useTCopy()` hook 获取翻译字典 `t` 和格式化函数 `formatT`（`formatT` 亦可从 `@i18n/formatT` 单独导入；无 Provider 即抛错）
- 禁止 `t: CopyDict` prop drilling — `App.tsx` 通过 `<TCopyProvider>` 注入全局上下文
- `formatT(t, key, vars)` 支持模板插值（如 `"共 {count} 个标签"`），缺失 key 时回退显示 key 名称
- 新组件直接调用 `const { t, formatT } = useTCopy();`

### 菜单与 Tooltip 约束

- Tooltip 实现方式：自定义 Tooltip 组件与原生 HTML `title` 属性均可使用，具体方案开发时由用户决策（需保持双端一致）
- 菜单卡片必须使用 `min-width: 176px; width: max-content; max-width: 90vw` 自适应宽度，防止英文长文本溢出
- 菜单项中提示图标（如 `!`）必须使用 flex 流式布局（`margin-left: auto`），禁用 `position: absolute` 避免文本重叠
- 菜单项标签必须设置 `flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis` 确保溢出截断

### 全覆盖要求

- 所有 UI 展示文本必须通过 i18n 资源提供，包括但不限于：按钮标签、Tooltip 提示、卡片内容、aria-label、占位符文本、空状态提示、加载状态、错误提示、过滤器标签、相对时间字符串、日期格式
- 工具函数（如日期/时间格式化）中的展示文本必须支持 locale 感知，禁止硬编码特定语言的字符串
- 条件渲染中的展示文本（如标题行/面包屑导航的标签映射）必须使用 i18n key，禁止硬编码任意语言的字符串
- 新增功能或组件时，所有展示文本必须同步添加中英翻译 key，不得出现仅有中文或仅有英文的展示文本
- 语言切换时，依赖 `useMemo` 中的 `workspaces` 等易变 store 数据计算的展示条件必须增加稳定性 fallback，防止标题行/路径栏因级联渲染而消失（参见 `GitHubPanel.tsx` 的 `hasActiveItem + (isLeafSelected || activeWorkspaceSection)` 模式）

### 翻译质量

- en-US 翻译使用 Sentence case（句首大写），上下文菜单例外
- 省略号统一使用 Unicode 字符 `…`（U+2026），不使用三个句点 `...`
- 空状态/提示消息末尾统一不加句点
- aria-label 翻译应包含冠词（如 `"Toggle the left sidebar"`）
- 翻译资源在 CI 前通过 `check:i18n` 脚本验证 key 完整性

## 主题系统规则

主题模式必须支持：

- `light`
- `dark`
- `system`

其中 `system` 必须跟随操作系统主题变化并实时生效。

必须遵守：

- 主题值与解析后的实际主题值分离存储，至少区分 `themeMode` 和 `resolvedTheme`
- 颜色、阴影、边框、层级、间距状态色必须通过设计令牌或 CSS 变量驱动，不允许在组件中散落十六进制常量作为长期方案
- 默认视觉基调必须采用淡色、低饱和度 token；常规文本、背景、边框、悬停态和大多数状态提示优先使用 `text-secondary` / `text-muted`、`surface-*`、`*-soft`、`*-subtle` 一类变量，除非更强对比度是可访问性或高风险反馈的必要条件
- 提示色规范：拖拽手柄/分界线悬停等提示场景禁用 `var(--accent)` 系蓝色，一律白/灰/黑中性色；未经用户允许不得用蓝色系作特殊提示/警醒/填充（见 `.agents/rules/hint-color-usage.md`）
- 主题切换不能只覆盖页面背景和文字颜色，交互态、悬停态、选中态、禁用态、危险态、焦点态都必须成体系定义
- 图标、插图、代码高亮、滚动条、空状态、图表等非文本区域必须验证主题兼容性
- 不允许把“深色主题”当作默认视觉假设；浅色主题必须一等支持
- 主题切换不得造成闪烁、布局跳变或明显的首次渲染错误主题
- 主题选择必须持久化，并允许用户显式覆盖系统主题
- 常规产品 UI Tooltip 可使用自定义 Tooltip 组件或原生 `title` 属性实现，具体方案开发时由用户决策；第三方内部 DOM（如代码编辑器折叠控件）无法稳定承载自定义 Tooltip 时，允许使用原生 `title` 并同步本地化文案

推荐约束：

- 建立语义化 design token，例如 `surface`, `surface-elevated`, `text-primary`, `text-muted`, `border-subtle`, `accent`, `danger`
- 将品牌色与语义色分离，避免单色驱动所有状态
- 为图表、语法高亮和富文本单独定义主题映射

## 可访问性与可用性

必须满足：

- 键盘可达性是正式要求，不是补充要求
- 焦点状态在三种主题下都必须可见
- 交互控件、菜单、对话框、列表、树、表格必须有可感知的语义和状态
- 不依赖颜色作为唯一信息表达方式
- 中英文本地化后仍需满足关键页面的可读性和布局稳定性
- 动画必须支持降低动态效果或至少避免影响核心操作

## 配置、状态与持久化规则

配置必须分层：

- 构建时配置
- 应用运行时配置
- 用户偏好配置
- 工作区级配置
- 临时会话状态

必须遵守：

- 不得把用户偏好、工作区设置和运行时派生状态混存为单一“大配置对象”
- `Zustand` store 优先承载表现层状态与交互编排，不承担底层持久化真相源
- 持久化状态必须定义 schema 版本与迁移策略
- 配置读写必须经过受控服务，不允许多个模块各自直接读写同一配置文件
- 敏感配置不得明文写入普通用户偏好文件或日志
- `themeMode`、语言、窗口布局、最近工作区等用户偏好必须具备恢复策略与异常兜底

## 数据与 SQLite 约束

必须遵守：

- SQLite schema 变更必须附带迁移脚本、版本号和回滚/恢复说明
- 数据访问以 `adl-kernel::storage`（`StoragePaths` 统一路径解析，locator 文件 `storage-locator.json`，dev/test 可用 `ADL_STORAGE_LOCATOR_PATH` 覆盖）为真相源，不允许 WebView 拼接 SQL
- 所有查询参数必须使用 `rusqlite` 命名/位置参数绑定，禁止字符串拼接 SQL
- 审计、任务、索引、缓存、设置等数据域应分表或分边界管理，不使用无边界的「万能表」
- 缓存数据与用户关键数据必须区分，清理策略不能互相污染
- 损坏数据库、迁移中断、磁盘不足、文件占用等异常必须有恢复路径

推荐约束：

- `rusqlite` 同步 API 在 `tokio::task::spawn_blocking` 中调用，避免阻塞异步运行时
- 对检索索引、任务审计、用户偏好建立生命周期与保留策略

## 安全与权限规则

必须遵守：

- `tauri.conf.json` 必须显式声明 `app.security.csp`，`withGlobalTauri` 默认关闭
- Tauri Command 采用 capability 白名单（`src-tauri/capabilities/*.json`）、类型化 contract 和显式输入校验
- WebView 发起的危险动作必须进入审批、确认或风险分级流程
- 密钥、令牌、凭据必须通过 `crates/credential/` 存储（keyring 优先，加密文件降级），不得进入普通配置、快照或日志
- `tauri-plugin-shell` / `tauri-plugin-dialog`（现行仅有的两个插件依赖）必须配置 scope 限制，禁止 `"all"` / `"**"` 通配（注：`tauri.conf.json` 的 `"targets": "all"` 为打包目标，不是权限通配）
- 文件系统写入必须显式限定作用域，禁止无边界任意路径写入
- 命令执行能力必须最小化、可审计、可拒绝、可回放上下文
- 任何扩权设计都必须同时更新测试、文档、风险说明和审计要求
- Rust `unsafe` 代码块必须有注释说明不变量，并优先用 safe abstraction 替代

## 恢复、容错与生命周期

必须遵守：

- 关键状态变更必须支持恢复，不因应用崩溃导致状态机不可判定
- 启动流程需要区分正常启动、异常恢复、迁移恢复、降级启动
- 后台任务、索引任务、审批中的任务必须具备中断恢复或可重建语义
- 窗口恢复、工作区恢复、最近任务恢复必须防止使用损坏状态直接把应用拉入坏路径
- 所有恢复逻辑都必须优先保证安全和数据一致性，而不是优先“看起来恢复成功”

## 性能与资源约束

必须遵守：

- 不在 WebView 主线程执行长时间阻塞 IO、重查询或大批量同步计算
- Rust 后端阻塞 IO（`rusqlite`、文件读写等）必须包在 `tokio::task::spawn_blocking` 中，避免堵塞 tokio runtime
- 大文本、索引、搜索结果、审计记录采用分页、分块或增量策略
- 主题切换、语言切换、工作区切换不能触发无边界全量重建
- 启动性能、空闲内存、索引期间 CPU 占用需要有预算意识，避免默认后台满载

推荐约束：

- 对高频状态更新使用细粒度订阅，避免整个界面随 store 广播重渲染
- 对检索、索引、日志和审计建立容量阈值与清理策略

## 日志、错误与审计

必须遵守：

- 错误必须具备稳定错误码、日志上下文和用户可理解反馈
- 日志默认分级，至少区分 `debug`、`info`、`warn`、`error`
- 日志中不得包含密钥、令牌、完整敏感路径内容或用户私密文本原文
- 审批、高风险命令、关键配置变更、迁移和恢复动作必须进入审计轨迹
- 审计记录应与普通运行日志分层，避免混杂和误删

## 测试与质量门禁

以下变更必须补齐测试计划与验证说明：

- Tauri Command contract 或 capability 变更
- 权限边界变更
- 配置 schema 变更
- SQLite schema 或迁移变更
- 国际化资源加载与语言切换逻辑变更
- 主题令牌、主题切换和系统主题跟随逻辑变更
- 恢复、审批、高风险动作流变更

最低要求：

- 单测（`cargo test` 内 `#[cfg(test)] mod tests`）覆盖纯业务规则、格式化逻辑、状态机和配置解析
- 集成测试（`crates/server/tests/`，`common/mod.rs` helpers）覆盖 Tauri Command、持久化、迁移、恢复和工作区关键链路
- 验收矩阵覆盖首批双语、三态主题、首次启动、升级迁移、异常恢复

发布前必须验证：

- `zh-CN` 与 `en-US` 关键页面无缺失翻译
- `light`、`dark`、`system` 在主要页面和高风险对话框上表现一致
- Windows 主路径正常；其他平台不因路径、字体或主题监听假设而结构性失败

门禁在**本地**执行（本项目无远程 CI），默认按变更范围：前端 `pnpm --dir ai-digital-life/frontend check:changed`（变更文件 lint/format + 类型与跨语言契约不变量 + `vitest related` 受影响用例；无 `src/` 变更则跳过测试）。全量门禁 `check:full`（再加 `test`）与 `cargo test --workspace`、Tauri 发布打包必须在执行前通知用户并获批准。Rust 侧受影响测试用 `cargo test -p <crate>`。

## 文档与治理同步

以下变化必须同步更新本文件及相关开发文档（同步清单以 `ai-digital-life/CONTRIBUTING.md` Must-Sync 为准：`docs/architecture/*`、CSP/capability 基线、SQLite/恢复策略、Workspace/Retrieval 边界、主题/i18n/真相源、双端三桥、Tauri 新增清单）：

- 技术基线变化
- 国际化策略变化
- 主题模式或 design token 策略变化
- 配置分层、状态真相源或持久化策略变化
- SQLite schema、迁移与恢复策略变化
- 权限边界、Tauri Command / capability 基线或审计要求变化
- 测试门禁或发布检查变化

若变更同时影响阶段边界，还必须同步：

- [AGENTS.md](../../AGENTS.md)

## 禁止项补充清单

明确禁止以下做法（完整禁止项以根 `AGENTS.md#禁止项` 为准，本节为工程侧补充）：

- 用硬编码中文文案替代 i18n 资源
- 用组件内散落颜色常量替代主题令牌
- 用 localStorage 式思路直接替代桌面应用的受控配置与持久化层
- 用单一 store 混合 UI 状态、配置真相源、数据库缓存和临时派生状态
- 用「先上线再补迁移」处理 schema 变更
- 用日志兜底代替审计
- 用系统权限直通代替审批或最小暴露 Tauri Command
- 用平台特例代码直接渗透到业务层
- 在 capability 文件中使用 `"all"` 或 `"**"` 通配权限
- 在 Rust 中使用未注释的 `unsafe` 代码块
- WebView URL 变化被动触发 navigate（必须由前端显式调用发起）
- 错误/状态提示常驻显示；调试日志（`console.log`/`[ADL-DEBUG]`）遗留生产代码
- 未经用户允许用蓝色（含 `var(--accent)` 系）作特殊提示/警醒/填充
- 未发布阶段添加数据格式兼容/旧版本迁移代码或向后兼容重导出（发布后需先与用户确认）

## 执行建议

为使本文件可执行，后续实现仓库应补齐以下配套机制：

- i18n 资源完整性检查
- 主题令牌与主题快照检查
- Tauri Command 类型检查（`serde` 派生）与输入校验
- 配置 schema 校验与迁移测试
- SQLite 迁移验收脚本
- `cargo clippy --workspace --all-targets -- -D warnings` 与 `cargo fmt --all -- --check` 阻断
- 前端 `lint`、`typecheck`（+ `typecheck:dev`）、`format:check`、`check:i18n`、`test` 阻断（见 CI）
- 发布前双语与三态主题 smoke checklist
