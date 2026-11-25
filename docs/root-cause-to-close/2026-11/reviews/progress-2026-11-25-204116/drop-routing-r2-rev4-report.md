# R2 rev4 审查报告 — scope: drop-routing

## 范围

- `adlo/frontend/src/app/hooks/fileDropRouter.ts`（58 行，本 rev 唯一改动：头注释 `:6` + blob 哈希）
- `adlo/frontend/src/app/hooks/useDragDropWorkspace.ts`（88 行）
- `adlo/frontend/src/app/hooks/__tests__/fileDropRouter.test.ts`
- `adlo/frontend/src/app/hooks/__tests__/useDragDropWorkspace.test.tsx`
- `adlo/frontend/src/app/features/browser/BrowserIframeStack.tsx` + `BrowserIframeStack.test.tsx`
- `adlo/frontend/src/app/features/center/CenterBrowserView.tsx` + `__tests__/CenterBrowserView.test.tsx`

只读快照 + 工作区源码；未跑测试 / 门禁（判断用读代码推演），未启动 dev server / 浏览器（无端口占用、无残留进程）。跨 scope 只读事实核对：`BackgroundSettingsDialog.tsx`、`BrowserLandingPage.tsx`、`useDragDropWorkspace.ts`、`fileDropRouter.ts`。

**scope 内 delta 核验**（rev3 与 rev4 快照 base 同为 `be34f97`、commits 均为 0，逐文件 SHA-256 比对快照）：

| 文件 | rev3 → rev4 |
| --- | --- |
| `fileDropRouter.ts` | 唯一变更 |
| `useDragDropWorkspace.ts` | SAME |
| `fileDropRouter.test.ts` | SAME |
| `useDragDropWorkspace.test.tsx` | SAME |
| `BrowserIframeStack.tsx` | SAME |
| `BrowserIframeStack.test.tsx` | SAME |
| `CenterBrowserView.tsx` | SAME |
| `CenterBrowserView.test.tsx` | SAME |

`fileDropRouter.ts` 的 rev3/rev4 快照逐行对照：仅 `index` 行与注释第 12 行不同，其余 57 行字节相同；实现函数（`registerNativeFileDropHandler` / `routeNativeFileDrop` / `forwardNativeFileDrop` / 测试复位）零变更。

## 上轮问题关闭情况（逐条：已关闭 / 未关闭 + 理由）

### F1（low，注释失实：覆盖层「在挂载期注册」）— 已关闭

- 现状 `fileDropRouter.ts:6-7`：「覆盖层（如自定义背景弹窗）在**打开期**注册处理器、**关闭即注销**，由它决定是否消费」，与 `:28`「覆盖层在打开时注册」措辞统一。
- 与实现一致：
  - `BackgroundSettingsDialog.tsx:306-314`：注册在 `useEffect` 内，首个守卫 `if (!open || !isDesktopShell()) return;`，即仅在打开后注册；`:344-349` cleanup 执行 `unregister()`，关闭即注销。
  - `BrowserLandingPage.tsx:496-500` 无条件渲染该弹窗、`open={bgSettingsOpen}`，故「打开期」而非「挂载期」是准确说法。
  - 全仓库 `registerNativeFileDropHandler` 生产调用点只有 `BackgroundSettingsDialog.tsx:311` 一处（其余均在测试），「唯一实现」前提成立。
- 旧术语回扫：`挂载期` 在 `fileDropRouter.ts` 已无残留；全前端 `grep 挂载期|覆盖层|打开期` 未见第二处描述本路由「挂载期注册」的注释。
- 该注释为纯文档修正，无行为变化；无需新回归用例（F1 的证据是源码对照，不是测试断言）。

rev3 已关闭的 F4（双通道重复打开）/ F5（轮询消费点）/ F6（事件名字面量锁定）对应文件本轮字节未变，结论继承，未回退。

## 新增发现

无。本轮新增/改动的注释逐句可证：

- 「打开期注册、关闭即注销」→ 上节 `useEffect` 守卫与 cleanup。
- 「`browser_take_pending_drop` 轮询兜底」→ `BackgroundSettingsDialog.tsx:334-342` 仍以 300ms 间隔调用。
- 「工作区打开路径只走事件通道」→ `useDragDropWorkspace.ts:9-34` 桌面分支只订阅 `adl:file-drop`，无轮询、无第二条原生通道（`grep onDragDropEvent` 既有结论未变）；该句处在「桌面端外部文件由 Rust 侧接收」的段落语境中，浏览器模式的 DOM drop 分支（`:36-87`）不属于原生文件拖放，不构成反例。
- 「Windows 为自有 OLE `IDropTarget`，其它平台由 `RunEvent::WindowEvent::DragDrop` 桥接」为未改动行，属 rust-backend scope 既有结论。

## 记录不修

- **`由它决定是否消费` 为契约级表述**：当前唯一处理器无条件 `return true`（`BackgroundSettingsDialog.tsx:311-314`），但该函数签名与路由语义确由处理器返回值决定是否消费，属 API 契约描述而非对某次投递的事实断言；不改。
- **rev3 记录不修项继续有效**（对应文件字节未变）：`useDragDropWorkspace.ts` effect 依赖含冗余 `actions`、cleanup 包装可简化、`payload?.type` 纯防御、`mountHook` 未用 `view`、`landingProbe` 未在 `beforeEach` 复位。
- **跨 scope（background-dialog）**：`BackgroundSettingsDialog.tsx:304-305` 注释仍写「覆盖层监听器在部分环境下收不到 `tauri://drag-drop`」，而订阅已改为 `adl:file-drop`；rev1-rev3 已记录，归 background scope，R2 不重复计项。
- **跨 scope（P5 文档）**：ADR 0025、`docs/architecture/features/builtin-browser.md`、`docs/knowledge-base/tauri-backend/windows-file-drop-2026-11-26.md` 需按最终形态（`adl:file-drop` 单通道 + 仅弹窗轮询 + 打开期注册）同步，留给 P5。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）；本轮零问题，rev3 的 1 项 low 已关闭。

需修复项：0
