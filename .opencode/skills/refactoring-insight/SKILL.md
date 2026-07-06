---
name: refactoring-insight
description: Use when scanning a project for refactoring opportunities, code quality issues, or architecture improvements — generates insight report and executes refactoring plan
---

# 重构洞察（Refactoring Insight）

对项目执行系统性重构洞察，发现架构设计问题与性能优化机会，生成洞察报告，制定实施计划，并按计划执行重构。

**核心原则：** 所有修改不得破坏现有功能及 UI/UX。先小后大，每步验证。

---

## 触发条件

当用户表达以下意图时，立即调用本技能：
- "执行重构洞察" / "生成重构报告"
- "分析代码质量" / "扫描重构机会"
- "refactoring insight" / "code quality scan"
- 任何涉及项目级代码质量评估与重构规划的请求

---

## 技能联动总览

各阶段**固定使用**以下 Superpowers 技能：

| 阶段 | 技能 | 用途 | 必需 |
|------|------|------|------|
| 启动 | `using-git-worktrees` | 建立隔离工作区，保护主分支 | ✅ 必需 |
| 阶段 1 | `brainstorming` | 范围不明确时梳理目标与边界 | ⚡ 条件触发 |
| 阶段 2 | `dispatching-parallel-agents` | 四维度扫描并行执行 | ✅ 必需 |
| 阶段 3 | `verification-before-completion` | 验证洞察报告完整性 | ✅ 必需 |
| 阶段 4 | `writing-plans` | 生成结构化实施计划 | ✅ 必需 |
| 阶段 5A | `subagent-driven-development` | 子代理逐任务并行实施 | ✅ 模式A |
| 阶段 5A | `test-driven-development` | 含测试路径先写测试后改代码 | ✅ 模式A |
| 阶段 5A | `requesting-code-review` | 每任务完成后代码审查 | ✅ 模式A |
| 阶段 5B | `executing-plans` | 本会话批量执行 + 检查点回顾 | ✅ 模式B |
| 阶段 5 | `systematic-debugging` | 验证失败时系统化定位根因 | ⚡ 条件触发 |
| 阶段 6 | `verification-before-completion` | 最终验收 | ✅ 必需 |


---

## 总流程

```
0️⃣ 准备工作 → 1️⃣ 宏观审视 → 2️⃣ 系统扫描 → 3️⃣ 生成报告 → 4️⃣ 制定计划 → 5️⃣ 执行实施 → 6️⃣ 结束验收
```

---

## 0️⃣ 准备工作

**固定技能：`using-git-worktrees`**

调用 `Skill` 工具 `using-git-worktrees`，在隔离工作区中执行整个洞察与重构流程，保护主分支不被污染。

> 若已在隔离工作区中，跳过创建步骤，直接进入阶段 1。

### Worktree 约定

使用固定分支和工作区路径，确保每次重构都在同一个隔离环境中执行，并在远程仓库同步保留该分支。

| 项目 | 值 |
|------|-----|
| 分支名 | `refactor-insight-main` |
| 工作区路径 | `.worktrees/refactor-insight-main` |

**原则：** 固定名称，长期复用。本地和远程均保留该分支，每次执行前重置为本地 `main` 的当前状态，重构完成后再次推送到远程。

#### 准备工作树

基于本次对话上下文，由 Agent 自行判断 worktree 当前状态并执行相应操作：

- 检查 `refactor-insight-main` 分支和 `.worktrees/refactor-insight-main` 目录是否存在
- 若 worktree 已存在，重置为本地 `main` 的当前状态
- 若不存在，创建分支并添加 worktree
- 若目录受损或 `ai-digital-life` 子目录已被清理，先清理 worktree 元数据再重新创建
- 进入工作树根目录后，后续所有阶段在该目录下执行
- 完成后将分支推送到远程保留

### Worktree 重运行常见问题

详见 [WORKTREE-RERUN-ISSUES.md](./WORKTREE-RERUN-ISSUES.md)，记录了 CodeMirror 多实例冲突、pnpm frozen lockfile、Vite 依赖解析失败、TypeScript 大小写问题、JsonValue 类型缺失等已知问题及修复方案。

---

## 1️⃣ 宏观审视

建立全局视图，确定洞察方向。

> 💡 若重构目标/范围不明确，先调用 `brainstorming` 技能梳理。

### 1.1 架构概览
- 读取 `docs/重构洞察/REFACTORING_PROGRESS_REPORT.md` 了解已完成轮次
- 读取 `docs/重构洞察/REFACTOR_INSIGHTS_SUMMARY.md` 了解历史发现
- 读取最新 `docs/重构洞察/refactor-insight-*.md` 了解上轮遗留问题
- 检查 `.agents/rules/` 中相关规则文件了解架构约束

