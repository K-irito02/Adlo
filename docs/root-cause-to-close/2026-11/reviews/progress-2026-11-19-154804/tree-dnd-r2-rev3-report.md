# R2 rev3 定向复核报告 — 事项 2（文件导航树拖拽 / 跨工作区移动复制 / 自定义顺序 / 工作区排序 / 工作区菜单粘贴）

**需修复项：0**（本轮零问题）

- 轮次：R2 rev3（base `ab91161741fc569c03281c5c7e23456f57289682`，rev8 快照，66 文件）
- 只读审查：未修改源码/配置，未运行 `git`、未运行测试套件；**未启动任何 dev server / 浏览器 / headless Chrome，无端口占用、无后台进程**
- 覆盖方式：rev8 与 rev7 快照逐文件 SHA256 比对 —— 62 个同名快照中 **5 个变更**（3 个在本范围：`clipboardSlice.ts`、`workspaceClipboard.ts`、`clipboardSourceWorkspace.test.ts`；2 个不在本范围：`file-tree-browser.css`、进度文件），另有 **4 个首次进入快照**（三份 `codebase-map.md` 镜像 + `styles/regions/rightpanel/files-panel-list.css`）。合计 9 个文件，全部已核，无其它未审改动

## 范围

manifest-rev8 中事项 2 的全部文件，除 6 个吸顶文件（`MultiWorkspaceTreeShell.tsx`、`MultiWorkspaceFileTree.tsx`、`MultiWorkspaceChangesTree.tsx`、`file-tree-browser.css`、`stickyWorkspaceHeaders.test.tsx`、`sticky-workspace-headers.test.ts`）。

本轮重读：

- `.agents/rules/codebase-map.md`、`.opencode/rules/codebase-map.md`、`.trae/rules/codebase-map.md`
- `adlo/frontend/src/app/stores/slices/clipboardSlice.ts`
- `adlo/frontend/src/app/features/workspace-file-tree/workspaceClipboard.ts`
- `adlo/frontend/src/app/stores/slices/__tests__/clipboardSourceWorkspace.test.ts`
- `adlo/frontend/src/styles/regions/rightpanel/files-panel-list.css`（本轮新进入快照，读取全文 + 定位导入方）

只读交叉核对（不在范围或属 P5）：`file-tree-browser.css`、`docs/root-cause-to-close/2026-11/progress-2026-11-19-154804.md`、`preview-bridge/preview-workspace.ts`（验证注释里「回落到当前激活工作区」的机制是否成立）。

## 上轮（R2 rev2）问题关闭情况

| # | 结论 | 证据 |
| - | ---- | ---- |
| N1 low 三份 `codebase-map.md` 镜像仍列已删的 `useFileContextMenu` | **已关闭** | 三份镜像同一行（`:68`）均改为「…、`useNavigatorResize`、`usePatchReview`、`useTaskCenterPolling`、`useThemeSync` 等）」：`useFileContextMenu` 已移除，「11 个 hook」计数已去掉。三份文件 SHA256 完全一致（`5F51C5EB…`），镜像同步不被 `check-agent-dirs` 破坏；全仓 `useFileContextMenu` 只剩历史记录（两份进度文档 + 一份重构复盘摘要），无代码引用 |
| N2 low「旧调用点」措辞残留 + `workspacePath === undefined` 语义未入 JSDoc | **已关闭** | `clipboardSlice.ts:6-9` 注释改为「缺省为 `null` 时按当前激活工作区解析（非工作区树通用菜单的回落语义）」；`workspaceClipboard.ts:8-9` 新增「`workspacePath` 为 `undefined` 时走同工作区分支，由 store action 回落到当前激活工作区（非工作区树的通用右键菜单没有工作区上下文）」；`clipboardSourceWorkspace.test.ts:21` 用例名改为「未提供来源工作区时保持为空（回落当前激活工作区语义）」。三处均无「旧调用点」表述 |

机制核对：`undefined` → 激活工作区这一回落确实成立——桌面侧 `server/handlers/workspace.rs` 的 `workspace_root(state, None)` 取 `current_workspace`；浏览器侧 `preview-bridge/preview-workspace.ts:317-331`（`duplicateFile`）与 `:345-355`（`moveFile`）均为 `workspacePath ?? ctx.currentWorkspace?.rootPath`。注释描述的用户可见行为与两端实现一致。

## 新增发现

本轮无新增发现。逐项确认：

- **`files-panel-list.css`（本轮新进入快照）**：唯一变更是删除空规则 `.adl-multitree-entry { }`（`files-panel-list.css` 与 `file-tree-browser.css` 各删一处同名空块）。该文件由 `styles/regions/rightpanel/files-panel.css` 导入（非孤立文件），删除的是**零声明**规则，不改变任何计算样式与层叠；通读全文后未发现其它空规则或残留死选择器。属正当清理，不计数。
- **`clipboardSlice.ts` / `workspaceClipboard.ts` / 测试**：仅注释与标题变化，实现、签名（`setClipboard(op, path, sourceWorkspacePath?)`）与断言未变；`clipboardSourceKind` 仍为零残留。
- **三份镜像**：仅该行变化（`bf003b6f9` 同一 blob），其它行未动。

## 记录不修（不计数）

- `workspaceClipboard.ts:8-9` 写「由 **store action** 回落到当前激活工作区」——严格说 action 只透传 `undefined`，真正的回落发生在桥接层（Rust `workspace_root(None)` / preview `workspacePath ?? ctx.currentWorkspace?.rootPath`）。用户可见行为与注释一致，属可接受的概括；如需极精确可改为「由桥接层按当前激活工作区解析」。
- `clipboardSourceWorkspace.test.ts:21` 的标题括注「回落当前激活工作区语义」是说明性文案，断言只覆盖「字段保持为 `null`」；该回落路径在 Files 面板不可达（被 `bindWorkspaceClipboard` 覆盖），无需为此补断言。
- 本范围外：`file-tree-browser.css` 的吸顶块调整（删 `background-image: none` 等）与进度文件新增的 R2 rev2 处置段属吸顶子代理 / P5 范围，本报告不作判定。

## 结论

- **需修复项：0**（本轮零问题）
- R2 rev2 两条 low（N1 镜像失效引用、N2 措辞与 JSDoc 语义）**均已关闭**。
- 累计状态：R2 rev1 的 M1/M2/L1/L2/L3 与 rev2 的 N1/N2 全部关闭；本 scope 在 R2 阶段无未关闭的清理项。
- 本轮为纯注释/文档与一处空 CSS 规则删除，无行为、无测试断言、无层叠变化；rev7→rev8 的 9 个文件差异已全部核过，无夹带改动。
