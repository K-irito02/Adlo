# R1 审查报告 — rust-backend（rev3）

## 范围

只审本 scope 的 rev3 diff（base `be34f973`，82 文件中的 other 组）：

- `adlo/src-tauri/src/drop_target.rs`（254 行，本轮唯一内容变化）
- `adlo/src-tauri/src/file_drop.rs` / `src/commands/background_asset.rs` / `src/commands/port_scan.rs` / `src/commands/mod.rs` / `src/main.rs`
- `adlo/src-tauri/Cargo.toml` / `adlo/Cargo.lock`
- `adlo/src-tauri/tauri.conf.json` / `capabilities/default.json` / `permissions/digital-life.toml`

**本轮 delta 界定**（避免把旧轮问题重复计）：对 rev2 / rev3 快照做 SHA-256 逐文件比对，结果只有 `drop_target.rs` 变化，其余 10 个文件逐字节相同。因此「rev3 新改动」= `drop_target.rs` 的以下四类，逐条核过：

1. `use std::cell::Cell` + `cursor_effect: UnsafeCell<DROPEFFECT>` → `Cell<DROPEFFECT>`（构造点同步改 `Cell::new(DROPEFFECT_NONE)`）；
2. 16 处 `unsafe` 全部补 `// SAFETY:`（下节逐点列）；
3. `collect_paths` 的 union 读取拆成 `let hglobal = unsafe { medium.u.hGlobal.0 }; let hdrop = HDROP(hglobal);`（原 `HDROP(unsafe { … } as _)`）；
4. `install` 的 `spawn(move || unsafe { …整段… })` 改为 `spawn(move || { … })` + 逐调用 `unsafe`。

只读上下文（不产出 finding）：cargo registry `windows-0.61.3` / `windows-implement-0.60.2` / `wry-0.55.1` / `tao-0.35.3` 源码、Microsoft `IDataObject::GetData` 文档、`.agents/rules/{review-judgements,dev-rules,rust-patterns}.md`、`docs/development/project-engineering-constraints.md`。未启动任何进程、未跑测试、未写源码。端口：无（未启动服务）。

## 上轮问题关闭情况

**F1（rev2 唯一剩余项：`drop_target.rs` unsafe 不变量注释缺失）：已关闭。** 逐点核对（文件行号 = 当前工作区源码）：

| # | unsafe 位置 | 操作 | SAFETY 注释 |
| --- | --- | --- | --- |
| 1 | `:73` | `IDataObject::GetData` | `:71-72`（借用期有效 + medium 由本函数释放） |
| 2 | `:75` | union 字段 `medium.u.hGlobal.0` | `:74`（tymed 为 TYMED_HGLOBAL） |
| 3 | `:78` | `DragQueryFileW(hdrop, 0xFFFF_FFFF, None)` | `:77`（CF_HDROP 的 HGLOBAL + 文档约定的计数查询） |
| 4 | `:82` | `DragQueryFileW` 查长度 | `:81`（同一 HDROP，index 在 0..count） |
| 5 | `:85` | `DragQueryFileW` 写缓冲 | `:84`（缓冲区按返回长度 +NUL 分配） |
| 6 | `:91` | `ReleaseStgMedium` | `:90`（GetData 填充、仅释放一次） |
| 7 | `:114` | DragEnter `*effect = DROPEFFECT_COPY` | `:113`（IDropTarget 契约：调用方给可写指针） |
| 8 | `:127` | DragOver `*effect = cursor` | `:126`（同上） |
| 9 | `:153` | `ScreenToClient` | `:152`（hwnd 有效 + client 本地可写） |
| 10 | `:174-181` | `RevokeDragDrop` + `RegisterDragDrop` | `:172-173`（target 存活期、hwnd 有效期） |
| 11 | `:199` | `transmute(&mut trait_obj)` | `:197-198`（仅擦生命周期、同步回调） |
| 12 | `:203` | 回调解引用 `&mut *(... as *mut &mut dyn FnMut)` | `:201`（lparam 由 EnumChildWindows 同步回传） |
| 13 | `:207-209` | `EnumChildWindows` | `:206`（根 HWND + 回调/lparam 同步期内有效） |
| 14 | `:221` | `CoInitializeEx` | `:220`（专用 STA 线程、S_FALSE 非错误） |
| 15 | `:242` | `GetMessageW` | `:241`（标准消息泵） |
| 16 | `:244-247` | `TranslateMessage` / `DispatchMessageW` | `:243`（message 已填充、当前线程队列） |