### 1.2 宏观统计
- 大文件分布（>500 行、>1000 行）
- `frontend/src/` 中 >800 行组件、>300 行 Hook
- `src-tauri/src/commands/` 和 `crates/` 中 >80 行函数
- CSS 大文件（>1000 行）和 `!important` 使用量

### 1.3 问题初判
- 上次洞察遗留的未处理项
- 违反架构约束的模块
- 新引入的膨胀组件/函数/文件

---

## 2️⃣ 系统扫描

**固定技能：`dispatching-parallel-agents`**

四个维度无依赖，调用 `dispatching-parallel-agents` 并行执行扫描。

### 2.1 前端 TypeScript/React
| 扫描项 | 阈值 |
|--------|------|
| 大组件文件 | >800 行 |
| 大 Hook 文件 | >300 行 |
| 重复 JSX | 可提取为组件 |
| 多组状态 | >5 组 useState |
| 深层相对导入 | `'../../'` 模式 |
| 硬编码字符串 | 非 i18n UI 文本 |
| `console.log` 残留 | 调试日志 |
| 选择器未 useShallow | `useAppStore` 调用 |
| React.memo 缺失 | 列表项组件 |

### 2.2 Rust 后端
| 扫描项 | 阈值 |
|--------|------|
| 大函数 | >80 行 |
| 多余 clone | `String` 参数仅引用传递 |
| 大 lib.rs | >300 行 |
| unwrap/expect | 错误处理不规范 |
| Mutex | 评估是否改 RwLock |

### 2.3 CSS 样式
| 扫描项 | 阈值 |
|--------|------|
| 大 CSS 文件 | >1000 行 |
| `!important` 滥用 | >10 处/文件 |
| 硬编码颜色 | hex/rgb/hsl（排除变量定义） |
| `transition: all` | 替换具体属性 |
| 死 CSS | 孤立 CSS 文件 |

### 2.4 跨领域
- 桥接层对齐（`tauri-bridge.ts` / `preview-bridge/` / `mock-bridge.ts`）
- IPC 契约一致性（`shared/ipc.ts` 与实现）
- 死代码（`@deprecated`、未使用的导出）
- Store 膨胀（>500 行的 slice）

> 📌 扫描结果超限时，按目录分批扫描，汇总后合并分析。

---

## 3️⃣ 生成洞察报告

### 输出文件
`docs/重构洞察/refactor-insight-YYYY-MM-DD.md`（确保输出目录存在，不存在则创建）

### 报告结构
```markdown
# 🏗️ 重构洞察报告
**生成日期**：YYYY-MM-DD

## 1️⃣ 架构与设计
| 位置 | 问题描述 | 优化建议 | 优先级 |
|------|----------|----------|--------|
| 文件:L行/函数 | 当前状态、影响范围 | 具体方案 | 🔴 / 🟡 / 🟢 |

## 2️⃣ 性能优化
| 位置 | 问题描述 | 优化建议 | 优先级 |
|------|----------|----------|--------|

## 3️⃣ 其他发现（可选）

### 📊 本轮统计数据
| 指标 | 数值 |
|------|------|
| 前端组件/Hook 提取 | N |
| Rust 函数拆分/clone 消除 | N |
| CSS 拆分/清理 | N |
| 预测代码行变化 | +N / -N |
```

### 优先级判定
| 优先级 | 标准 |
|--------|------|
| 🔴 高 | 功能正确性影响、架构严重违规、超大文件/函数（>1000 行）、大量重复代码 |
| 🟡 中 | 组件/函数超标未达临界、CSS 规范违规、性能可优化非瓶颈 |
| 🟢 低 | 代码风格改进、次要清理 |

### 报告验证

**固定技能：`verification-before-completion`**

调用 `verification-before-completion` 技能验证报告完整性：
- 是否覆盖所有四个扫描维度
- 是否每个问题都有具体的文件位置和优化建议
- 优先级判定是否与标准一致
- 是否遗漏明显的问题模式

---

## 4️⃣ 制定实施计划

**固定技能：`writing-plans`**

调用 `Skill` 工具 `writing-plans` 生成结构化实施计划文档。

### 输入
- 洞察报告路径：`docs/重构洞察/refactor-insight-YYYY-MM-DD.md`
- 重构目标和范围
- 优先级判定结果（🔴/🟡/🟢）

### 输出
`docs/superpowers/plans/refactor-plan-YYYY-MM-DD.md`

### 执行方式选择
`writing-plans` 技能生成计划后，提供两种执行方式：
1. **Subagent-Driven（推荐）** → 进入阶段 5A
2. **Inline Execution** → 进入阶段 5B

---

## 5️⃣ 执行实施

### 5A. Subagent-Driven 模式（推荐）

