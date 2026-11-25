# R2 审查报告 — rust-backend（rev3）

## 范围

R2 只看清理类问题：死代码、冗余守卫、根因修后多余的防御/兼容、应删或降级的诊断日志；不重判正当错误处理、系统边界校验与生产 warn/error。

只审本 scope 的 rev3 diff（base `be34f973`，manifest `other` 组 11 个代码/配置文件）：

- `adlo/src-tauri/src/commands/background_asset.rs`（317 行）
- `adlo/src-tauri/src/commands/port_scan.rs`（`hidden_command` + 2 处调用点）
- `adlo/src-tauri/src/commands/mod.rs`（+`pub mod background_asset`）
- `adlo/src-tauri/src/drop_target.rs`（254 行）
- `adlo/src-tauri/src/file_drop.rs`（93 行）
- `adlo/src-tauri/src/main.rs`（`mod` 声明、`install` 调用、`RunEvent::WindowEvent::DragDrop` 分支、4 命令注册）
- `adlo/src-tauri/Cargo.toml` / `adlo/Cargo.lock`
- `adlo/src-tauri/tauri.conf.json` / `capabilities/default.json` / `permissions/digital-life.toml`

只读上下文：`adlo/frontend/src/app/features/browser/browser-landing/{backgroundAssets.ts,BackgroundSettingsDialog.tsx}`、`adlo/frontend/src/app/hooks/{fileDropRouter.ts,useDragDropWorkspace.ts}`（确认消费方）、`adlo/scripts/check-source-hygiene.mjs`（`[DBG-*]`/`[ADL-DEBUG]` 判定口径）、`adlo/src-tauri/gen/schemas/{desktop-schema.json,capabilities.json}`、`adlo/crates/tauri-runtime-wry-patched/src/lib.rs`（wry handler 唯一来源）。

未启动任何进程/dev server，未跑测试，未改源码。端口：无。

**本轮 delta 界定**：rev3 相对 rev2 只有 `drop_target.rs` 变化（R1 rev3 已用逐文件 SHA-256 比对确认，其余 10 个文件字节相同）；因此「本轮新增的清理问题」只能在 `drop_target.rs` 出现，其余文件按既有记录复核消费方是否仍存在。

## 上轮问题关闭情况

上一轮（`rust-backend-r1-rev3-report.md`）为 **0 finding**，无待关闭项。定向复核 R1 rev2 关闭的四项在 rev3 未回退，且作为 R2 的「真实消费方」前提逐条重核：

1. **`file_drop` TTL（rev2 F2 关闭）— 仍关闭且消费方存在**。`file_drop.rs:13,41-53` 的 `MAX_AGE = 3s` / `take_if_fresh` 被两处真实消费：`BackgroundSettingsDialog.tsx:334-342` 每 300ms 轮询 `browser_take_pending_drop`，`:177` 打开弹窗时先排空历史落点。TTL 是这条通道的语义组成，不是根因修完后的多余防御（10 倍余量对应一次轮询周期）。
2. **`assets_lock`（rev2 F5 关闭）— 仍关闭且串行场景可达**。`background_asset.rs:70-79` 的锁被 `import_background_file:91` 与 `prune_background_dir:122` 共同持有；前端 `cancelScheduledPrune`（`BackgroundSettingsDialog.tsx:135-156`）只能取消尚未触发的 4s 定时器，无法取消已经在途的 `pruneDesktopBackgrounds` IPC，故「in-flight prune 与重开后的 import 交错」仍需 Rust 侧串行。
3. **`BackgroundAsset` 只留 `path`/`file_name`（rev2 F6 部分关闭）— 仍关闭且两字段都被读**。`backgroundAssets.ts:198-202` 同时消费 `result.data.fileName` 与 `result.data.path`（`convertFileSrc` + `assetPath`），不存在未读 IPC 字段。
4. **`[ADL-DROP]` 诊断日志与 warn（rev2 F6 部分关闭）— 保留成立**。`drop_target.rs:224/237/252`、`file_drop.rs:26`、`background_asset.rs:147` 全部挂在失败分支（COM 初始化失败、注册全失败、线程创建失败、mutex poison、单文件删除失败），有真实触发条件，属生产 warn；`[ADL-DROP]` 前缀不被 `check-source-hygiene.mjs` 的 `[DBG-*]`/`[ADL-DEBUG]` 规则拦截，且量级是「每次拖放一次」而非热路径。

## 新增发现

本轮无新增需修复项。按 R2 四个重点逐项给出核查证据（结论直接写入，不构成 finding）：

### A. TTL / 串行锁 / 重试 / 警告日志的消费方

