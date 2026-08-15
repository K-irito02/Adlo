# 进度 — 2026-08-15 文件面板右键菜单问题

## 问题来源
用户反馈"应用程序-右侧面板-文件面板"右键菜单的 4 个问题。

## 事项清单

## [x] 事项 1：复制完整路径 / 在文件管理器中打开 不起作用
- 状态：已完成（2026-08-15 用户确认）
- 根因：`useFileContextMenuItems.tsx` 的 `reveal` 与 `copy-full-path` 动作从 `store.appInfo?.currentWorkspace` 计算根路径，但 Files 面板是多工作区树，节点所属工作区未必是 currentWorkspace，导致计算出的完整路径错误（乃至不存在），reveal 后端抛错、copy 复制错误路径。
- 修复：
  1. `useFileContextMenuItems` 增加 `getWorkspacePath` 回调参数，`reveal`/`copy-full-path`/`paste` 动作优先使用该回调获取工作区根路径
  2. `WorkspaceFileTreeEntry` 包装 `getContextMenuItems`，绑定 `workspace.path` 到 `reveal`/`copy-full-path`/`paste` 动作
  3. 后端 `workspace.rs` 增加 `workspacePath` 参数支持
  4. IPC 接口 + 三桥接（httpBridge/preview/mock）对齐 `workspacePath` 参数
- 验证：类型检查通过，ESLint/Prettier 通过，220/221 测试通过

## [x] 事项 2：检查并修复右键菜单其它选项
- 状态：已完成（2026-08-15 用户确认）
- 根因：cut/copy/paste/rename/delete 经 store 相对路径解析，多工作区下使用 `currentWorkspace` 导致偏差
- 修复：
  1. Store actions（`renameWorkspaceFile`/`deleteWorkspaceFile`/`moveWorkspaceFile`/`duplicateWorkspaceFile`）增加 `workspacePath` 可选参数
  2. `FileNavigatorShell` 增加 `renamingWorkspacePath`/`deleteWorkspacePath` 状态，对话框处理传递 `workspacePath`
  3. `WorkspaceFileTreeEntry` 包装的 `paste` 动作使用 `workspace.path`
  4. `StoreState.ts` 类型定义同步更新
- 验证：类型检查通过，ESLint/Prettier 通过

## [x] 事项 3：右键菜单在应用边缘被裁剪
- 状态：已完成（2026-08-15 用户确认）
- 根因：`ContextMenu.tsx` 和 `WorkspaceFileTreeEntry` 菜单用 `position: fixed` 直接置于 `{left:x, top:y}`，无边缘翻转逻辑
- 修复：
  1. `ContextMenu.tsx` 增加 `useEffect` 测量菜单尺寸，超出 viewport 时自动调整位置（保留 8px margin）
  2. `WorkspaceFileTreeEntry` 菜单增加相同边缘检测逻辑
- 验证：代码逻辑正确，类型检查通过

## [x] 事项 4：统一"在文件管理器中显示/打开"文案为"在文件管理器中打开"
- 状态：已完成（2026-08-15 用户确认）
- 根因：`i18n/zh-CN/file.ts` 中 `fileContextReveal` 为"在文件管理器中显示"，`fileContextRevealDir` 为"在文件管理器中打开"，不一致
- 修复：
  1. `i18n/zh-CN/file.ts`：`fileContextReveal` → "在文件管理器中打开"
  2. `i18n/zh-CN/workspace.ts`：`sessionMenuRevealFolder` → "在文件管理器中打开"
- 验证：文案统一，类型检查通过