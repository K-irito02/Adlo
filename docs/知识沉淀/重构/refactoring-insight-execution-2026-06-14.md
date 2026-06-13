# 2026-06-14 重构洞察执行经验

## 来源
文档：[refactor-insight-2026-06-14.md](../../重构洞察/refactor-insight-2026-06-14.md)

## 本轮回合概览
| 轮次 | 范围 | 任务数 |
|------|------|--------|
| 第六十二轮 | 路径别名、性能优化、组件提取、事件委托 | 7 项 |
| 第六十三轮 | ESLint/Prettier 门禁全量清零 | 208 warnings→0 |

## 经验教训

### 1. TypeScript 路径别名是深层导入的唯一解
**问题**：47+ 处文件使用 `../../../../shared/ipc` 等深层相对导入（最深 5 层），代码难以重构、难以阅读。

**实施过程**：
- 需要同时修改 `tsconfig.json`（TypeScript 编译时解析）和 `vite.config.ts`（Vite 运行时解析）
- 测试文件中的字符串断言（如 `changesEditorOptions.test.ts` 中 `expect(source).toContain("'../../../../...'")`）必须同步更新
- Vite `resolve.alias` 使用 `path.resolve(__dirname, ...)`，tsconfig `paths` 使用相对 `baseUrl` 的路径——两者路径基准不同
- `@app`（无 `/*`）和 `@app/*` 的区别：前者用于引用 exact 路径（如 `@app`），后者用于 `@app/xx/yy` 模式

**经验**：
1. 替换前先 grep 全仓库找出所有 `../../../../` 模式，统计范围和深度
2. 使用子 Agent 进行批量替换比手动逐文件修改更安全（统一映射规则、避免遗漏）
3. 替换后必须运行 `npx tsc --noEmit` 验证所有 import 正确解析
4. 测试文件的字符串断言极易遗漏——grep 旧相对路径的引用

### 2. NavigatorResizeHandle 提取揭示了"相同结构但不同数据"的 DRY 模式
**场景**：6 个文件中有几乎完全相同的 `<div>` 缩放手柄 JSX，仅 `aria-valuemax`（300 vs 420）和 `aria-label` 文本不同。

**经验**：当 3 个以上文件包含同一个 JSX 片段时，即使差异很小，提取共享组件也值得：
- 未来修改手柄样式只需改 1 处文件
- 消除 6 处重复的 JSX -> 约 30 行
- 共享组件的 `onPointerDown` prop 类型（`React.PointerEvent<HTMLDivElement>` vs `React.PointerEvent`）必须精确——泛型 `PointerEvent` 会导致类型不兼容错误

### 3. 右键菜单 Hook 提取后的"孤儿 import"陷阱
**场景**：将 `FileNavigatorShell.tsx` 和 `useChangesPanelState.tsx` 中的 `getContextMenuItems` 提取到 `useFileContextMenuItems.tsx` 后，两个源文件留下了大量已无需使用的 icon import 和类型导入。

**教训**：提取代码到 Hook 后，必须立即检查源文件的开头 import 块，删除不再使用的导入。AI 工具在提取代码时倾向于保留旧 import（因为不知道新的使用情况）。这些"孤儿 import"是后续 ESLint `no-unused-vars` 警告的来源。

**修复方法**：提取完成后立即运行 `npx eslint src/` 检查，或在提取后立即 grep 源文件中的每个旧导入变量确认是否仍被使用。

### 4. 事件委托修复 React.memo 的边界条件
**场景**：虚拟列表 `fileTree.tsx` 中，`onMouseEnter`/`onMouseLeave` 内联回调导致 `React.memo` 完全失效。

**关键设计决策**：
- 使用 `mouseover`/`mouseout`（冒泡事件）而非 `mouseenter`/`mouseleave`（非冒泡）——这是委托模式的基础
- 必须使用 `e.target.closest('[data-path]')` 防止子元素（图标、文字）事件冒泡导致 `setHoveredPath` 过度触发
- 需要处理 `relatedTarget` 来判断鼠标是否真正离开了当前节点（避免子元素间移动时的闪烁）

**验证方法**：文件树 hover 高亮行为不能有任何变化，必须 1:1 等同于旧的内联回调模式。

### 5. useRef 回调稳定化需要注意 useEffect 清理函数
**场景**：`InlineDiffViewer.tsx` 和 `SideBySideDiffViewer.tsx` 中用 `useRef` 存储 `onMount` 和 `onCollapsedUnchangedRangesChange`。

**关键规则**：
- `onMountRef.current = onMount` 必须在组件 render 阶段（非 effect 内）赋值，否则首次 mount 时 ref 值为旧值
- useEffect 依赖数组中移除了回调引用后，effect 内部应始终通过 `ref.current` 访问最新回调
- 如果 effect 有清理函数（返回 `unsubscribe` 等），清理函数不应依赖 ref 的当前值（可能已被下一次 effect 覆盖）

### 6. 四维门禁清零后防止再次退化
**问题**：208 个 ESLint warning 清零后，如何防止新增代码再次引入告警？

**建议**：
1. 在 CI/CD 中配置 `npx eslint src/ --max-warnings 0` 作为门禁
2. 每次重构提取代码后，自动运行 `npx eslint` 检查"孤儿 import"
3. Prettier 格式化应在 commit hook 或 IDE save action 中自动执行

## 对应检查清单项

- [x] 深层 `../../../../` 导入 → 路径别名 + 41 条替换
- [x] 大型组件 > 500 行 → NavigatorResizeHandle + useFileContextMenuItems 提取
- [x] 性能热点（DiffViewer 编辑器频繁重建） → useRef 稳定化回调
- [x] 性能热点（虚拟列表 memo 失效） → 事件委托
- [x] 性能热点（书签 O(n×m)） → Set 预构建
- [x] ESLint 208 warnings → 0 | Prettier 6 文件 → 全部格式化
