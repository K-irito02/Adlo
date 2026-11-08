# RULES — 规则系统

> **单一真源**：本文件是仓库内**规则系统**的唯一说明文档——分层定位、三目录同步、文件规范、加载机制、规则清单与变更流程。
> 规则**条文**仍存放在 `.agents/rules/*.md`（按内容域拆分，可独立引用）；治理总纲见 [AGENTS.md](./AGENTS.md)，技能体系见 [SKILLS.md](./SKILLS.md)。

---

## 1. 规则系统说明

### 1.1 规则是什么

规则（Rule）是把**长期有效的硬约束**从对话上下文固化为文件的产物：编码规范、架构边界、门禁流程、命名约定等。与技能的区别在于**生效方式**：

| 维度 | 规则（Rules） | 技能（Skills） |
|------|---------------|----------------|
| 生效方式 | **被动常驻 / 按路径自动注入**，无需主动调用 | **主动加载**，代理判断需要时调用 |
| 内容形态 | 约束（必须 / 禁止 / 阈值 / 反例） | 流程（步骤 / 阶段 / 检查清单） |
| 存放位置 | `.agents/rules/*.md` | `.agents/skills/*/SKILL.md` |
| 说明文档 | 本文件 | [SKILLS.md](./SKILLS.md) |

### 1.2 文档分工与优先级

| 文档 | 职责 | 是否承载具体条文 |
|------|------|------------------|
| `AGENTS.md` | 治理总纲：项目定位、双根结构、禁止项摘要、流程入口 | 摘要（详细条文以规则文件为准） |
| **`RULES.md`**（本文件） | 规则系统的**说明与索引**：分层、同步、规范、清单、变更流程 | 否（只索引导航） |
| `.agents/rules/*.md` | 具体规则条文 | **是**（唯一权威） |
| `SKILLS.md` | 技能系统说明与摘要 | 否 |
| `docs/` | 设计文档、实施计划、经验知识库 | 叙述性内容，不构成约束 |

**冲突裁决**：具体规则条文 > `AGENTS.md` 摘要 > `docs/` 叙述。发现冲突时修改低优先级一方，并在另一处留交叉引用，不重复正文。

### 1.3 规模

当前 **45 条规则**（不含本目录的 `README.md` 索引）：

| 应用方式 | 条数 | 含义 |
|----------|------|------|
| `alwaysApply: true` | 7 | 全局常驻，任何任务都生效 |
| `alwaysApply: false` + `globs` | 38 | 命中指定路径时才注入，减少无关上下文 |

> 条数以 `.agents/rules/` 实际文件为准；`scripts/check-agent-dirs.test.mjs` 会在 pre-commit 校验本表与目录一致。

---

## 2. 三规则目录

| 目录 | 角色 | 说明 |
|------|------|------|
| `.agents/rules/` | **真源** | 唯一编辑入口。新增、修改、删除规则均先在此完成 |
| `.opencode/rules/` | 同步备份 | 由真源同步而来，内容必须与真源逐文件一致 |
| `.trae/rules/` | 同步备份 | 由真源同步而来，内容必须与真源逐文件一致 |

---

## 3. 同步规则

1. **保持一致**：三个目录必须始终保持一致（同文件名、同内容）。
2. **改一同步二**：每次新增 / 修改 / 重命名 / 删除规则后，立即同步到另外两个目录，禁止只改单目录。
3. **先改真源**：备份目录不直接编辑；副本出现真源没有的差异时，先核对——正确则补入真源，否则丢弃。
4. **同步后登记**：新增或删除规则必须同步更新本文件 §6 清单与 §1.3 条数。
5. **校验方式**：pre-commit 自动执行 `scripts/check-agent-dirs.test.mjs`（三目录逐文件哈希 + 本文件条数/清单）。手动检查：

   ```bash
   node adlo/scripts/check-agent-dirs.test.mjs
   diff -r .agents/rules .opencode/rules
   diff -r .agents/rules .trae/rules
   ```

---

## 4. 规则文件规范

### 4.1 位置与命名