`:200` 的 `unsafe extern "system" fn enumerate` 是 ABI 声明（无块级操作），其实质操作（`:203` 解引用）已单独有 SAFETY，计入 #12。核对方式：`grep 'unsafe|SAFETY'` 全文件 33 命中逐行配对，无遗漏、无「注释挂在错误语句上」。

- **`cursor_effect` 改 `Cell` 已确认且安全**：`windows-0.61.3/.../System/Ole/mod.rs:4080` `pub struct DROPEFFECT(pub u32)`（`Copy`），`Cell::get/set` 合法；`UnsafeCell` 的 3 处读取（rev2 `:106/:108/:118`）已全部消失，现存 `:114`/`:127` 两处 `unsafe` 是 FFI 要求的出参写入（`*mut DROPEFFECT`），无法用 `Cell` 消除。`#[implement]` 宏（`windows-implement-0.60.2/src/lib.rs`）不要求 `Send`/`Sync`，`Cell` 使结构体 `!Sync` 不影响编译；结构体只在 STA 线程内构造与调用（`register_on` 在 `install` 的线程闭包内）。
- **`let mut` 未被回归**：`let mut paths`(`:79`)、`let mut buffer`(`:83`)、`let mut medium`(`:73`)、`let mut client`(`:151`)、`let mut message`(`:240`)、`let mut registration`(`:226`)、`let mut count`(`:186`)、`let mut callback`(`:190`)、`let mut trait_obj`(`:196`) 全部在位且各自都有对应的可变用法（push / `&mut` / 字段可变借用）；没有「误删 mut」或「多余 mut」（后者由主代理 clippy 门禁覆盖）。
- rev2 的其余关闭项本轮未回退：`file_drop` TTL 三件套（`MAX_AGE` / `record_drop` 覆盖 / `take_if_fresh`）、`assets_lock` 串联 import/prune、`BackgroundAsset` 只剩 `path`/`file_name`、`spawn` 与 `CoInitializeEx` 失败 warn，均在位（这些文件与 rev2 字节相同）。
- rev2 已撤回的 `windows-core` 一项复核后确认**不该报**：`#[implement]` 展开直接使用绝对路径 `::windows_core::Interface`（`windows-implement-0.60.2/src/lib.rs:150`，`windows-0.61.3/.../Ole/mod.rs:6105` 的 `IDropTarget_Impl: windows_core::IUnknownImpl` 亦然），故 `Cargo.toml:26-27` 的「必须显式声明」注释属实、依赖有真实消费方。

## 新增发现

本轮无新增需修复项。针对 rev3 delta 的四类改动逐项排查结果：