**固定技能：`subagent-driven-development` + `test-driven-development` + `requesting-code-review`**

每个任务执行流程：

```
test-driven-development → 执行变更 → 验证 → requesting-code-review → 下一任务
```

1. **执行前**：调用 `test-driven-development` — 含测试路径的变更先写测试
2. **执行中**：委派子代理执行最小变更
3. **执行后验证**：运行类型检查 + 测试
4. **任务完成后**：调用 `requesting-code-review` 进行代码审查

> 💡 **验证失败处理**：若连续 3 次完整的 TDD 循环（红-绿-重构，含类型检查 + 测试运行）后验证仍未通过，调用 `systematic-debugging` 系统化定位根因，不猜测性修复。

### 5B. Inline Execution 模式

**固定技能：`executing-plans`**

调用 `executing-plans` 技能在本会话中批量执行，带检查点回顾。

每项变更执行步骤：
1. 执行前：读取目标文件，确认当前状态
2. 执行变更：最小变更原则
3. 执行后验证：运行对应检查命令

> 💡 验证失败时同样调用 `systematic-debugging`。

### 进度追踪
- `docs/superpowers/plans/refactor-plan-YYYY-MM-DD.md` 中的 checkbox 追踪任务状态
- `docs/重构洞察/REFACTORING_PROGRESS_REPORT.md` 追加本轮记录

---

## 6️⃣ 结束验收

### 6.1 最终验证

**固定技能：`verification-before-completion`**

调用 `verification-before-completion` 技能执行最终验收：
- 类型检查通过
- 所有测试通过
- 无残留调试日志
- ESLint / Prettier / Clippy / rustfmt 四维门禁通过

### 6.2 变更影响映射与手动测试指引

静态检查无法覆盖所有 UI/UX 场景。重构完成后，**必须生成变更影响映射表**，标明每项修改涉及的功能模块和 UI 区域，指导用户进行针对性手动测试。

#### 生成方法

基于本次重构分支的变更集，由 Agent 自行确定合适的 diff 命令（如三点语法 `main...refactor-insight-main` 捕获分支完整增量），获取变更文件列表后按映射表规则匹配：

| 文件路径规则 | 涉及功能模块 | 需手动验证的 UI/UX 区域 |
|-------------|-------------|----------------------|
| `frontend/src/app/stores/slices/browser*.ts` | 浏览器面板 | 标签页导航/书签/历史记录/收藏文件夹 |
| `frontend/src/app/features/browser/**` | 浏览器面板 | 浏览器 iframe/导航栏/标签列表/着陆页 |
| `frontend/src/app/features/browser-tree/**` | 浏览器树 | 浏览器树条目/右键菜单/日期分组 |
| `frontend/src/app/features/editor/cmTheme.ts` | CodeMirror 编辑器 | 编辑器差异视图/折叠标记/合并按钮 |
| `frontend/src/app/features/diff-viewer/**` | 差异查看器 | 内联/并排差异视图/折叠行/merge 控制 |
| `frontend/src/app/features/file-tree/**` | 文件树 | 文件树渲染/虚拟滚动/TreeNodeRow |
| `frontend/src/app/features/patch-review/**` | 补丁审查 | 文件卡片/Hunk 卡片/决策按钮 |
| `frontend/src/app/features/terminal/**` | 终端面板 | xterm 实例/标签栏/Shell 选择/PTY 控制 |
| `frontend/src/app/features/workspace-terminal/**` | 工作区终端 | 终端标签/状态/路径展示 |
| `frontend/src/app/stores/**` | 全局状态 | 所有面板数据一致性/持久化/存储 |
| `frontend/src/app/stores/slices/*Slice.ts` | 对应切片 | 相应面板的数据加载/编辑/持久化 |
| `frontend/src/app/stores/actions/*.ts` | 对应 action 域 | 相应面板的操作流程（打开/保存/删除等） |
| `frontend/src/app/regions/**` | 对应区域面板 | 该面板的布局/渲染/交互 |
| `frontend/src/preview-bridge/**` | 浏览器模式桥接 | 浏览器模式下所有面板的功能可用性 |
| `frontend/src/tauri-bridge.ts` | Tauri IPC 桥接 | Tauri 桌面模式下所有 IPC 功能 |
| `frontend/src/app/i18n/**` | 国际化 | 中英文切换后所有面板的文本显示完整性 |
| `frontend/src/styles/**` | CSS 样式系统 | 受影响面板的布局/颜色/动画/响应式 |
| `frontend/src/shared/**` | 共享模块 | 依赖该共享模块的所有功能路径 |
| `src-tauri/src/**` | Tauri 后端 | 对应命令的后端功能 |
| `crates/**` | Rust crate | 对应 crate 的后端功能 |
| `docs/**` | 文档 | 无（仅文档变更，不影响功能） |
| `*`（未匹配以上任何规则） | 需手动分析 | 通过 `git diff <file>` 分析文件依赖关系，使用项目目录结构确定受影响的功能模块和 UI 区域 |