- 路径：`.agents/rules/<topic>.md`，单层平铺，不再建子目录。
- 命名：kebab-case，按**约束对象**命名而非动作，例如 `rust-use-statement-ordering-convention.md`、`hint-color-usage.md`。
- 一个文件只负责一个约束域；同一域内条目过多时才考虑拆分。

### 4.2 YAML frontmatter（必填）

| 字段 | 必填 | 取值 | 说明 |
|------|------|------|------|
| `description` | 是 | 单行字符串 | 一句话说明该规则约束什么；中英均可，优先中文 |
| `alwaysApply` | 是 | `true` / `false` | `true` = 全局常驻；`false` = 依赖 `globs` 命中 |
| `globs` | `alwaysApply: false` 时必填 | 逗号分隔路径模式 | 支持 `*`、`**`，相对仓库根；`alwaysApply: true` 时不写 |

```yaml
---
description: 前端测试文件必须放置在待测模块同级目录下的 __tests__/ 子目录中
globs: adlo/frontend/src/**
alwaysApply: false
---
```

> 选型建议：跨技术栈、任何任务都适用的约束用 `alwaysApply: true`；只对特定目录/文件类型有意义的用 `globs`（例如 Rust 命名约定只应在改 Rust 时进入上下文）。新增代码目录后记得回头补 `globs`。

### 4.3 正文结构（建议）

```markdown
# <约束主题>

## 适用范围        # 什么情况受此约束、什么情况不适用
## 规则            # 逐条编号的强制要求，可含阈值与判定方式
## 正例 / 反例      # 至少一组对照，便于机械判定
## 检查清单        # 自检或审查时逐项勾选
```

### 4.4 编写约束（元规范）

| 约束 | 说明 |
|------|------|
| 可判定 | 写阈值、命令、明确的反例，不写“尽量”“合理”这类无法判定的表述 |
| 单一职责 | 一个文件一个约束域；不同技术栈不混装 |
| 不重复 | 不复述 `AGENTS.md` 摘要与 `docs/` 叙述，需要时交叉引用 |
| 不写死易变统计 | 文件数、规则数、测试数等改为“以实际为准”，避免文档随代码腐化 |
| 正文用中文 | 术语与标识符保留原文（如 `ipc_try()`、`AppError`） |
| 无过渡态 | 未发布阶段不写兼容层、旧路径迁移等过渡方案 |

---

## 5. 加载与应用机制

规则由 harness 按 frontmatter 决定是否进入上下文，**不依赖目录顺序或人工挑选**：

| 机制 | 行为 | 适用 |
|------|------|------|
| `alwaysApply: true` | 每次会话常驻注入 | 全域约束（项目形态、执行规则、验收门禁） |
| `globs` 命中 | 仅当任务涉及匹配路径的文件时注入 | 语言 / 框架 / 目录级约定 |

**始终应用的 7 条**（`alwaysApply: true`）：

| 规则文件 | 覆盖内容 |
|----------|----------|
| `project-overview.md` | 项目总览、双根结构、技术栈 |
| `phase-boundary.md` | 项目形态、范围边界与排除项 |
| `dev-rules.md` | 代理交互与执行规则 |
| `preference-writes.md` | 用户偏好只由用户操作写入，后台逻辑不得静默改写 |
| `mandatory-testing.md` | 结束验收与强制红绿测试 |
| `error-handling.md` | 错误处理与加载状态 |
| `shell-encoding.md` | 终端中文编码、只读场景与批量替换约束 |

> 其余 38 条按 `globs` 生效，清单见 §6「应用方式」列。（`commands.md` 与 `multi-dimensional-architecture-design.md` 自 2026-11-09 起改为 `adlo/**` 命中才注入。）
> `ui-patterns.md`（944 行速查表）自 2026-10-31 起改为**按需查阅**，入口见 `docs/design-system/README.md`。

---

## 6. 规则清单

> 分组仅用于**导航**，不参与加载判定（加载只看 frontmatter）。「应用方式」标注 `始终` 或 `glob` 的作用域摘要，完整模式以各文件 frontmatter 为准。

### 6.1 治理与项目形态（6）

