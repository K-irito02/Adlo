# 重构洞察执行记录（汇编）

「重构洞察执行」系列经验汇编（第 8~12 次执行 + 2026-07-01 全流程执行），按执行时间顺序收录。来源为 `docs/refactoring-insight/report/progress/REFACTORING_PROGRESS_REPORT.md` 及各期每日洞察报告。

## 2026-06-13：重构洞察第 8 次全量执行经验

### 本轮回合概览

| 轮次 | 范围 | 任务数 |
|------|------|--------|
| 第六十一轮 | CSS 变量主题化、shared.ts 拆分、Hook 提取、切片拆分、骨架抽象、CSS 拆分、Rust 测试 | 8 项 |

### 经验教训

#### 1. CSS 变量定义位置决定主题能力

**问题**：`files-panel.css` 中定义了 35 处 `--adl-file-badge-ink` 变量，但定义在组件级 CSS 文件中，导致暗色主题无法自动切换。

**原则**：主题相关的 CSS 自定义属性（如颜色变量）必须定义在 `themes.css` 的主题块（`[data-theme='light']` / `[data-theme='dark']`）中，而非组件 CSS 文件。组件 CSS 仅通过 `var()` 引用。

#### 2. 模块拆分时 barrel 策略选择

**场景**：将 433 行的 `shared.ts` 拆分为 `storageHelpers.ts`（localStorage）和 `cacheHelpers.ts`（缓存/序列）。

**经验**：当源文件有 30+ 个消费方时，保留原文件作为 barrel（`export * from './newFile1'; export * from './newFile2'`）是最安全的策略。零 import 路径变更即可完成拆分。测试文件中直接读取源文件内容的（如 `loadingPerformance.test.ts`）需要更新路径断言。

#### 3. ChangesPanel Hook 提取的"拆散"模式

**场景**：840 行的 ChangesPanel.tsx 拆分为 237 行组件 + 775 行 Hook。

**经验**：当大型面板组件只有一个消费方（自身 JSX）时，"拆散"模式（将原大组件内的所有 useEffect/useState/useCallback/useRef 全部提取到一个 hook）是最优解。提取后需要：
- 更新所有引用该源文件的测试（`changesEditorOptions.test.ts`、`outlinePanelWiring.test.ts`）
- 检查有无直接断言源文件内容字符串的测试

#### 4. 树节点组件的 Slot 骨架模式

**场景**：BrowserTreeEntry（552 行）和 GitHubTreeEntry（991 行）共享 60% 的渲染结构。

**经验**：使用 slots 模式的骨架组件 `MultiTreeEntryShell.tsx`（接受 `actionButtonsSlot`、`entryMenuSlot`、`children`、`extraContent`）是最安全的抽象方式：
- 纯 slots 模式（无侵入性 props）确保 React.memo 仍然有效
- 两个 Entry 组件的独特逻辑（CI 配置、Pin/Unpin、菜单项构建）完全保留，Shell 仅提供 HTML 骨架
- Portal 渲染和 CSS 类名保持不变

#### 5. CSS 文件拆分的"保留原件"安全策略

**场景**：将 1153 行的 `browser-panel.css` 拆分为 3 个文件。

**经验**：从不立即删除源文件——保留未修改的 `browser-panel.css` 作为安全网。只需在 `@import` 链中将原单行导入替换为三行新导入。样式验证通过后可以在后续轮次中删除源文件。

#### 6. Rust 测试的 Windows 平台兼容性

**场景**：为 `emit_model_stream_events` 添加单元测试。

**经验**：Tauri 在 Windows 测试线程中无法创建事件循环（`tao` 限制），因此真实 AppHandle 调用测试必须用 `#[cfg(not(windows))]` 隔离。核心算法逻辑（分块、seq 计算）测试与平台无关，应优先编写可通过纯逻辑验证的测试。

#### 7. 逆向膨胀监控

**场景**：browserpanel.tsx 在 Hook 提取阶段从 729 行增长到 948 行（+30%）。

