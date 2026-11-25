# R1 rev3 审查报告 — scope: drop-routing

## 范围

- `adlo/frontend/src/app/hooks/useDragDropWorkspace.ts`（删除 `onDragDropEvent` 附加通道、改注释）
- `adlo/frontend/src/app/hooks/fileDropRouter.ts`（头注释限定轮询兜底归属）
- `adlo/frontend/src/app/hooks/__tests__/useDragDropWorkspace.test.tsx`（记录并断言事件名）
- `adlo/frontend/src/app/hooks/__tests__/fileDropRouter.test.ts`（rev3 未改，复核仍有回归保护）
- `adlo/frontend/src/app/features/browser/BrowserIframeStack.tsx` + `BrowserIframeStack.test.tsx`（rev3 未改，复核 `active={isBrowserVisible}`）
- `adlo/frontend/src/app/features/center/CenterBrowserView.tsx` + `__tests__/CenterBrowserView.test.tsx`（rev3 未改，复核 `active={!centerObscured}`）

只读 rev3 快照 + 工作区源码；未跑测试/门禁（判断用删除性推演），未启动 dev server / 浏览器（无端口占用、无残留进程）。跨 scope 只读事实核对：`adlo/src-tauri/src/main.rs`、`drop_target.rs`、`file_drop.rs`、`tauri.conf.json`、`capabilities/default.json`、`tauri-bridge/tauri-shared.ts`、`useAppActions.ts`、`BackgroundSettingsDialog.tsx`。

## 上轮问题关闭情况（逐条：已关闭 / 未关闭 + 理由）

### F4（medium，双通道重复打开）— 已关闭

- `useDragDropWorkspace.ts:14-33` 只订阅 `adl:file-drop`；`:36-87` 的第二段 effect 只在非 Tauri（浏览器模式）挂 `document` 监听。rev2 的 `onDragDropEvent` 通道与对应 `@tauri-apps/api/window` mock 一并删除（rev3 快照中该 mock 已不存在，无遗留死 mock）。
- 全前端语义检索 `onDragDropEvent|tauri://drag-drop|drag-drop`：`frontend/src` 内仅剩注释里的解释性提及（`fileDropRouter.ts:5`、`useDragDropWorkspace.ts:16`），没有任何 `tauri://drag-drop` 订阅点，故同一落点无法再从第二条前端通道调用 `openWorkspace`。
- 单次投递内的重复也已排除：`forwardNativeFileDrop:42-53` 对一次 payload 最多调用一次 `openWorkspace`（覆盖层返回 true 时 0 次），hook 内无二次调用。
- Rust 侧两个发出方不会对同一落点各发一次 `adl:file-drop`：`drop_target.rs:19` 为 `#![cfg(target_os = "windows")]`，其它平台只走 `main.rs:258-296` 的 `RunEvent::WindowEvent::DragDrop` 桥接；Windows 上 `drop_target.rs:180-189` 先 `RevokeDragDrop` 再注册自有 target，一个 HWND 只能挂一个 `IDropTarget`，wry 的 target 被替换后不再产生 `DragDropEvent`，因此不会出现「OLE 目标 + 桥接」双重广播。
- 结论：当前代码路径下同一落点至多一次 `openWorkspace`。回归锁缺失见「记录不修」。

### F5（low，注释失实）— 已关闭

- `fileDropRouter.ts:7-8` 现为「弹窗内部另有 `browser_take_pending_drop` 轮询兜底，工作区打开路径只走事件通道」，不再暗示工作区回落有轮询。
- 事实核对：`browser_take_pending_drop` 在 `frontend/src` 只被 `BackgroundSettingsDialog.tsx:177`（打开时排空一次）与 `:336`（300ms 轮询）消费；`useDragDropWorkspace.ts` 全文无轮询、无 `invokeIpc`。注释与实现一致。
- 头注释其余部分同步准确：Windows 走自有 OLE `IDropTarget`（`drop_target.rs:19`），其它平台走 `main.rs` 桥接（无平台 cfg），两端都发 `{ type, paths }`。

### F6（low，测试未锁事件名）— 已关闭