| 规则文件 | 应用方式 | 约束内容 |
|----------|----------|----------|
| `project-overview.md` | 始终 | 项目总览：双根结构、技术栈、双端架构与真源位置 |
| `multi-dimensional-architecture-design.md` | `adlo/**` | 多维度架构（代码 / 部署 / 数据 / 安全 / 接口 / 性能）与架构事实的唯一真源 |
| `phase-boundary.md` | 始终 | 项目形态、范围边界与排除项，防止范围蔓延 |
| `codebase-map.md` | `adlo/**` | 代码地图：Cargo 工作区、前端目录、包列表与索引策略 |
| `dev-rules.md` | 始终 | 代理交互与执行规则：询问卡片、终端命令、代码修改、问题排查、编码风格、并行工作树约束 |
| `preference-writes.md` | 始终 | 用户显式选择类配置只由用户操作写入，后台 effect/定时器不得静默改写偏好 |

### 6.2 质量与验收（3）

| 规则文件 | 应用方式 | 约束内容 |
|----------|----------|----------|
| `mandatory-testing.md` | 始终 | 结束验收流程与强制红绿测试（不涉及 UI 视觉验证） |
| `quality-gates.md` | 测试 / 前端 / crates / src-tauri | 测试、类型检查、lint、格式化、迁移与合并前门禁 |
| `error-handling.md` | 始终 | 错误处理、加载状态与前后端统一动作模式（`AppError` 体系） |

### 6.3 操作与验证（3）

| 规则文件 | 应用方式 | 约束内容 |
|----------|----------|----------|
| `commands.md` | `adlo/**` | 常用命令与环境设置速查（脚本入口） |
| `desktop-ui-verification.md` | `frontend/**` | 桌面端 UI 验证：改 UI 后必须重启应用确认双端一致 |
| `shell-encoding.md` | 始终 | 终端中文编码与批量替换：禁止内联 CJK 替换、禁止根目录递归扫描 |

### 6.4 Rust 后端（9）

| 规则文件 | 应用方式 | 约束内容 |
|----------|----------|----------|
| `rust-patterns.md` | `crates/**`、`src-tauri/**` | Rust 性能模式（`LazyLock` 缓存等）、crate 治理、数据库规范 |
| `rust-command-domain-action-naming.md` | `src-tauri/src/commands/**` | Tauri Command 函数 `{domain}_{action}` 蛇形命名 |
| `rust-crate-adl-prefix-convention.md` | `crates/*/Cargo.toml` | 内部 crate 统一 `adl-` 前缀 |
| `rust-crate-lib-barrel-export-pattern.md` | `crates/*/src/lib.rs` | lib.rs 公共 API 桶导出（模块声明 + 集中 `pub use`） |
| `rust-inline-cfg-test-pattern.md` | `crates/**`、`src-tauri/**` | 单元测试内联在源文件末尾，不建独立 `tests/` |
| `rust-use-statement-ordering-convention.md` | `crates/**`、`src-tauri/**` | `use` 三段式排序：std → 外部 crate → `adl_*` |
| `rust-server-handler-recipe-pattern.md` | `crates/server/**` | ad-server HTTP handler 统一四步配方与阻塞隔离 |
| `serde-default-rename-all-convention.md` | `crates/**/types/**` | 跨 IPC 类型必须同时 `#[serde(default)]` 与 `#[serde(rename_all)]` |
| `tagged-enum-camelcase-serde-pattern.md` | `crates/types/**` | 共享类型 `rename_all = "camelCase"` + `tag = "type"` 序列化 |

### 6.5 跨端契约与桥接（6）

| 规则文件 | 应用方式 | 约束内容 |
|----------|----------|----------|
| `tauri-shell.md` | `src-tauri/**`、`frontend/**`、`crates/**` | 后端 / 命令 / WebView 边界、安全基线、capability 白名单 |
| `tauri-command-ipc-wrapper-pattern.md` | `src-tauri/**` | 命令统一走 `ipc()` / `ipc_try()` 包装器 |
| `tauri-event-subscription-lifecycle-pattern.md` | `tauri-bridge/**`、`app/**`、`shared/**` | 事件订阅生命周期：异步 unlisten 幂等清理、竞态守卫 |
| `ts-rs-type-generation-barrel-import.md` | `crates/**`、`frontend/src/kernel/**` | ts-rs 自动生成 TS 类型 + kernel 桶导入 |
| `bridge-three-implementation-pattern.md` | `ipc/**`、各 bridge、`mock/**` | Bridge 三实现（Tauri / Preview / Mock）行为对齐 |
| `cross-language-constant-contract.md` | 前后端常量文件 | 跨语言常量契约：两侧钉值测试 + 交叉引用注释 |

