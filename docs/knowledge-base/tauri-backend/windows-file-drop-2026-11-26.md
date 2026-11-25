# Windows 文件拖放失效与 event ACL（2026-11-26）

> 现象：自定义背景弹窗的虚线区域收不到从资源管理器拖入的图片/视频，光标无反馈；控制台出现
> `Command plugin:event|listen not allowed by ACL`。修复后拖放可用（路径直达 Rust 导入）。

## 根因链（逐层排除）

1. **前端没有 HTML5 兜底**：上传区没有 `onDragOver/onDrop`，浏览器模式直接无效。
2. **JS 事件监听被 ACL 拒绝**：`tauri://drag-drop` 由 `@tauri-apps/api/window` 的
   `onDragDropEvent` 经 `plugin:event|listen` 订阅；capability 未显式包含 `core:event:default`
   时被拒，覆盖层一个事件都收不到。
3. **wry 的拖放回调未触发**：即使补上 ACL，桌面日志里也没有任何 `[ADL-DROP]` 行；
   `with_drag_drop_handler` 在该环境（WebView2 + 本仓 patch 的 runtime）没有回调，
   因此 `RunEvent::WindowEvent::DragDrop` 也不会出现。
4. **`WM_DROPFILES` 也被吞**：`DragAcceptFiles` + `SetWindowSubclass` 安装成功
   （`subclassed=true`），但拖入后没有 `WM_DROPFILES` —— WebView2 先处理了落点。

## 最终方案

- `capabilities/default.json` 显式列出 `core:event:default`（`core:default` 已包含它；显式声明便于排查 `plugin:event|listen` 的 ACL 报错）。
- **Rust 侧自建 OLE drop target**：`drop_target.rs` 在独立 STA 线程里
  `CoInitializeEx(COINIT_APARTMENTTHREADED)`，枚举主窗口所有子 HWND（WebView2 的子窗口在导航后
  才稳定出现，重试 20 × 500ms），对每个窗口 `RevokeDragDrop` + `RegisterDragDrop(自己的 IDropTarget)`，
  然后跑 `GetMessageW` 消息泵接收 OLE 回调。收到 Enter/Drop 时写入
  `file_drop` 待消费队列并广播 `adl:file-drop`。
- **前端消费**：全局 `useDragDropWorkspace` 订阅 `adl:file-drop` 并路由（覆盖层优先，未消费才打开工作区）；
  背景弹窗另以 300ms 轮询 `browser_take_pending_drop` 兜底（队列 3s 过期，打开弹窗先排空历史落点），
  事件与轮询重复投递用「路径 + 1.5s」去重。
- **系统对话框只选路径**（`browser_pick_background_file` 返回 `Option<String>`），复制放到
  `browser_import_background_file`，避免对话框打开期间显示「正在读取」。

## 验证

- 桌面日志：`[ADL-DROP] ole drop targets registered count=N`、拖入后
  `[ADL-DROP] drop (ole target)`。
- 用户实测：拖图片/视频到虚线区出现预览；应用后 asset 协议加载正常。
- 回归：`fileDropRouter` 单测（优先级/注销/回落）与 `file_drop` 队列单测。

## 备注

- `IDropTarget` 的 `#[implement]` 需要与 `windows` crate 同一 `windows-core` 版本；本仓显式
  依赖 `windows-core = "0.61"` 以避免与 tao 的旧版并存导致 trait 不匹配。
- OLE target 持有 `AppHandle`，消息泵线程与进程同寿；不要在热路径反复注册。
- asset 协议 scope 只放行 `$APPDATA/adl-backgrounds/**`，CSP img/media 仅加
  `asset: http://asset.localhost`。