| 项 | 位置 | 消费方 / 触发条件 | 结论 |
| --- | --- | --- | --- |
| TTL 3s | `file_drop.rs:13,41-53` | 弹窗 300ms 轮询（`BackgroundSettingsDialog.tsx:334-342`）+ 打开时排空（`:177`） | 真实 |
| 串行锁 | `background_asset.rs:70-79,91,122` | 在途 prune × 重开后的 import（见上轮关闭情况 2） | 真实 |
| 注册重试 | `drop_target.rs:228-238` | 仅当首次枚举到 0 个「已有 wry target」的 HWND 时消费；正常路径首次即 `count > 0` 提前 break，`info` 一次 | 真实兜底，非死循环 |
| 注册失败 warn | `drop_target.rs:236-238` | 与 `break` 条件互斥：只有 20 次全 0 才触发 | 非重复守卫 |

`if paths.is_empty()`（`drop_target.rs:107-109`）也不能删：不拦时会对空拖入 emit `enter`，而 `BackgroundSettingsDialog.tsx:321-323` 用 `paths.some(...)` 把 `dragActive` 点亮成 `false` 之外的语义（空数组 → 不亮），删除只会多一次无意义 emission；保留。

### B. `main.rs` RunEvent 桥接与 OLE 通道是否重复或死分支

不是死分支，也不是双投：

- Windows 上 `register_on` 以「该 HWND 已有 target」为前置（`drop_target.rs:175-176`），即只替换 wry 注册过的 HWND；被替换后该 HWND 的 `DragDropEvent` 确实不再产生。
- 但注册可能整体失败（窗口枚举 20 次内没有任何 wry target，或 `RegisterDragDrop` 失败），此时 wry 通道仍在，`main.rs:258-296` 就是唯一通路；非 Windows 下 `drop_target` 是空模块（`#![cfg(target_os = "windows")]`），该分支同样是唯一原生通路——`port_scan.rs:165-214` 仍保留 macOS/Linux 实现，说明跨平台路径没被废弃。
- 双投不可能：同一个 HWND 上 OLE 只认一个 target，wry 被 `RevokeDragDrop` 后就不会再回调；即便两侧都被触发，前端 `useDragDropWorkspace.ts:16` 已有同落点 1.5s 去重。
- 两条通道共用 `file_drop::record_drop` 与同一 payload 形状，`Drop` 路径的语义一致（`main.rs:282` / `drop_target.rs:160`），没有「一边记一边不记」的契约分裂。

### C. `background_asset.rs` 返回值 / 字段的死代码

- `browser_import_background_file` → `BackgroundAsset`：两字段均被前端读取（见上轮关闭情况 3）。
- `browser_pick_background_file` → `Option<String>`：`backgroundAssets.ts:206-211` 消费（`null` 即用户取消）。
- `browser_take_pending_drop` → `Vec<String>`：两处轮询消费。
- `browser_prune_background_assets` → `u32`：**无前端读取方**，仅 `prune_keeps_only_listed_assets`（`:305-306`）断言；rev1/rev2 已按「记录不修」保留（见下）。

无新增未读字段；rev2 删掉的 `kind`/`size` 未复现。

### D. `drop_target.rs` 可删防御 / `Cargo.toml` 依赖消费

- `enter_is_valid`（`drop_target.rs:44,110,132,145`）保留：既执行「未经 Enter 不接 Drop」的 OLE 契约，又让 `DragLeave` 只在真正进入过时 emit，删掉会产生多余 leave 事件。
- `cursor_effect`（`:45,54,111,125`）是**冗余状态**：全仓只被赋值 `DROPEFFECT_COPY` 一次（`:111`），`DragOver` 的 `valid ? cursor_effect : NONE` 与 `valid ? COPY : NONE` 等价。行为等价、无缺陷，按「可选清理」记入记录不修。
- 依赖：`uuid` 有生产消费（`background_asset.rs:110` 落点名）；`windows-core` 由 `#[implement(IDropTarget)]` 展开消费（rev3 已复核）；`protocol-asset` 对应 `tauri.conf.json:35-38` 的 `assetProtocol`；新增 4 个 windows feature 全部有对应 import（`Foundation`/HWND、`Graphics_Gdi`/`ScreenToClient`、`System_Ole`/`CF_HDROP`+`RegisterDragDrop`+`ReleaseStgMedium`、`SystemServices`/`MODIFIERKEYS_FLAGS`）。`Cargo.lock` 只新增 `uuid`、`windows-core 0.61.2` 与 `protocol-asset` 的传递依赖 `http-range`，无孤立条目。

## 记录不修