### 6.6 前端架构与状态（7）

| 规则文件 | 应用方式 | 约束内容 |
|----------|----------|----------|
| `component-architecture.md` | `frontend/**` | 组件体量阈值、拆分策略与 Hook 提取 |
| `zustand-patterns.md` | `frontend/**` | Zustand 切片合并、选择器与 Store 架构 |
| `react-ref-mirror-latest-pattern.md` | `frontend/**` | Ref 镜像最新值，避免过期闭包与监听器重绑 |
| `createlazyloader-factory-pattern.md` | `frontend/**` | `createLazyLoader` 按工作区 ID 分片懒加载 |
| `localstorage-central-registry-persistence-architecture.md` | `stores/**` | localStorage 中心登记表：唯一写盘入口 + 构造期水合 |
| `store-action-jsdoc-annotation-convention.md` | `stores/actions/**` | Store Action 标准 JSDoc（reads / writes / see IPC） |
| `region-layout-shell-architecture.md` | `app/regions/**` | Region 布局壳：shell 布局与领域功能分离 |

### 6.7 导入、标识与测试组织（3）

| 规则文件 | 应用方式 | 约束内容 |
|----------|----------|----------|
| `frontend-at-alias-convention.md` | `frontend/src/**` | 统一 `@` 别名导入，禁止深层相对路径 |
| `branded-nominal-type-id.md` | `shared/**` | `Branded<T, B>` 名义类型保护领域 ID，IPC 边界集中收窄 |
| `frontend-test-tests-co-location.md` | `frontend/src/**` | 测试文件放在待测模块同级的 `__tests__/` |

### 6.8 样式与设计（5）

| 规则文件 | 应用方式 | 约束内容 |
|----------|----------|----------|
| `css-architecture.md` | `frontend/**/*.css` | CSS 拆分阈值、死 CSS 预防、布局稳定性 |
| `css-adl-prefix-private-variable-naming.md` | `frontend/**/*.css` | 公共 Token 无前缀、组件/区域私有变量 `--adl-` 前缀 |
| `design-system.md` | `frontend/**` | 设计系统约束、主题、组件规范与可访问性 |
| `ui-patterns.md` | 按需（`docs/design-system/README.md` 入口） | UI 模式速查唯一入口（对话框 / 菜单 / 悬停 / 点击 / 颜色 / Hint Card / 按钮 / 文件树 / Tooltip / Toast） |
| `hint-color-usage.md` | `frontend/**` | 提示色规范：拖拽手柄、分界线用中性色，禁用 accent 蓝 |

### 6.9 i18n 与图标（3）

| 规则文件 | 应用方式 | 约束内容 |
|----------|----------|----------|
| `usetcopy-i18n-context-pattern.md` | `frontend/src/**` | `useTCopy()` + `TCopyContext` 编译期类型安全 i18n |
| `i18n-dictionary-domain-split-organization.md` | `app/i18n/**` | 字典按语言包 / 领域拆分，经 barrel 合并 |
| `svg-icon-domain-split-organization.md` | `app/icons/**` | SVG 图标按领域拆分（`make` 工厂族 + 桶导出） |

---

## 7. 新增 / 修改 / 删除规则

1. **判断归属**：新约束是否属于已有规则的约束域？属于则改现有文件，否则新建。
2. **写文件**：按 §4.2 写 frontmatter，按 §4.3 组织结构；不复述已有规则。
3. **登记**：在 §6 对应分组表加一行（文件 / 应用方式 / 约束内容），同步更新 §1.3 的条数与分布。
4. **同步**：从 `.agents/rules/` 复制到 `.opencode/rules/` 与 `.trae/rules/`，用 §3 的命令校验。
5. **联动**：若约束属于 AGENTS.md「禁止项」级别，在 AGENTS.md 增一条摘要并交叉引用规则文件。
6. **审计**：规则覆盖面、重复与漂移由 `governance-audit` 技能按七维检查（Tier 1 七维全量）。

