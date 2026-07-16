# 全量代码质量检测与修复

> 日期：2026-06-04 | 来源：全仓库代码质量检测与修复执行（Phase 1 检测 + Phase 2 修复）

## 背景

全仓库使用 ESLint v9 (React 19 hooks rules)、Prettier、cargo clippy、cargo fmt 进行四维代码质量检测。共扫描 340 前端文件 + 74 Rust 文件，检测基线为 128 ESLint errors + 311 warnings + 多个 clippy/fmt 违规。

## 关键经验

### React 19 react-hooks/refs：读取 ref.current 在渲染期被禁止

React 19 的 `react-hooks/refs` 规则在编译器层面禁止在渲染阶段读取或写入 `ref.current`。违反此规则的代码不会被 React 编译优化，可能导致运行时行为异常。

**修复策略**：将 `.current` 读写移至 useEffect 或事件处理函数中。对于必须读取 ref 的场景，保持 ref 对象引用不变，将实际读取推迟到 effect 生命周期。

### React 19 react-hooks/set-state-in-effect：同步 setState 触发级联渲染

该规则禁止在 useEffect 中同步调用 `setState`，因为这会导致级联重渲染并影响性能。

**错误修复（被回滚）**：用 `requestAnimationFrame(() => setState(...))` 包裹。这实际上更糟 — 每次状态更新增加 ~16ms 延迟，且级联多个 effect 时累积可达 50-100ms 卡顿。

**正确修复模式**：
- 派生状态使用 `useMemo` 或直接在渲染周期计算，完全消除 useEffect + setState
- 需要使用 `key` 属性让 React 在 prop 变化时卸载/重建组件，自然重置内部状态
- 需要同步外部 Store 时，使用 `useAppStore.getState()` 直接读取最新值（React 18+ 自动批量）
- 确实需要在 effect 中更新的状态，直接同步调用 setState（React 18+ 自动批量处理，实际不会触发额外渲染）

### React.memo 的引用稳定性关键

`React.memo` 的自定义比较器只能阻止**同一组件实例**的重新渲染。如果父组件无条件将回调/对象作为 prop 传递（无论值是否变化），`React.memo` 永远无法跳过更新。

**修复**：`DiffViewer` 使用 `areDiffViewerPropsEqual` 值比较，将 `onMount`/`onCollapsedUnchangedRangesChange` 等回调保持引用稳定（useCallback 空依赖或稳定闭包），确保 `React.memo` 真正生效。

### CodeMirror Merge View 的编辑器重建代价

CodeMirror 的 `@codemirror/merge` 扩展不支持在已创建的 `EditorView` 实例上动态交换文档。每次文件切换必须销毁旧的 `EditorView` 实例（调用 `.destroy()`）并创建全新的实例。

**代价**：创建实例需要初始化语法高亮、折叠线、gutter、merge decorations 等全部扩展，单次耗时 50-150ms。

**优化策略**：
1. `React.memo` 阻止无效的 props 变化触发重建（前提是 props 引用稳定）
2. 文件选择去抖防止快速切换导致多次重建
3. 从 store 直接读取最新值避免陈闭包重建

### requestAnimationFrame 作为"修复"的危害

`requestAnimationFrame(() => setState(...))` 是一个危险的反模式：
- 将同步状态更新推至下一帧，增加 ~16.67ms 延迟
- 多个 effect 级联使用时，每层都增加一帧延迟，累积可达 50-100ms+
- 用户感知为明显卡顿（从"瞬间"到"等了一会儿"）
- 对于需要同步状态的场景（如文件切换），破坏了 React 的微任务批量机制

**替代方案**：同步调用 setState。React 18+ 的自动批量（automatic batching）已经处理了同一次事件循环中的多个 setState 合并。

### 控制反转：从 Store 直接读取替代闭包捕获

对于需要频繁更新的状态（如 `activePatchSet`、`activePatchSets`），通过 `useCallback` 捕获会导致回调频繁重建，进而导致依赖此回调的子组件（如 `MemoizedFileTreeNode`）全部重渲染。

**修复**：从闭包中移除不稳定状态，改为在回调内部通过 `useAppStore.getState()` 直接读取最新值。这避免了回调重建，同时保证读取到最新状态。

### Rust Clippy 自动化修复的建议

`cargo clippy --fix` 可以自动修复大部分 lint 违规（如不必要的类型转换、冗余导入），但需要人工复核：
- `new_without_default` 自动添加的 `impl Default` 需确认不会破坏现有工厂函数语义
- `should_implement_trait`（如 `from_str` 方法名冲突）只能靠手动重命名而非自动修复
- `map_identity` 自动移除 `map_err(|e| e)` 后需确保 `?` 运算符的类型匹配

## CI 工具链

```bash
# Rust
cargo clippy --workspace --all-targets
cargo fmt --all -- --check

# TypeScript
npx tsc --noEmit

# Frontend
npx eslint .
npx prettier --check .
```