- **UB**：`Cell` 替换后读取路径全部变为安全代码；`transmute`（`:199`）仍是「瘦指针 → 瘦指针」（`&mut trait_obj` 指向局部变量，`trait_obj` 本身是胖指针，`&mut` 到它仍是 1 word），与 `enumerate` 里重构的 `*mut &mut dyn FnMut` 类型一致，回调在 `EnumChildWindows` 同步期内有效——无大小不等或悬垂。
- **生命周期 / 所有权**：`medium` 在 `GetData` 成功后到 `ReleaseStgMedium` 之间无提前 return（`:73` 的 `?` 在 medium 产生前），恰好释放一次；`hglobal` 只拷贝指针、不接管所有权；`Registration._targets` 在消息泵之后 drop，且 `RegisterDragDrop` 自身 AddRef，`target` 不会提前析构。
- **注释失实**：16 条 SAFETY 逐条与代码对照，未发现「承诺多于实现」的断言（唯一可争议的是 `:74` 的 union 前提，见「记录不修」第 1 条，属既有写法与既有风险，非本轮引入的行为变化）。
- **行为回归**：`:75-76` 的拆分、`spawn` 闭包由 `unsafe { … }` 改为逐点 `unsafe` 都不改变执行序与返回值；`cursor_effect` 的 `Cell` 读写语义与 `UnsafeCell` 版本等价。

## 记录不修

1. `drop_target.rs:74-76` union 读取没有校验 `medium.tymed == TYMED_HGLOBAL`。`IDataObject::GetData` 文档只承诺「if possible, use the requested medium」，理论上某个数据源可返回别的 medium，此时把 `u.hGlobal` 当 HDROP 用会读到错误指针。判为不修：CF_HDROP 的载荷按定义就是 HGLOBAL；`wry-0.55.1/src/webview2/drag_drop.rs:109-118` 与 `tao-0.35.3/src/platform_impl/windows/drop_handler.rs:56-65` 两处上游同写法；该读取是 rev1 就有的代码，rev3 只补注释、未改语义。若后续要收紧，只需在 `:75` 前加 `if medium.tymed != TYMED_HGLOBAL.0 as u32 { ReleaseStgMedium; return None }`。
2. `drop_target.rs:242` `while GetMessageW(…).as_bool()`：`GetMessageW` 返回 -1（错误）时 `BOOL::as_bool()` 为 true，会以未填充的 `MSG` 继续 Translate/Dispatch 并空转。属 rev1 起就存在的写法（rev3 未改），仅在消息队列异常时触发；建议后续改成 `match GetMessageW(..).0 { -1 | 0 => break, _ => … }`。
3. `drop_target.rs:167` 字段名 `_targets` 却按 `registration._targets` 正常读取（`used_underscore_binding` 默认不报）。命名误导，纯风格，rev1 起存在。
4. `drop_target.rs:145-149` Drop 在 `enter_is_valid == false` 或 `collect_paths` 失败时直接 `Ok(())`，不写 `*effect`；`DragEnter:104-106` 失败路径同样不写出参。OLE 调用前把出参初始化为 `DROPEFFECT_NONE`，故表现为「拒绝投放」，无错误行为；rev1 起存在。
5. `drop_target.rs:172-173` SAFETY 写「`hwnd` 由调用方保证在应用生命周期内有效」：根 HWND 成立，但枚举到的 WebView2 子窗口在 reload 后可能被重建，句柄会变陈旧（`ScreenToClient` 失败被 `let _` 吞掉，只影响日志坐标）。与已在册的「只在首次 PageLoad 安装一次、reload 后不重注册」同源，维持 rev1 记录。
6. 无新增测试需求：rev3 只有注释与 `UnsafeCell → Cell` 的等价替换，无可观测行为变化，写不出「删掉修复会变红」的断言；这项修复本身也不可测（注释），按简报 §5.1 用删除性推演说明即可，不算测试缺口。
7. 文档类（`docs/knowledge-base/tauri-backend/windows-file-drop-2026-11-26.md`、`docs/architecture/features/builtin-browser.md` 通道叙述、进度文件）留 P5，不进主表。

## 结论

- 上轮 1 条（F1 unsafe 注释）：已关闭；`cursor_effect` 的 `Cell` 化与 `let mut` 回归项同时确认无问题。
- 本轮 zero new findings：rev3 delta 未引入 UB、生命周期 / 所有权错误或失实注释；其余 10 个 scope 文件与 rev2 逐字节相同。
- 需修复项：critical 0 / high 0 / medium 0 / low 0。

需修复项：0
