# 进度 — 2026-08-16 文件树"编辑器当前打开文件"弱选中淡蓝效果缺失

## 现象
编辑器当前打开的文件，在 Files 与 Changes 面板中均未显示"被当前编辑器打开"的淡蓝色弱选中效果（此前 Files 面板存在该效果）。

## 根因
点击文件会使其成为编辑器打开文件，强选中（点击选中）与弱选中（编辑器当前打开）会同时落在同一节点上，此时 `activePath === extraSelectedPath`。两道关卡把弱选中屏蔽了：
1. **逻辑层** `fileTree.tsx`：`isWeakSelected = activePathIsWeak ? node.path === activePath && node.path !== extraSelectedPath : false` — 当 `activePath === extraSelectedPath` 时 `node.path !== extraSelectedPath` 为 `false`，弱选中被禁用。
2. **样式层** `tree-shared.css`：弱选中规则带 `:not(.is-selected)` 排除 + 强选中蓝底 `--bg-active !important`，即使两个类同时存在也覆盖淡蓝。

## 修复
1. `fileTree.tsx`：`isWeakSelected = activePathIsWeak ? node.path === activePath : false` — 编辑器打开文件始终显示弱选中，不因点击被屏蔽。
2. `tree-shared.css`：弱选中规则去除 `:not(.is-selected)` 并加 `!important`，让淡蓝弱选中样式优先于强选中蓝底，同时保留左侧强调色条。
3. `fileTree.test.tsx`：更新"点击的文件同时是编辑器文件"用例，改为强、弱选中并存。
4. 清理三处临时调试日志（`DEBUG-weaksel`）。

## 验证
- `fileTree.test.tsx` 6 用例通过
- 全量前端测试 228 文件 / 1807 用例通过
- ESLint、Prettier、TypeScript typecheck 通过
- Files 与 Changes 共用同一个 `FileTree` 组件，修复对两面板同时生效