#### 输出文件

`docs/重构洞察/regression-test-guide-YYYY-MM-DD.md`（与洞察报告同目录）

#### 文件格式

```markdown
# 变更影响映射与手动测试指引

**生成日期**：YYYY-MM-DD
**重构轮次**：第 N 轮

## 变更文件统计

- 总计：N 个文件变更（+N / -N 行）
- 新增：N 个文件
- 删除：N 个文件

## 变更影响映射

| 变更范围（文件路径摘要） | 影响模块 | 建议手动验证 |
|-------------------------|---------|-------------|
| `<文件列表摘要>` | `<功能模块>` | `<UI/UX 测试项>` |

## 手动测试清单

- [ ] `<功能模块1>`：<具体测试项>
- [ ] `<功能模块2>`：<具体测试项>
```

#### 示例

如果本次变更修改了 `cmTheme.ts` + `editor-content.css` + `diff-viewer.css`，则生成：

```markdown
# 变更影响映射与手动测试指引

**生成日期**：2026-07-03
**重构轮次**：第 92 轮

## 变更文件统计

- 总计：5 个文件变更（+200 / -100 行）
- 新增：2 个文件
- 删除：0 个文件

## 变更影响映射

| 变更范围 | 影响模块 | 建议手动验证 |
|----------|---------|-------------|
| cmTheme.ts, editor-content.css, diff-viewer.css | CodeMirror 差异视图 | 打开一个包含差异的文件，切换 inline/side-by-side 模式，验证折叠行显示和 merge 控制按钮正常 |

## 手动测试清单

- [ ] CodeMirror 差异视图：打开包含差异的文件，切换 diff 模式
- [ ] CodeMirror 差异视图：验证折叠行展开/收起
- [ ] CodeMirror 差异视图：验证 accept/reject 按钮功能
```

#### 执行约束

- 在 squash merge 的 `git commit` 之前完成映射分析并写入文件
- 若映射结果为空（仅文档/配置文件变更），明确标注"仅文档变更，无功能影响"
- 即使所有自动化测试通过，也不得跳过此步骤

### 6.3 Squash 合并到本地 main + 推送重构分支到远程

将所有重构任务的**最终代码状态**作为一次变更合并到本地 `main` 分支，然后将重构分支推送到远程以保留完整历史，供后续复盘查看。

由 Agent 自行判断并执行以下操作：

1. **收集提交信息**：获取重构分支的所有提交记录（`main..refactor-insight-main`），用于编写 commit message
2. **切换到 main 分支**：切换到主仓库的本地 `main` 分支
3. **Squash 合并**：将重构分支的最终代码状态作为一次变更暂存（`git merge --squash`）
4. **提交合并**：commit message 需结构化，首行为重构轮次与核心摘要，正文分段列出所有提交记录和核心改动说明
5. **推送重构分支到远程**：保留全部原始提交历史，供后续复盘

**注意：**
- **不推送本地 main 到远程** — main 的合并结果留给用户亲手测试后自行决定推送时机
- `git merge --squash` 不会保留重构分支的每个 commit 历史，main 上只产生一个 commit
- 重构分支推送到远程后，下次执行 Stage 0 会被重置为本地 main 的最新状态

---

## 约束

| 约束 | 说明 |
|------|------|
| 核心原则 | 所有修改不得破坏现有功能效果及 UI/UX |
| 最小变更 | 仅修复发现的问题，不做无关变更 |
| 禁止跨 Phase | 不引入超出当前 Phase 范围的功能或架构变更 |
| 禁止猜测 | 无法定位根因时使用 `systematic-debugging` |
| 工作区隔离 | 洞察和实施均在隔离工作区中执行 |
| 验收强制 | 全部变更完成后执行结束验收流程 |

---

## 相关文件

| 文件 | 用途 |
|------|------|
| `docs/重构洞察/refactor-insight-*.md` | 每日洞察报告 |
| `docs/superpowers/plans/refactor-plan-*.md` | 每日实施计划（由 writing-plans 生成） |
| `docs/重构洞察/REFACTORING_PROGRESS_REPORT.md` | 累计进度报告 |
| `docs/重构洞察/REFACTOR_INSIGHTS_SUMMARY.md` | 洞察汇总索引 |
| `.agents/rules/phase-boundary.md` | 阶段边界约束 |
| `.agents/rules/mandatory-testing.md` | 验收流程 |
| `.agents/rules/commands.md` | 项目命令参考 |
