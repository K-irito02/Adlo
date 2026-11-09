# 浏览器书签导入：空子树不落位 + 目标范围判重 + 同名同父复用

**日期**：2026-11-10

## 背景

书签导入对话框「第 2 步·导入目标」整体重做（原目录结构 / 新建顶层目录 / 选择已有目录三种模式），导出对话框同步对齐。store 侧 `browserImportBookmarks` 在重复导入 / 新建空目录 / 子树复用等方面暴露出三类缺陷：

1. 重复导入同一文件时，嵌套子目录无论是否存在、子树是否全重复，都被无条件新建 → 留下空的同名目录。
2. 判重只在目标根（folder/self-root/workspace 分支各自局部 seed）而非目标树整体 → 嵌套子树内的重复不被跳过。
3. 子树没有书签时照样写回 store（新建空目录），与 UI 层「空目录不显示、不导入」的口径脱节。

## 变更内容

### 1. 判重范围 = 目标树整体

- `collectSubtreeKeys(allFolders, roots)`：沿 `byParent` Map 递归收集根目录及全部后代目录的 `(url,title)` 判重键。
- 应用：`folder` 目标 seed = 目标目录子树；`self-root` 逐根重新收集（含松散书签根「顶层书签」），避免同批次跨根漏判；`workspace` 目标 = ws 平铺书签 ∪ `parentType: 'workspace' && parentId === wsId` 一级目录的子树（递归）。`new-folder` / `child-folder` 目标保持空种子（新容器无既有子树可比对，与「新建目标=原样移植」一致）。
- 每个目录分支的 `childKeys = 上级 existingKeys ∪ 本目录条目` —— 子树判重在任意一层都能看到目标树-wide 的键。

### 2. 同名同父复用而非新建（`createChildFolder` 的 `created` 分流）

- 同名 + 同父 id + parentType（folder 放宽 `!f.parentType || === 'folder'`；workspace 严格 `'workspace'`）先查后建；复用时 `pushFolder: () => {}` no-op、不计入 `importedFolders`。
- 保证重复导入幂等：同一文件二次导入不产生空同名子目录、不累计目录数。

### 3. 空子树不落位、不写回、不计数

- `placeNodes` 走完后按 `(entries 有内容 || childStats.kept > 0)` 决定是否落位；`created && !hasContent` → 不推入 `nextFolders`、不计入 `importedFolders`。
- `self-root` 根级目录同一口径（全重复时连根也丢弃）；松散书签根同理。
- `importedFolders` 只统计「新建且保留」的目录。

### 4. 递归空目录剪枝（UI 层）

- 导入树 `pruneEmptyTransfer`：目录下没有任何书签（递归）整个子树不渲染；`.html` 解析结果消费、对话框两路入口（mount 草稿 / handleFile）统一剪枝。
- 导出树 `pruneEmptySelection`：空目录 / 空分类根不渲染；分类为空时整个分类行不显示；`roots/allLeafIds/allDirIds/buildExportNodes/resolvePicked` 全部基于剪枝后的树。

### 5. 证据与测试

- 新增 store 单测：复用不重复落位 / 空子树剪枝 / 嵌套跨目录判重 / 重复导入幂等 / workspace 子树判重 / 全重复空根丢弃。
- UI 层：无书签目录与空分类不显示 + 导入时不创建 + 导出书签/导入为空态「暂无内容」。

## 经验教训

1. **store 的空树规则必须与 UI 口径一致**：导入对话框剪掉空目录只是 UI 层的"不显示"，store 若照样落位，用户在书签面板里会看到自己看不到的空目录；UI 剪枝 + store 剪枝必须成对落地（本次由"空目录不导入"这条用户诉求驱动）。
2. **复用判重不能只在根级**：顶层合并只是第一步，嵌套子目录不复用，重复导入会层层膨胀空同名目录；"created:false → 不重复落位/不计数"是通用分流。
3. **判重口径要写进文案**：UI 硬编码 "重复项一律跳过"，于是 store 必须跨目录判重（target tree-wide），否则文案与行为对不上；当发现"兄弟子目录各自导入同一 URL 双份"这种偏差时，先看消费方文案再定口径。
4. **逐次重收集 seed**（self-root）：同一批导入文件跑多个根时，后一个根要看到前一个的产物，不能用导入前的快照，否则同一文件内跨顶层目录的重复漏判。
5. **"全重复 → 整条子树丢弃"级联**：父级保留的依据是 "entries>0 或子目录保留"，所以递归层层自然传递——每层只记本层直接计数，聚合就出来了；不要一次性在外层 post-order 剪枝，和 placeNodes 的增量写入都对齐不了。

## 相关文件

- `frontend/src/app/stores/slices/bookmarkTransferSlice.ts`（`collectSubtreeKeys` / `placeNodes` rework / `childStats.kept` 级联 / importRoot 收尾校验）
- `frontend/src/app/features/bookmarks/BookmarkTransferDialogs.tsx`（`pruneEmptyTransfer`、`resolveImportPicked` 分类根 fallback）
- `frontend/src/app/features/bookmarks/collectExportTree.ts`（`pruneEmptySelection`）
- `frontend/src/app/stores/slices/__tests__/bookmarkTransferSlice.test.ts`（6 例新增）
