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

---

## 子代理 A 审查报告（rev2）

**报告文件**: `.review-diffs/review-issue-1-rev2.md`

### 预存/遗留问题

| 优先级 | 问题 | 影响 | 工作量 |
|--------|------|------|--------|
| P0 | `create_folder` handler 未同步更新 — 请求体已含 `workspace_path`，但 handler 仍用 `current_workspace` | 非活跃工作区创建文件夹会创建到错误位置 | 小（Rust 端 1 行） |
| P1 | 右侧面板 `FileNavigator` 上下文菜单未适配多工作区 — `FileNavigatorShell` 未传入 `getWorkspacePath` | 右侧面板非活跃工作区文件的 rename/delete 操作可能作用到错误工作区 | 中 |
| P2 | `getAbsolutePath` 前端桥接未同步 — Rust 端已支持显式 `workspace_path`，但前端三桥接接口签名未更新 | 前端无法获取非活跃工作区文件的绝对路径 | 小 |
| P3 | `refreshOneWorkspaceTree` 找不到工作区时静默空转 — 应降级为 `refreshWorkspaceTree()` | 特定场景下文件树不刷新 | 小 |
| P4 | 视口边界逻辑重复 — `ContextMenu.tsx` 和 `WorkspaceFileTreeEntry.tsx` 重复相同视口计算代码 | 后续维护需同步两处 | 小 |
| P5 | `outline`/`search` handler 未使用 `workspace_root` | 非活跃工作区的符号大纲/搜索可能解析到错误根路径 | 小 |

## [x] 事项 5：循环代码审查 — 修复遗留问题
- 状态：已完成（2026-08-15）
- 备注：执行完整的 Phase 4 审查循环，修复 P0-P5 问题，执行子代理 B（死代码清理），循环直到无问题

### 修复内容

| 优先级 | 问题 | 修复 | 文件 |
|--------|------|------|------|
| P0 | `create_folder` handler 未同步 | `current_workspace` → `workspace_root(&state, input.workspace_path)` | `crates/server/src/handlers/workspace.rs` |
| P2 | `getAbsolutePath` 前端桥接未同步 | 三桥接增加 `workspacePath?: string` 参数，preview bridge 改用直接实现 | `shared/ipc/workspace.ts`, `httpBridge.ts`, `mock-workspace.ts`, `preview-workspace.ts` |
| P3 | `refreshOneWorkspaceTree` 静默空转 | 4 个 action 中找不到工作区时降级为 `refreshWorkspaceTree()` | `stores/actions/workspaceActions.ts` |
| P5 | `outline` handler 未同步 | `current_workspace` → `workspace_root(&state, input.workspace_path)` | `crates/server/src/handlers/workspace.rs` |

### 子代理审查报告

| 轮次 | 报告文件 | 结论 |
|------|----------|------|
| 子代理 B（死代码清理） | `.review-diffs/review-deadcode-rev1.md` | 8 个问题，均为低/中优先级，未阻塞 |
| 第三轮审查 | `.review-diffs/review-issue-1-rev3.md` | **通过** — 所有修复正确 |

### 测试结果

| 测试类型 | 结果 |
|----------|------|
| TypeScript 类型检查 | 通过 |
| 前端测试 | **221 文件 / 1750 测试 — 全部通过** |
| Rust cargo check | 编译通过 |
| Rust lib 测试 | **339 测试 — 全部通过** |