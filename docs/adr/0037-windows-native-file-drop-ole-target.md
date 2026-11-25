# 0037 Windows 原生文件拖入：自有 OLE IDropTarget 单通道

- Status: Accepted
- Date: 2026-11-26
- Domain: 浏览器与预览 / 桌面宿主

## Context

Windows 桌面需要支持把系统文件/文件夹拖进应用窗口（打开工作区、作为自定义背景素材）。实测在该 WebView2 + 本仓 patch 的 runtime 组合下：

- wry 的 `with_drag_drop_handler` 注册成功但回调从不触发（日志无 `[ADL-DROP]`），`RunEvent::WindowEvent::DragDrop` 因此也不出现；
- `tauri://drag-drop` 的 JS 订阅还会被 capability ACL 拒绝；
- `DragAcceptFiles` + `SetWindowSubclass` 安装成功，但 `WM_DROPFILES` 被 WebView2 先行吞掉。

即 Tauri/wry 提供的三条常见入口在该环境全部不可用。

## Decision

1. **自有 OLE target**：`drop_target.rs` 在独立 STA 线程上枚举主窗口及其子 HWND，`RevokeDragDrop` 后 `RegisterDragDrop` 自己的 `IDropTarget`，并运行消息泵接收回调。子窗口在导航后才稳定出现，因此最多重试 20 轮、每轮间隔 500ms。
2. **单事件通道**：落点写入短期队列（3s 过期）并广播 `adl:file-drop`；前端 `useDragDropWorkspace` 只订阅这一条，覆盖层（如自定义背景弹窗）先消费，未消费才「打开工作区」。弹窗内部另以 300ms 轮询 `browser_take_pending_drop` 兜底，事件/轮询重复投递用 1.5s 去重。
3. **兼容兜底**：`main.rs` 把 `RunEvent::WindowEvent::DragDrop` 桥接成同名 `adl:file-drop`，仅在非 Windows 平台或 OLE target 注册失败时生效；`tauri://drag-drop` 不再作为消费入口。

## Alternatives considered

- **继续依赖 wry 的拖放 handler**：代码量最小，但本环境回调不触发，功能实际不可用；也无法解释为何日志完全没有回调。
- **`WM_DROPFILES` + 窗口子类化**：安装成功但落点消息被 WebView2 吞掉，同样不可用。
- **HTML5 `drop`**：桌面模式下拿不到文件系统路径，无法打开工作区或复制背景素材。
- **修改 patched runtime / wry 让回调恢复**：需要动 vendored 运行时，影响面与维护成本更大，且仍需处理 WebView2 子窗口归属。
- **自有 OLE target（本决策）**：直接接管落点，路径完整、可同时服务工作区与覆盖层；代价是替换 wry target 后 `tauri://drag-drop` 在 Windows 上不再产生。

## Consequences

- Windows 上原生文件拖入的唯一来源是 `adl:file-drop`；新增消费方必须订阅该事件，不能依赖 `tauri://drag-drop`。
- `RevokeDragDrop` 会移除 wry 已注册的 target，这是有意为之，不是遗漏。
- `#[implement(IDropTarget)]` 的宏展开直接引用 `windows_core::`，因此 `src-tauri` 必须显式依赖同版本 `windows-core`（注释已写在 `Cargo.toml`）。
- 注册发生在主页首次加载完成、且只执行一次；WebView2 子窗口重建（如开发期 reload）后当前不会自动重注册，需要重启应用。若后续要消除该限制，应在页面加载事件上按 HWND 重新注册，而不是再引入第二条通道。
- 排障记录与逐层根因见 [windows-file-drop-2026-11-26.md](../knowledge-base/tauri-backend/windows-file-drop-2026-11-26.md)。
