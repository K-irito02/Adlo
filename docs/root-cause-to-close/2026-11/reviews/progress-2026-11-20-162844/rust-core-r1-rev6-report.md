# rust-core — R1 定向复核报告（rev6，仅两处修复点）

## 范围

- 工作树（仓库根）：`E:\AI-DIGITAL-LIFE\SourceWorkspace-worktrees\slot-2`
- 快照：`.review-diffs/{adlo_src-tauri_src_commands_media_session.rs,adlo_src-tauri_src_app_identity.rs}-rev6.diff`（只读 rev6）；**未**运行 `git diff/log/show`；**未**跑测试/服务；**未**改源码/配置，只写了本报告。
- 本轮只核两处（不重启其它范围）：
  1. `adlo/src-tauri/src/commands/media_session.rs` — 删手写 unsafe vtable，改用 `SystemMediaTransportControls::UpdateTimelineProperties` 的等价性与注释。
  2. `adlo/src-tauri/src/app_identity.rs` — store 获取前移后的 BSTR 清理完备性与注释。
- 外部事实核对（只读）：`adlo/Cargo.lock`（`windows 0.61.3`、`windows-core 0.61.2`，`tauri/tauri-runtime/tauri-runtime-wry/wry/tao/webview2-com` 均解析到 0.61.3）；cargo registry `windows-0.61.3/src/Windows/Media/mod.rs`、`windows-core-0.61.2/src/param.rs`、`windows-0.61.3/src/Windows/Win32/System/Com/StructuredStorage/mod.rs`。
- 未启动 dev server / 浏览器，未占用端口，无后台进程。

## 上轮问题关闭情况

### 1) rust-core rev5 F1 — 手写 unsafe vtable + 高承诺注释 — **已关闭**

- 位置（现状）：`adlo/src-tauri/src/commands/media_session.rs:260-283`（`update_timeline`）、`:94-104`（imports）、`:121-124`（`Session` 字段）、`:279`（新注释）。
- 已删除：`controls2: Option<ISystemMediaTransportControls2>` 字段、`update_timeline_properties()` 手写 vtable 调用、`windows::core::Interface` 导入与 `controls.cast::<ISystemMediaTransportControls2>()`；全 `adlo/**/*.rs` grep `controls2|update_timeline_properties|只能按 vtable` 无残留。
- **等价性（时间线属性）**：`start = TimeSpan{0}`、`end = to_time_span(duration_ms)`、`position = to_time_span(position_ms.min(duration_ms))`，并同样依次 `SetStartTime/SetMinSeekTime/SetEndTime/SetMaxSeekTime/SetPosition`；`duration_ms` 非有限或 `<= 0` 仍早退 `Ok(())`，`position` 仍钳到 `duration`，`to_time_span` 仍把负值钳 0（`:306-309` 与 `:322-328` 单测未变）。逐项与 rev5 实现相同。
- **等价性（调用目标）**：`windows-0.61.3/src/Windows/Media/mod.rs:2285-2291` 的 `impl SystemMediaTransportControls::UpdateTimelineProperties(&self, P0: Param<SystemMediaTransportControlsTimelineProperties>) -> Result<()>` 内部执行 `Interface::cast::<ISystemMediaTransportControls2>(self)?` 后调用同一 vtable 槽（`:1064` 字段名 `UpdateTimelineProperties`）并 `.ok()`；即与旧手写调用是同一接口、同一 HRESULT→`Result` 转换。`&props` 满足 `Param`（`windows-core-0.61.2/src/param.rs:39-48` `impl<T, U> Param<T, InterfaceType> for &U`）。
- **等价性（失败传播）**：`props` 各 setter 仍 `map_err(...)?`，末尾仍 `.map_err(|e| format!("UpdateTimelineProperties: {e}"))` → `update_timeline` Err → `apply` 记录 `warn`（`:150-157`）；`apply` 先写元数据再写时间线，故时间线失败不影响标题（与旧实现一致）。
- **注释准确**：`:279`「`windows` 0.61 在类上提供了安全方法（内部自动 cast 到 ISystemMediaTransportControls2）」经上述 crate 源码逐句成立；旧的「只能按 vtable 调用」断言已消失。
- 删除性推演：还原旧实现不会让任何用例变红（该差异是编译期 API 选择 + 注释事实，非运行时观测面），本次按结构/事实核对判定关闭。

### 2) rust-core rev5 F2 — 取 store 早退致 BSTR 泄漏 + 「无论成败」绝对断言 — **已关闭**

- 位置（现状）：`adlo/src-tauri/src/app_identity.rs:133-171`。
- **顺序**：`window.hwnd()`（`:133`）→ `SHGetPropertyStoreForWindow(hwnd)` 带 `?`（`:136-139`）→ 才构造 `VT_BSTR` 的 `PROPVARIANT`（`:141-154`）→ 闭包执行 `SetValue`/`Commit`（`:158-164`）→ 无条件 `PropVariantClear(&mut value)`（`:165`）→ `outcome?`（`:168`）。构造与清理之间没有任何 `?`/早退。
- **失败路径清理**：hwnd 失败、store 获取失败均在 BSTR 构造之前返回（无对象可泄漏）；`SetValue` 失败、`Commit` 失败、成功三条路径都先清 `PROPVARIANT` 再返回/继续，`SetValue` 为 const 引用入参不转移所有权，`PROPVARIANT_0_0_0.bstrVal` 是 `ManuallyDrop<BSTR>`（`windows-0.61.3/.../StructuredStorage/mod.rs:3006`），`PROPVARIANT` 无 `Drop`，故手动 `PropVariantClear` 既不漏也不双释放。
- **注释成立**：`:136`「先取 store（失败时还没构造 PROPVARIANT，不存在 BSTR 泄漏）」与代码一致；`:156` SAFETY 已从「无论成败」降级为「`value` 已构造，Set/Commit 失败也会先 PropVariantClear 再返回错误」，与 `:163-174` 逐句相符，无超出实现的绝对承诺。

## 新增发现

无。两处修复未引入新的注释漂移、错误传播缺口或资源所有权问题（定向范围内）。

## 记录不修

- 两处修复都无自动化回归面：删除性推演下还原任一处都不会让现有用例变红（F1 是编译期 API 选择 + 注释事实；F2 是 COM 失败分支上的 BSTR 所有权）。为 F2 造用例需注入 `SHGetPropertyStoreForWindow` 失败，属 OS/COM mock，代价高于收益；F1 由注释核对与 crate 源码固定。维持「无测试」记录。
- 微观行为差（非回归）：旧实现把 `ISystemMediaTransportControls2` cast 缓存在 `controls2`，cast 失败时 `update_timeline` 静默 `Ok(())`；新实现每次快照在 crate 内部 QI，失败会以 `warn` 记录（每快照一条）。`GetForWindow` 与 `ISystemMediaTransportControls2` 同为 Windows 10 14393 引入，实际不可达；即使发生，也仍先更新标题/播放状态，仅时间线缺失。记录不修。
- `app_identity.rs` 每启动覆盖 `HKCU\...\AppUserModelId\com.adlo.app` 的 `IconUri`、并行工作树共享同一 AUMID 的现象为 rev5 已记录预存项，本轮改动未触及，维持记录（P5/后续决定）。

## 结论

- 需修复项：0（本轮零问题）