**教训**：当模块级辅助函数（模块顶层非组件内联函数）超过 3 个时，必须立即提取到独立文件，否则会导致组件文件在重构过程中大幅膨胀。在本次执行中提取了 `browserPanelHelpers.ts`，行数从 948 降至 877 行。这个发现已被加入项目规则，在执行大重构前应优先扫描模块级辅助函数。

### 对应检查清单项

- [x] CSS 主题色变量不在 themes.css 中 → 迁移并补充暗色变体
- [x] 大型单文件 > 300 行 → 评估拆分（ChangesPanel 840→237 行）
- [x] 大型 Store 切片 > 500 行 → 按领域拆分（githubSlice 729→CiConfig+CiStatus）
- [x] 树节点组件模式重复率 > 50% → 提取共享骨架
- [x] 大型 CSS 文件 > 1000 行 → 按子区域拆分（browser-panel 1153→3 文件）
- [x] 核心 Rust 函数零测试覆盖 → 添加单元测试（agent_pipeline 13 测试）
- [x] 模块级辅助函数 > 3 个 → 提取独立文件

## 2026-06-14：重构洞察执行经验（第六十二/六十三轮）

### 本轮回合概览

| 轮次 | 范围 | 任务数 |
|------|------|--------|
| 第六十二轮 | 路径别名、性能优化、组件提取、事件委托 | 7 项 |
| 第六十三轮 | ESLint/Prettier 门禁全量清零 | 208 warnings→0 |

### 经验教训

#### 1. TypeScript 路径别名是深层导入的唯一解

**问题**：47+ 处文件使用 `../../../../shared/ipc` 等深层相对导入（最深 5 层），代码难以重构、难以阅读。

**实施过程**：
- 需要同时修改 `tsconfig.json`（TypeScript 编译时解析）和 `vite.config.ts`（Vite 运行时解析）
- 测试文件中的字符串断言（如 `changesEditorOptions.test.ts` 中 `expect(source).toContain("'../../../../...'")`）必须同步更新
- Vite `resolve.alias` 使用 `path.resolve(__dirname, ...)`，tsconfig `paths` 使用相对 `baseUrl` 的路径——两者路径基准不同
- `@app`（无 `/*`）和 `@app/*` 的区别：前者用于引用 exact 路径，后者用于 `@app/xx/yy` 模式

**经验**：替换前先 grep 全仓库找出所有 `../../../../` 模式统计范围；用子 Agent 批量替换比手动逐文件修改更安全；替换后必须运行 `npx tsc --noEmit` 验证；grep 旧相对路径的引用防止测试字符串断言遗漏。

#### 2. NavigatorResizeHandle 提取揭示了"相同结构但不同数据"的 DRY 模式

**场景**：6 个文件中有几乎完全相同的 `<div>` 缩放手柄 JSX，仅 `aria-valuemax`（300 vs 420）和 `aria-label` 文本不同。

**经验**：当 3 个以上文件包含同一个 JSX 片段时，即使差异很小，提取共享组件也值得：未来修改只需改 1 处、消除约 30 行重复。共享组件的 `onPointerDown` prop 类型必须精确——泛型 `PointerEvent` 会导致类型不兼容错误。

#### 3. 右键菜单 Hook 提取后的"孤儿 import"陷阱

**场景**：将 `FileNavigatorShell.tsx` 和 `useChangesPanelState.tsx` 中的 `getContextMenuItems` 提取到 `useFileContextMenuItems.tsx` 后，两个源文件留下大量已无需使用的 icon import 和类型导入。

**教训**：提取代码到 Hook 后必须立即检查源文件 import 块删除未使用导入。AI 工具提取时倾向于保留旧 import。这些"孤儿 import"是后续 ESLint `no-unused-vars` 警告的来源。修复方法：提取完成后立即运行 `npx eslint src/` 检查，或 grep 每个旧导入变量确认使用情况。

#### 4. 事件委托修复 React.memo 的边界条件

**场景**：虚拟列表 `fileTree.tsx` 中，`onMouseEnter`/`onMouseLeave` 内联回调导致 `React.memo` 完全失效。

