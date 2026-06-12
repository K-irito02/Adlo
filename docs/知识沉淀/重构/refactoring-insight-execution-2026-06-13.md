# 2026-06-13 重构洞察第8次全量执行经验

## 来源
文档：[refactor-insight-2026-06-13.md](../../重构洞察/refactor-insight-2026-06-13.md)

## 本轮回合概览
| 轮次 | 范围 | 任务数 |
|------|------|--------|
| 第六十一轮 | CSS 变量主题化、shared.ts 拆分、Hook 提取、切片拆分、骨架抽象、CSS 拆分、Rust 测试 | 8 项 |

## 经验教训

### 1. CSS 变量定义位置决定主题能力
**问题**：`files-panel.css` 中定义了 35 处 `--adl-file-badge-ink` 变量，但定义在组件级 CSS 文件中，导致暗色主题无法自动切换。

**原则**：主题相关的 CSS 自定义属性（如颜色变量）必须定义在 `themes.css` 的主题块（`[data-theme='light']` / `[data-theme='dark']`）中，而非组件 CSS 文件。组件 CSS 仅通过 `var()` 引用。

### 2. 模块拆分时 barrel 策略选择
**场景**：将 433 行的 `shared.ts` 拆分为 `storageHelpers.ts`（localStorage）和 `cacheHelpers.ts`（缓存/序列）。

**经验**：当源文件有 30+ 个消费方时，保留原文件作为 barrel（`export * from './newFile1'; export * from './newFile2'`）是最安全的策略。零 import 路径变更即可完成拆分。测试文件中直接读取源文件内容的（如 `loadingPerformance.test.ts`）需要更新路径断言。

### 3. ChangesPanel Hook 提取的"拆散"模式
**场景**：840 行的 ChangesPanel.tsx 拆分为 237 行组件 + 775 行 Hook。

**经验**：当大型面板组件只有一个消费方（自身 JSX）时，"拆散"模式（将原大组件内的所有 useEffect/useState/useCallback/useRef 全部提取到一个 hook）是最优解。提取后需要：
- 更新所有引用该源文件的测试（`changesEditorOptions.test.ts`、`outlinePanelWiring.test.ts`）
- 检查有无直接断言源文件内容字符串的测试

### 4. 树节点组件的 Slot 骨架模式
**场景**：BrowserTreeEntry（552 行）和 GitHubTreeEntry（991 行）共享 60% 的渲染结构。

**经验**：使用 slots 模式的骨架组件 `MultiTreeEntryShell.tsx`（接受 `actionButtonsSlot`、`entryMenuSlot`、`children`、`extraContent`）是最安全的抽象方式：
- 纯 slots 模式（无侵入性 props）确保 React.memo 仍然有效
- 两个 Entry 组件的独特逻辑（CI 配置、Pin/Unpin、菜单项构建）完全保留，Shell 仅提供 HTML 骨架
- Portal 渲染和 CSS 类名保持不变

### 5. CSS 文件拆分的"保留原件"安全策略
**场景**：将 1153 行的 `browser-panel.css` 拆分为 3 个文件。

**经验**：从不立即删除源文件——保留未修改的 `browser-panel.css` 作为安全网。只需在 `@import` 链中将原单行导入替换为三行新导入。样式验证通过后可以在后续轮次中删除源文件。

### 6. Rust 测试的 Windows 平台兼容性
**场景**：为 `emit_model_stream_events` 添加单元测试。

**经验**：Tauri 在 Windows 测试线程中无法创建事件循环（`tao` 限制），因此真实 AppHandle 调用测试必须用 `#[cfg(not(windows))]` 隔离。核心算法逻辑（分块、seq 计算）测试与平台无关，应优先编写可通过纯逻辑验证的测试。

### 7. 逆向膨胀监控
**场景**：browserpanel.tsx 在 Hook 提取阶段从 729 行增长到 948 行（+30%）。

**教训**：当模块级辅助函数（模块顶层非组件内联函数）超过 3 个时，必须立即提取到独立文件，否则会导致组件文件在重构过程中大幅膨胀。在本次执行中提取了 `browserPanelHelpers.ts`，行数从 948 降至 877 行。这个发现已被加入项目规则，在执行大重构前应优先扫描模块级辅助函数。

## 对应检查清单项

- [x] CSS 主题色变量不在 themes.css 中 → 迁移并补充暗色变体
- [x] 大型单文件 > 300 行 → 评估拆分（ChangesPanel 840→237 行）
- [x] 大型 Store 切片 > 500 行 → 按领域拆分（githubSlice 729→CiConfig+CiStatus）
- [x] 树节点组件模式重复率 > 50% → 提取共享骨架
- [x] 大型 CSS 文件 > 1000 行 → 按子区域拆分（browser-panel 1153→3 文件）
- [x] 核心 Rust 函数零测试覆盖 → 添加单元测试（agent_pipeline 13 测试）
- [x] 模块级辅助函数 > 3 个 → 提取独立文件