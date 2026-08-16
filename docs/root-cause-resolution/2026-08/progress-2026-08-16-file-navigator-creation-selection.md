# 进度 — 2026-08-16 文件导航器"新建/重命名"目标解析与选中态问题

## 问题来源
用户反馈应用"右侧面板-文件导航器"在"新建文件/新建文件夹/重命名"时目标目录与选中工作区不一致的问题，共分三批提出，本轮一并解决并归档。

## 事项清单

## [x] 事项 1：点击"新建文件/新建文件夹"按钮时选中目录被清除，创建回退到顶级工作区目录
- 状态：已完成（2026-08-16）
- 现象：点击工具栏"新建文件/新建文件夹"按钮后，先前选中的目录高亮消失，新建目标回退到工作区根目录。
- 根因：`MultiWorkspaceFileTree` 的全局 `document` `mousedown` 点击外部取消选中态监听器，只要点击目标不在 `.adl-multitree` 内就执行 `clearFileTreeClickedNode()`。工具栏新建按钮位于 `.adl-multitree` 容器之外，`mousedown` 先于 `click` 触发，把选中目录清掉了。
- 修复：
  1. `FileNavigatorToolbar.tsx` 给"新建文件/新建文件夹"按钮加 `adl-tool-navigator__create-action` 类
  2. `MultiWorkspaceFileTree.tsx` 点击外部监听器把该按钮类纳入"保留选中态"例外
- 验证：typecheck 通过；ESLint 0 错误

## [x] 事项 2：在"新建/重命名/删除"对话框中输入或点击按钮时选中态被清除，且按 `.adl-multitree` 容器判断"是否在树内"不合理
- 状态：已完成（2026-08-16）
- 现象：
  1. 在新建文件/文件夹、重命名对话框内输入名称或点击按钮时，选中目录被清除，创建目标又回退到根目录
  2. 点击 `.adl-multitree` 容器内的空白/无关区域时不会清除选中态（工作区折叠或文件很少时树内容未占满容器）
- 根因：对话框经 portal 渲染到 `document.body`，不在 `.adl-multitree` 内，被误判为"外部点击"而清除选中态；而 `.adl-multitree` 是整个滚动容器，把空白区域也当作"树内"，导致空白点击不取消选中。
- 修复（`MultiWorkspaceFileTree.tsx` 点击外部监听器改为"按真实交互元素判断"）：
  - 保留选中态：`.adl-prompt-modal`（新建/重命名对话框）、`.adl-confirm-overlay`（删除确认）、`.adl-tool-navigator__create-action`（新建按钮）、`.adl-filetree__row`（文件树节点行）、`.adl-multitree-entry__header`（工作区头部）
  - 其余区域（含容器内空白）一律清除选中态，与主流编辑器一致
- 验证：typecheck 通过；ESLint 0 错误

## [x] 事项 3：多工作区下新建目标作用到错误的"全局激活工作区"，而非用户正在操作的工作区
- 状态：已完成（2026-08-16）
- 现象：点击"B 顶级工作区目录"（高亮在 B）后，在"A 顶级工作区目录"中操作"新建文件/新建文件夹"，结果创建在 B 目录中，且会补全缺失路径。
- 根因：`useFileCreation.submitCreate` 的目标工作区 `targetWorkspaceId = activeWorkspaceId ?? recentWorkspaces[0]`，只取**全局激活工作区**（B），完全忽略了 `clickedNode.workspaceId`（用户正在操作的 A 工作区）。且展开路径链/展开态回调也硬编码 `activeWorkspaceId`。
- 修复（`useFileCreation.ts` + `FileNavigatorShell.tsx`）：
  1. 新增 `resolveTargetWorkspaceId()`：优先取"点击节点所属工作区"，其次取"最后点击的顶级目录"，再回退全局激活工作区，最后取第一个最近工作区
  2. `submitCreate` 计算并校验 `targetWorkspaceId` 后，创建与展开均使用该工作区
  3. 根目录选中判定收紧为 `clickedWorkspaceRoot === targetWorkspaceId && !clickedNode`
  4. `expandFileTreePathChain`/`setFileTreePathExpanded` 回调签名改为显式接收 `workspaceId`，Shell 直接透传 store action