**关键设计决策**：
- 使用 `mouseover`/`mouseout`（冒泡事件）而非 `mouseenter`/`mouseleave`（非冒泡）——这是委托模式的基础
- 必须使用 `e.target.closest('[data-path]')` 防止子元素（图标、文字）事件冒泡导致 `setHoveredPath` 过度触发
- 需要处理 `relatedTarget` 来判断鼠标是否真正离开当前节点（避免子元素间移动时的闪烁）

**验证方法**：文件树 hover 高亮行为必须 1:1 等同于旧的内联回调模式。

#### 5. useRef 回调稳定化需要注意 useEffect 清理函数

**场景**：`InlineDiffViewer.tsx` 和 `SideBySideDiffViewer.tsx` 中用 `useRef` 存储 `onMount` 和 `onCollapsedUnchangedRangesChange`。

**关键规则**：
- `onMountRef.current = onMount` 必须在组件 render 阶段（非 effect 内）赋值，否则首次 mount 时 ref 值为旧值
- useEffect 依赖数组中移除了回调引用后，effect 内部应始终通过 `ref.current` 访问最新回调
- 如果 effect 有清理函数（返回 `unsubscribe` 等），清理函数不应依赖 ref 的当前值（可能已被下一次 effect 覆盖）

#### 6. 四维门禁清零后防止再次退化

**问题**：208 个 ESLint warning 清零后，如何防止新增代码再次引入告警？

**建议**：CI/CD 中配置 `npx eslint src/ --max-warnings 0` 作为门禁；每次重构提取代码后自动运行 `npx eslint` 检查"孤儿 import"；Prettier 格式化在 commit hook 或 IDE save action 中自动执行。

### 对应检查清单项

- [x] 深层 `../../../../` 导入 → 路径别名 + 41 条替换
- [x] 大型组件 > 500 行 → NavigatorResizeHandle + useFileContextMenuItems 提取
- [x] 性能热点（DiffViewer 编辑器频繁重建） → useRef 稳定化回调
- [x] 性能热点（虚拟列表 memo 失效） → 事件委托
- [x] 性能热点（书签 O(n×m)） → Set 预构建
- [x] ESLint 208 warnings → 0 | Prettier 6 文件 → 全部格式化

## 2026-06-15：重构洞察执行记录（第 10 次 / Phase 65）

### 执行的 6 项任务

| # | 文件 | 变更 | 行数变化 |
|---|------|------|----------|
| 1 | `cmScrollLeftSync.ts` | 拆为 `cmScrollSync.ts` + `cmHorizontalScroll.ts` + `cmLintHighlights.ts` | 653→3 文件（~580 行合计） |
| 2 | `FoldTooltipOverlay.tsx` | 提取 `useFoldTooltipState.ts` + `useFoldTooltipPosition.ts`，主组件精简 | 666→34 行 + 2 hook 文件 |
| 3 | `GitHubTreeEntry.tsx` | 拆为 `GitHubEntryMenus.tsx` + `GitHubEntrySubEntries.tsx` | 970→478 行 (−53%) |
| 4 | `GitHubPanel.tsx` | 拆为 `GitHubCIOverview.tsx` + `GitHubCILogs.tsx` + `GitHubCISettings.tsx` + `GitHubCITree.tsx` | 996→73 行 (−93%) |
| 5 | `fileTree.tsx` | `trunkHeightMap` O(n²) → O(n) 栈式单次遍历 | 无行数变化 |
| 6 | CSS 变量 + 硬编码样式 | 3 变量→1 变量，2 处内联样式→CSS class，TitleBar 2 次 store 调用→1 次 | 14 文件更新 |

### 经验教训

#### 1. 超大组件安全拆分的模式

**问题**：4 个 600-1000 行的巨型文件需要安全拆分，手动逐行分析费时且易出错。

**方案**：使用 Subagent 模式——每个拆分任务派发独立子代理，各代理专注分析单个文件的责任边界并提出拆分方案。