**删除规则前**必须确认：无其他规则、`AGENTS.md`、`SKILLS.md`、`docs/`、代码注释引用它；被引用则先消除引用。

---

## 8. 附录：变更类型 → 需同步的规则文件

| 变更类型 | 需更新的规则文件 |
|----------|------------------|
| 新增 / 重命名 package、目录结构调整 | `codebase-map.md` |
| 项目形态、范围边界变化 | `phase-boundary.md`、`project-overview.md` |
| 技术栈 / 双端架构变化 | `project-overview.md`、`multi-dimensional-architecture-design.md`、`tauri-shell.md` |
| Tauri Command 新增或边界变化 | `tauri-shell.md`、`rust-command-domain-action-naming.md` |
| IPC 包装模式变化 | `tauri-command-ipc-wrapper-pattern.md` |
| 事件订阅生命周期变化 | `tauri-event-subscription-lifecycle-pattern.md` |
| Bridge 三实现架构变化 | `bridge-three-implementation-pattern.md` |
| 共享类型 / serde 序列化变化 | `tagged-enum-camelcase-serde-pattern.md`、`serde-default-rename-all-convention.md` |
| 类型生成与桶导入变化 | `ts-rs-type-generation-barrel-import.md` |
| 跨语言共享常量变化 | `cross-language-constant-contract.md` |
| 领域 ID 名义类型变化 | `branded-nominal-type-id.md` |
| crate 新增 / 命名变化 | `rust-crate-adl-prefix-convention.md` |
| Rust 性能模式 / DB 规范变化 | `rust-patterns.md` |
| Rust 测试组织方式变化 | `rust-inline-cfg-test-pattern.md` |
| Rust 代码风格（use 排序等）变化 | `rust-use-statement-ordering-convention.md` |
| 服务端 handler 配方变化 | `rust-server-handler-recipe-pattern.md` |
| Store / 状态管理变化 | `zustand-patterns.md`、`store-action-jsdoc-annotation-convention.md` |
| localStorage 持久化架构变化 | `localstorage-central-registry-persistence-architecture.md` |
| 惰性加载工厂模式变化 | `createlazyloader-factory-pattern.md` |
| 组件拆分阈值 / 架构变化 | `component-architecture.md` |
| Ref 镜像模式变化 | `react-ref-mirror-latest-pattern.md` |
| 前端导入约定变化 | `frontend-at-alias-convention.md` |
| 前端测试组织方式变化 | `frontend-test-tests-co-location.md` |
| Region 布局架构变化 | `region-layout-shell-architecture.md` |
| CSS 架构 / 变量命名变化 | `css-architecture.md`、`css-adl-prefix-private-variable-naming.md` |
| 设计系统 / 主题变化 | `design-system.md` |
| 提示色规范变化 | `hint-color-usage.md`、`design-system.md` |
| UI 模式变化 | `ui-patterns.md` |
| i18n 实现模式变化 | `usetcopy-i18n-context-pattern.md` |
| i18n 字典组织结构变化 | `i18n-dictionary-domain-split-organization.md` |
| SVG 图标组织变化 | `svg-icon-domain-split-organization.md` |
| 测试命令 / 脚本入口变化 | `quality-gates.md`、`commands.md` |
| 错误处理 / Loading 模式变化 | `error-handling.md` |
| 验收流程 / 测试分级变化 | `mandatory-testing.md` |
| 桌面端验证流程变化 | `desktop-ui-verification.md` |
| 代理交互 / 终端执行规则变化 | `dev-rules.md` |
| 并行开发流程 / 工作树策略变化 | `dev-rules.md`、技能 [parallel-branch-development](.agents/skills/parallel-branch-development/SKILL.md) |
| 外部参考源码（`references/`）变化 | `project-overview.md`、`AGENTS.md` |