- 补充修复（`editorSlice.ts`）：`setFileTreeClickedNode` 自动把 `fileNavigatorActiveWorkspaceId` 同步为该节点所属工作区，使顶部工作区高亮（左侧蓝条 + 蓝底）始终跟随用户实际正在点击的工作区。用户先点 B 顶级目录（高亮在 B）、随后回到 A 工作区里展开/点击节点时，高亮会随点击同步到 A，避免该工作区新建/重命名的目标被错误作用到 B。
- 验证：typecheck 通过；ESLint 0 错误；`useFileCreation` 9 测试全过（新增 1 条多工作区回归：高亮在 ws-2、操作 ws-1 节点时创建与展开均落在 ws-1）；`editorSlice.test.ts` 4 测试全过（含"点击节点同步高亮到该节点所属工作区"）

## [x] 事项 4：点击右键菜单"重命名/删除"时选中态被清除，看不清正在操作哪个节点
- 状态：已完成（2026-08-16）
- 现象：右键节点弹出上下文菜单，点击其中的"重命名/删除"菜单项时，节点高亮选中态被清除，用户看不清正在重命名/删除的是哪个节点。
- 根因：`MultiWorkspaceFileTree` 的全局 `document` `mousedown` 点击外部取消选中态监听器，只把对话框（`.adl-prompt-modal`/`.adl-confirm-overlay`）、新建按钮、文件树行、工作区头部视为"保留选中态"区域。而右键菜单经 portal 渲染到 `document.body`，根类名 `adl-sidebar-menu` 不在保留列表内，`mousedown` 先于 `click` 触发，把节点选中态（`fileTreeClickedNode`）清掉了，高亮随之消失。
- 修复（`MultiWorkspaceFileTree.tsx`）：把 `.adl-sidebar-menu` 纳入"保留选中态"例外列表，与既有的对话框/新建按钮一致。点击右键菜单项时保留节点选中态，重命名/删除对话框打开期间高亮持续可见。
- 验证：typecheck 通过；`editorSlice.test.ts` 4 条、`fileTree.test.tsx` 6 条全过

## [x] 事项 5：右键（未先左键）目标节点无视觉反馈，且"重命名/删除"对话框操作时高亮被清除
- 状态：已完成（2026-08-16）
- 现象：直接右键（未先左键点击）目录/文件时，无法从视觉上看出右击的是哪个节点；点击右键菜单中"重命名/删除"后高亮也随之消失，看不清正在操作的目标。
- 根因：右键节点时 `handleShowContextMenu` 虽设置了 `contextMenuTargetPath`（`is-context-menu-target` 临时高亮），但 `ContextMenu` 关闭时的 `onClose` **无条件**清空高亮并重置 persist 标志，导致"重命名/删除"（action 已设 `contextMenuPersistRef.current = true`）打开对话框后高亮也被立刻清除。
- 修复（`fileTree.tsx` `onClose`）：仅当 `contextMenuPersistRef.current === false`（未选择对话框类操作）时才清除高亮；选中"重命名/删除"时（persist=true）保留高亮，直到对话框关闭——对话框的确认/取消回调通过 `clearMenuHighlightRef.current?.()` 清除残留高亮。执行顺序安全：`ContextMenu` 中 `item.action?.()` 先于 `onClose()`，persist 标志在 onClose 时必可读到。
- 方案取舍：与 VS Code/资源管理器"右击后永久保持选中"不同，本方案按用户要求实现"临时高亮＋普通操作随菜单清除＋对话框操作保留"，更贴合用户预期。
- 验证：前端 typecheck 通过。

## 方案说明（对齐主流编辑器多根工作区交互）
- VS Code / JetBrains 多根工作区中，"新建文件/新建文件夹"作用在**当前选中的条目/节点所属的工作区**，而非某个被高亮抢占的全局工作区
- 本方案把"目标工作区"绑定到"用户正在操作的工作区"（点击的节点 / 点击的顶级目录），避免因点击其它顶级目录而把 A 工作区的创建作用到 B 工作区
- 同时让"顶部高亮"（选中工作区）永远与用户点击的节点/顶级目录保持一致：点击 A 工作区里的节点或 A 顶级目录后，高亮即回到 A，给用户明确的操作反馈

## 验证汇总
- 前端 typecheck：通过
- 前端 ESLint：0 错误（仅 1 条 pre-existing `useCallback` 依赖缺失 warning，与本次改动无关）
- 前端测试：`useFileCreation.test.tsx` 9 条全过；`editorSlice.test.ts` 4 条全过；`fileTree.test.tsx` 6 条全过
- 事项 5（右键高亮保留）：前端 typecheck 通过