**教训**：超大组件拆分的通用模式是"三明治提取"：责任识别 → 纯函数/数据（菜单构建、子条目渲染）→ 主文件保留编排逻辑。4 个拆分任务均遵循此模式，ESLint/tsc 零错误通过。

#### 2. Bridge 桥接层拆分需谨慎

`GitHubPanel.tsx` 的拆分中，子视图组件（`GitHubCITree.tsx`、`GitHubCIOverview.tsx`）直接使用 `useAppStore` 而非 prop drilling。这是有意的选择——子视图本身就是 Store 的消费者，prop drilling 反而引入不必要的中间层。但做 Domain 拆分时，如果未来子视图需要复用，应提取其需要的 selector 到独立文件。

#### 3. O(n²) → O(n) 的栈式算法

`trunkHeightMap` 原来使用嵌套循环（对每个目录向前扫描统计后代），在大文件树（10000+ 节点）下退化为 O(n²)。

**替换方案**：维护深度栈 `{ path, depth, count }`，单次遍历 flatNodes：
- 遇到小于等于栈顶深度的节点 → 栈顶弹出（目录闭合），记录高度
- 目录推入栈，文件累加到栈顶计数
- 遍历完成后弹出栈中剩余条目

**注意点**：这种栈式算法需要正确处理 flatNodes 的排序前提（BFS 遍历、depth 递增）。如果 flatNodes 排序方式改变，算法需要同步调整。

#### 4. CSS 变量命名的收敛原则

原来的 3 个 CSS 变量（`--adl-filetree-hover-offset`、`--adl-tree-row-offset`、`--adl-outline-row-offset`）在 `TreeNodeRow.tsx` 中被赋予相同的计算值（`Math.max(4, rowOffset)`），但在 3 个不同的 CSS 文件中被分别引用。

**原则**：如果多个 CSS 变量在运行时总是取相同值，就应该合并。合并后不仅减少变量计算开销，还消除了"修改一个忘记改另一个"的风险。

#### 5. 硬编码内联样式的消除

`TerminalTabBar.tsx` 和 `BrowserTabBar.tsx` 中相同的 `fontSize: '13px'` 和 `padding: '2px 6px'` 内联样式直接硬编码，不受主题控制。

**消除方式**：删除内联 style 中的这两个属性，在 CSS 中定义 `.adl-tool-list__item-editable-input` 规则，使用 `var(--font-size-sm, 13px)` 和 `var(--space-0-5, 2px) var(--space-1-5, 6px)`。

**注意**：移除非行为影响的样式属性不会改变功能；但如果某个内联属性是唯一控制该元素视觉的规则，删除后需确保 CSS 规则覆盖。

#### 6. Store 订阅合并

`TitleBar.tsx` 中有两次独立的 `useAppStore(useShallow(...))` 调用，导致组件创建了两次 Store 订阅。虽然没有明显的性能影响（React 内部 dedup），但代码风格不一致且容易忘记同步。

**改进**：合并为单次 `useShallow` 调用，同时订阅所有 13 个字段。

## 2026-06-16：第 67 轮重构洞察总结——右侧面板导航按钮统一

**轮次**：第六十七轮；**主题**：右侧面板导航按钮统一 + Bug 修复

### 问题背景

1. **左侧边栏折叠后内容区域不扩展**：在"变更、浏览器"功能面板下，点击"切换左侧边栏"按钮后，左侧边栏收起但内容显示区域未向左扩展
2. **审计/模型/设置/通信面板缺少导航按钮**：这些功能面板没有"右侧面板-切换左侧边栏"按钮
3. **浏览器搜索栏英文翻译不准确**：英文语言下"收藏、历史、全部"三个按钮名称过长且相互重叠

技术债务：右侧面板各功能模块导航按钮实现不一致；i18n key 命名混乱（`panelToggleLeft`/`panelToggleRight`/`panelNavigatorToggle`）；通信面板按钮状态与 GitHubPanel 不同步。

### 解决方案

#### CSS min-width 修复