1. `background_asset.rs:228-240` `browser_prune_background_assets` 的 `u32` 计数无前端读取方（`backgroundAssets.ts:217-222` 只判 `ok`），保留给单测断言与排障；rev1/rev2 已记录，low、不阻断。
2. `file_drop.rs:41-53` TTL 只在私有 helper `take_if_fresh` 上有用例，把 `take_pending_drop` 里的接线删掉时现有用例仍绿；3s 真实等待不适合单测，接受 helper 级覆盖（rev2 已记录）。
3. `background_asset.rs:70-79` 串行锁、`:144-152` 单文件失败继续、`drop_target.rs:228-238` 重试分支均无用例（需并发 / 文件占用 / 慢启动环境），删除性推演不会变红；rev2 已按测试成本接受。
4. `drop_target.rs:45,54,111,125` `cursor_effect` 恒为 `DROPEFFECT_COPY`，可删字段并把 `DragOver` 简化为 `valid ? COPY : NONE`（同时可去掉 `DROPEFFECT_NONE` 初始化依赖）。行为等价的纯清理，非本轮修复引入，记可选。
5. `drop_target.rs:151-159` `ScreenToClient` + x/y 只服务 `info` 日志（日志里没有 HWND 身份，坐标排障价值有限），`Win32_Graphics_Gdi` feature 仅为它启用。如要精简可降级 `debug!` 并去掉坐标；当前只在拖放动作时打一行，量级可接受，按可选记录。
6. `adl:file-drop` payload 构造重复 6 处（`drop_target.rs:112,133,161`、`main.rs:272-291`），可收敛为 `file_drop::emit(...)`；Fowler「Duplicated Code」风格项，规则未强制。
7. `background_asset.rs:28,51` 的 derive 有未读项：`BackgroundKind` 的 `PartialEq/Eq`、`BackgroundAsset` 的 `Clone/Deserialize` 在仓内无读取方（`Copy` 必需，不能删）。derive 无运行时成本，可选清理。
8. `capabilities/default.json:8` 新增的 `core:event:default` 与 `core:default` 重复（`gen/schemas/desktop-schema.json:396` 明列 `core:default` 包含 `core:event:default`）——纯冗余 grant，删除不改变行为；rev1/rev2 已记录，配合 P5 复核进度文件里的 ACL 根因叙述。
9. `background_asset.rs:177` 原生对话框过滤器标签硬编码英文 `"image"` / `"video"`（中文界面显示英文）；rev1 已按低优先记录。
10. `port_scan.rs` 预存项：`hidden_command` 三处重复且无用例；`:132` `line.contains(":{port}")` 子串会把 `:8080` 判成端口 80；`:73` 日志两字段同值。均不在本轮 diff 语义内，维持 rev1/rev2 记录。
11. `main.rs:104-115` + `drop_target.rs:228-238`：只在首次 `PageLoadEvent::Finished` 安装一次（重试窗口共 10s），主 WebView reload 后不重注册，需重启；`DROP_TARGET_INSTALLED` 在 `hwnd()` 失败时也已置位，后续 load 不再尝试。rev1 已记录。
12. `main.rs:256-257` 注释未写明该 RunEvent 分支在 Windows 上只在 OLE 注册失败（或非 Windows）时生效；`drop_target.rs:8-11` 已写整体口径，不计事实漂移（rev2 已记录）。
13. `file_drop.rs:154-159` 诊断日志与 `drop_target.rs:216` 跨线程 `HWND` 陈旧风险中「坐标只进日志」的部分，见第 5 条；其余 SAFETY 前提已由 R1 rev3 记录。
14. 文档类（`docs/knowledge-base/tauri-backend/windows-file-drop-2026-11-26.md`、`docs/architecture/features/builtin-browser.md` 的通道叙述、进度文件第 5/8 项、`windows-core` 注释措辞）留 P5，不进主表。

## 结论

- 上轮 0 finding，无待关闭项；rev2 关闭的 TTL / 串行锁 / `BackgroundAsset` 字段 / warn 日志在 rev3 未回退，消费方逐条复核仍成立。
- 本轮 R2 四个重点（TTL 与锁的消费方、`main.rs` 与 OLE 通道是否重复/死分支、`background_asset` 返回值死代码、`drop_target` 可删防御与 Cargo 依赖）全部核查完毕：**未发现应删未删的死代码、多余兼容层或应删的诊断日志**；`cursor_effect` 冗余与 6 处 payload 重复属行为等价的可选清理，按收敛约定记入「记录不修」。
- 需修复项：critical 0 / high 0 / medium 0 / low 0。

需修复项：0