- `useDragDropWorkspace.test.tsx:14-29` 的 mock 现在记录 `channel.name = name`；`:54` 断言 `expect(channel.name).toBe('adl:file-drop')`，describe 标题的「adl:file-drop 主通道」因此有了断言支撑。
- 删除性推演：把 `useDragDropWorkspace.ts:18` 的 `'adl:file-drop'` 改成任意其它字符串 → `:54` 变红（`:22-24` 记录的名字不符）。rev2 的「改任意字符串仍全绿」不再成立。

## 新增发现

无。额外核查项结论：

- **订阅泄漏**：`subscribeChannel`（`tauri-shared.ts:28-47`）同步返回注销函数，且处理了「`listen` 在卸载后才 resolve」的晚到 unlisten（`active` 标记 + 兜底 `unlisten()`），hook 在 `:31-33` 正确返回并调用；React StrictMode 的 mount→cleanup→mount 也只会保留一个活动监听。无泄漏。
- **依赖数组**：两段 effect 仍为 `[actions, actions.openWorkspace]`，`actions` 来自 `useAppActions()`（`useShallow`，元素是 store action 引用，身份稳定），不会因每次渲染重订阅；监听闭包取 `actions.openWorkspace`，随 deps 刷新，无 stale 闭包。
- **测试标题过度承诺**：rev3 改动到的 3 条 hook 用例标题均有至少一个可失败的断言（覆盖层消费 → `not.toHaveBeenCalled`；首条路径 → `toHaveBeenCalledWith('C:/folder')`；非 drop 类型 → 走 enter 分支后仍 `not.toHaveBeenCalled`）。唯一不敏感的半句见「记录不修」。
- **未改文件复核**：`BrowserIframeStack.tsx:69` 传 `active={isBrowserVisible}`（`BrowserPanelStateContext.ts:12` 为 `boolean`），`BrowserIframeStack.test.tsx:86-99` 在 `isBrowserVisible: false` 下断言探针为 `false`；`CenterBrowserView.tsx:588` 传 `active={!centerObscured}`，`CenterBrowserView.test.tsx:525-549` 覆盖 true→false。接线与 rev2 一致，无回归。

## 记录不修

- F4 的「删除」本身没有回归锁：若把 `onDragDropEvent` 附加通道重新接回，现有用例仍全绿（`@tauri-apps/api/window` mock 已随代码一起删除，jsdom 下动态 import 失败会被 hook 内 try/catch 吞掉）。可选加固：mock `@tauri-apps/api/window` 并断言 `onDragDropEvent` 未被调用。属可选优化，不改行为，留给主代理决定是否要求。
- `useDragDropWorkspace.test.tsx:71-80`「空路径」半句不敏感：删掉 hook 里 `paths.length === 0` 守卫后，`forwardNativeFileDrop` 内的 `if (first)` 仍拦住，断言不会变红（rev2 已记录，属冗余防御，非错误文案）。
- 面板侧 `active` 只断言 `false` 方向（`BrowserIframeStack.test.tsx:86-99`）：实现若硬编码 `active={false}` 不会被抓；rev2 已判定「省略 prop 才会导致默认 true 的真 bug，该用例足够」，保留现状。
- `subscribeChannel` 无 rejection 处理（`listen` 失败产生 unhandled rejection）：helper 预存行为，弹窗同样使用，本轮不扩大改动。
- 浏览器模式 `document` 级 `drop` 仍未检查 `event.defaultPrevented`：预存行为（rev1 已记录）。
- 跨 scope（background）：`BackgroundSettingsDialog.tsx:304-305` 注释仍写「覆盖层监听器在部分环境下收不到 `tauri://drag-drop`」，而实际已改为订阅 `adl:file-drop`；由 background scope 处理。
- 跨 scope（P5 文档）：ADR 0025 与 `docs/architecture/features/builtin-browser.md` 需按最终形态（`adl:file-drop` 单通道 + 弹窗轮询）同步，R1 不报。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）；本轮零问题（rev2 三条全部关闭，rev3 未引入订阅泄漏、依赖数组错误或测试标题过度承诺）

需修复项：0