**根因**：`leftbar.css` 中 `.adl-leftbar--collapsed .adl-leftbar__content` 未覆盖 `min-width: var(--leftbar-width)`（180px），CSS Grid 尊重内容 min-width 导致列未真正归零。

**修复**：在折叠状态样式中添加 `min-width: 0 !important` 强制覆盖。

#### 导航按钮统一

- 新增 i18n key `panelNavigatorToggle`（中文："右侧面板-切换左侧边栏"，英文："Toggle side panel"）
- 在审计/模型/设置/通信面板的 ToolSwitcher 工具栏中添加按钮
- 使用 `useAppStore` + `useShallow` 订阅 `leftCollapsed` 和 `toggleLeft`

#### 通信面板特殊处理

**根因**：CommunicationPanel 使用 `toggleNavigator('communicate')`（更新 `navigatorCollapsedByTool.communicate`），但 GitHubPanel 读取的是 `communicateNavigatorCollapsed`（来自 `communicateSlice`）——两个状态字段不同步。

**修复**：改用 `communicateNavigatorCollapsed` + `toggleCommunicateNavigator`，与 GitHubPanel 共享同一状态；按钮与平台子标签排在同一行，使用 `adl-communicate__header` 容器。

#### 浏览器搜索栏 i18n 修正

| 键 | 原英文 | 修改后 | 中文对照 |
|----|--------|--------|---------|
| `browserSearchBookmarks` | "Search saved tabs" | "Bookmarks" | 收藏 |
| `browserSearchHistory` | "Search history tabs" | "History" | 历史 |
| `browserSearchAll` | "Search all" | "All" | 全部 |

### 经验教训

1. **CSS Grid min-width 陷阱**：CSS Grid 列宽设置为 `0` 时，如果内容元素有 `min-width`，Grid 会尊重内容的 min-width，导致列宽无法真正归零。解决方案：折叠状态样式使用 `min-width: 0 !important`。适用于所有使用 CSS Grid 实现可折叠侧边栏的场景
2. **状态同步一致性**：多个组件读取同一状态但使用不同状态字段会导致状态不同步。解决方案：统一使用单一状态源（`communicateNavigatorCollapsed`），避免在不同切片中定义语义相同的字段。检查清单：多个组件是否读取同一状态？状态字段是否来自同一切片？状态更新函数是否一致？
3. **i18n 翻译简洁性**：UI 按钮文本应简洁，避免过长导致布局问题
4. **导航按钮命名规范**：TitleBar 按钮 `panelToggleLeft`/`panelToggleRight`（切换主左侧边栏）；右侧面板按钮 `panelNavigatorToggle`（切换右侧面板内导航栏）。防止混淆两个不同层级的导航切换功能

### 代码质量指标

| 指标 | 结果 |
|------|------|
| 文件数 | 10 |
| 新增代码行 | ~150 |
| 删除代码行 | ~50 |
| i18n key 新增 | 1 |
| Bug 修复 | 3 |

### 测试验证

功能测试（侧边栏折叠扩展、导航按钮显示/功能、搜索栏英文翻译）、兼容性测试（Tauri/浏览器模式、中英文切换）、自动化测试（tsc/ESLint/单元测试）均通过。

### 后续优化建议

1. 导航按钮组件化：提取为独立组件 `NavigatorToggleButton`
2. 状态管理优化：考虑将 `navigatorCollapsedByTool` 统一为单一状态字段
3. i18n 长度检查：添加自动检测过长翻译文本的工具
4. CSS Grid 折叠动画：研究最佳实践提升用户体验

## 2026-07-01：refactoring-insight 全流程执行

### 背景

通过 `refactoring-insight` 技能系统性执行重构洞察工作流：6 阶段、18 任务，使用子代理驱动开发（Subagent-Driven Development, SDD）模式在隔离 git worktree 中完成，最终 fast-forward 合并到 main。

### 工作流架构

```
refactoring-insight 技能（6 阶段）
├── Phase 0：worktree 隔离（.worktrees/refactor-insight-main, 分支 refactor-insight-2026-07-01）
├── Phase 1：宏观审查
├── Phase 2：并行扫描代理（4 维度：前端 TS/React、Rust、CSS、跨领域）
├── Phase 3：洞察报告生成 + 行数验证
├── Phase 4：实施计划生成（18 任务）
├── Phase 5：SDD 执行（每任务一个新子代理 + 任务审查）
└── Phase 6：最终验证 + 分支收尾
```

### 关键经验

#### 1. SDD 模式的优势

- **隔离上下文**：每任务一个新子代理，避免上下文污染
- **进度记录**：`.superpowers/sdd/progress.md` 记录所有任务状态，支持会话压缩后恢复
- **任务审查**：每任务后 dispatch reviewer 子代理验证 spec 合规 + 代码质量

#### 2. 行数验证的重要性

并行扫描代理报告的行数不准确（BrowserPanel.tsx 报告 841 行，实际 778 行）。**撰写报告前必须用 PowerShell `Measure-Object -Line` 直接验证所有文件大小**。这影响优先级判定：BrowserPanel.tsx (778 行) 实际低于 800 行阈值，从 🔴 高优先级变更为 🟡 中优先级。

#### 3. 子代理偏差的处理

子代理可能因实际情况与计划描述不符而偏差。处理原则：**目标导向**（偏差不阻塞，只要达成核心目标）、**记录透明**（在 progress.md 记录所有偏差和原因）、**审查宽容**（reviewer 接受合理偏差，但要求记录）。

本次偏差案例：Task 11 token 函数实际内联（改提取 `collectDescendantFolderIds` + `collectAffectedWorkspaceIds` 到 helpers）；Task 12 文件无 Crud/Reorder 操作（按实际语义拆分）；Task 14 clippy 移除 `mut`；Task 16 消除 clone 级联调整函数签名；Task 17 复用现有 i18n 键。

#### 4. leaf module 模式打破循环依赖

`browserFoldersSlice` ↔ `browserBookmarkSlice` 之间存在常量/类型循环导入。解决方案：创建 `browserSliceShared.ts` 作为 leaf module，承载跨切片共享的类型和常量。所有切片导入 shared，shared 不导入任何切片。

#### 5. Windows worktree 清理的特殊处理

Windows 长路径（>260 字符）导致 `git worktree remove --force` 失败。解决方案：使用 robocopy 镜像空目录到目标（绕过长路径限制），再 `Remove-Item`。

#### 6. 已知预存问题不应阻塞验收

- `frontend/src/shared/ipc-types.generated.ts:2` 的 TS2307（`serde_json/JsonValue`）是预存环境问题，子代理创建 gitignored shim（`crates/kernel/bindings/serde_json/JsonValue.d.ts`），视为环境设置步骤，不作为代码变更提交
- 6202 个 ESLint CRLF 警告（`prettier/prettier Delete ␍`）是仓库级治理问题（`core.autocrlf=true` + 无 `.gitattributes`），需要用户决策是否批量规范化

### 待后续治理项

1. `useBrowserFolderCrud.ts` (460 行)：本次拆分后仍是新的拆分候选
2. `GitHubLogViewer.tsx` (313 行)：未达 <250 目标，JSX (~158 行) 必须保持 byte-identical
3. QuickActions 丢失 "Ctrl+N" 提示：可在 i18n 键值中补充 `(Ctrl+N)` 后缀
4. CRLF 警告 6202 个：需添加 `.gitattributes` + 批量规范化，是仓库级治理决策

### SDD 工作流关键文件

- 进度记录：`.superpowers/sdd/progress.md`（任务状态、偏差、提交哈希）
- 任务简报：`.superpowers/sdd/task-N-brief.md`（子代理需求）
- 任务报告：`.superpowers/sdd/task-N-report.md`（子代理结果）
- 洞察报告：`docs/refactoring-insight/report/daily-insights/2026-07/refactor-insight-2026-07-01.md`
- 实施计划：`docs/plans/refactoring/2026-07/2026-07-01-refactor-plan.md`
