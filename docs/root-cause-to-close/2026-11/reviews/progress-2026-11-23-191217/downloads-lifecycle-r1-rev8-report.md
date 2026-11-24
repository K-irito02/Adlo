# P4 R1 第八轮复审报告 — downloads-lifecycle（rev8）

## 范围

- 工作树：`E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-1`；只看 `rev8` 完整快照（base `aced53d8`，commits 0，78 文件）与 `manifest-rev8.md`，未复用 rev1–rev7 快照、未看增量 diff。
- 本子代理源码范围（只读）：
  - `adlo/crates/browser/src/init_script.js`（blob 下载段 `:274-343`、blob 点击拦截 `:433-467`、`__adlTruncateName` 纯块 `:1272-1297`）
  - `adlo/crates/browser/src/webview2_postmessage.rs`（`save-blob` / `save-blob-failed` 解析 `:304-390`、handler 分派 `:88-124`、单测 `:423-700`）
  - `adlo/frontend/src/app/features/browser/initScriptNavigation.test.ts`（`loadPure` `:33-47`、truncate/basename 用例 `:52-73`、blob 段锁 `:230-256`）
  - `adlo/src-tauri/src/commands/download_commands.rs`（`sanitize_*` `:34-100`、`save_blob_download` `:405-537`、单测 `:539-620`）
- 为核对链路只读参考：`adlo/src-tauri/src/webview_event_bridge.rs:45-88`（`save_blob` / `save_blob_failed`）、`adlo/frontend/src/app/stores/slices/browserDownloadsSlice.ts:423-468`（`browser-download-error` → toast / 记录标记）、`adlo/frontend/src/app/features/browser/useBrowserSuspendScheduler.ts:104-108`（`isDownloading` 保护）。
- **未运行** `git diff/log/show`，**未跑** `check:changed`、vitest、`cargo test`、`cargo clippy`；全部结论用删除性推演（读用例 + 读实现）。**未启动 dev server / 浏览器，未占用任何端口，无后台进程**；未写临时脚本。文档（`docs/**`、进度文件）按简报导则留给 P5。

## 上轮问题关闭情况

1. **rev7 F1（low，`download="dir/name.ext"` 的建议名被原样透传 → 宿主按含路径分隔符整单拒绝）→ 已关闭。**
   - 修复落在唯一的名字归一函数：`init_script.js:1274-1284` 先 `s.replace(/\\/g, '/')`，再 `lastIndexOf('/')` 取 basename（`slash + 1` 之后），空结果回落 `'download'`；归一在长度判断之前，因此 ≤255 的短名同样被剥目录。
   - 生产链路唯一入口：`init_script.js:450`（`download` 属性原样取值）→ `:458` `__adlDownloadBlob(blobHref, blobName)` → `:323` `filename = __adlTruncateName(filename);` → `:333` `__adlSaveBlobDownload(filename, b64)`。`__adlSaveBlobDownload` 全文件仅 `:333` 一处调用，页面无法绕过 `:323`；失败回传 `:308` 也走同一函数。
   - 宿主契约未放宽：`download_commands.rs:49-51` 仍拒绝 `/`、`\`，`:56-59` 仍拒绝 Windows 非法/保留名，且各有单测（`:580-595`、`:612-619`）。生产端现在满足 `:34-36` 声明的「仅接受单一安全文件名」。
   - 与扩展名保留的交互正确：扩展名判定（`:1288-1289`）在 basename 之后执行，`dir.v2/name.ext` 只按 `name.ext` 取 ext；`keep = 255 - ext.length` 且 `keep < dot` 恒成立（`s.length > 255` 时 `dot ≤ s.length - 4`），不会重复扩展名，也不会把目录里的点当成扩展名。
   - 锁可反向验证：`initScriptNavigation.test.ts:68-72` 断言 `truncate('dir/name.ext') === 'name.ext'`、`truncate('C:\\dir\\name.ext') === 'name.ext'`、`truncate('/') === 'download'`；`:234` 锁 `__adlDownloadBlob(blobHref, blobName)`，`:247-248` 锁函数存在与赋值形态。删除性推演：删掉 `:1276-1284` 的 basename 归一 → `:69`/`:70` 红（纯函数直接返回原串）；删掉 `:323` 的赋值 → `:248` 红，而 `:69-70` 仍绿（说明两条锁分别覆盖「归一逻辑」与「接线」）；把归一挪到 `__adlDownloadBlob` 之外（如 `:450` 就地切 basename）→ `:234`/`:248`/`:69` 组合会分别变红。
   - 无双重归一副作用：`__adlNotifyBlobFailed`（`:308`）对已归一名的二次截断幂等；blob URL pathname 兜底（`:451-456`）本就取 basename，归一后不变。
2. **rev7 F2（low，锁 0 字节的用例名仍写「rejects … empty fields」而断言相反）→ 已关闭。**
   - 用例改名为 `save_blob_rejects_wrong_type_and_missing_fields`（`webview2_postmessage.rs:625`）。断言逐条对照：`:626-631` 错误 type → `is_none`；`:632-635` 空 **fileName** → `is_none`；`:634-637` 空 **dataBase64** → `is_some`（注释明写「legitimate zero-byte blob」）；`:638` 缺 `dataBase64` → `is_none`；`:639` 非 JSON → `is_none`。名字承诺的「wrong type」「missing fields」都有对应会失败的断言，不再与「空数据被接受」相反；`dataBase64: ""` 的契约仍被锁住（改回 `is_none()` 即红）。
   - 0 字节链路本轮未改动且仍成立：`parse_save_blob` 只在 `dataBase64` 缺失（`as_str() == None`）时拒绝（`:373-390`），空串走长度判断放行；`blob_exceeds_limit(0)` 为 false（`download_commands.rs:20-22` + 单测 `:543-548`）；解码空串、写空文件、`create_download`/`complete_download` 均不把 0 字节当异常（rev7 已核，本轮无相关改动）。

## 新增发现

无。本轮定向复核的项目：

- **命令删除无悬空引用**：`download_save_blob` 在 `adlo/` 全仓（含 `frontend/`、`capabilities`/`permissions`）零命中；`save_blob_download` 的唯一生产调用方是 `webview_event_bridge.rs:62-68`，签名与文档一致；`download_commands.rs` 仍在使用 `ipc`/`IpcResult`/`CommandError`（其他命令），无未用导入痕迹。
- **源码锁仍与实现对齐**：`:445-447` 的 needle（`bridge_for_handler.save_blob(&tab_id_for_handler,&blob.file_name,&blob.data_base64`）与 `:96-101` 实际调用一致（去空白后连续）；桥接端 `webview_event_bridge.rs:76` 的 `fn save_blob_failed(&self, tab_id: &str, file_name: &str) {` 与 `:458` 的 needle 一致；`"fileName":file_name` 在 `:82` 存在。
- **注释与实现一致**：`init_script.js:1272-1273`（255 上限 / 保留扩展名 / 不切断代理对）、`:1276`（分隔符被宿主拒绝，已核 `download_commands.rs:49-51`）、`:433-437`（普通站点仅显式 download 链接接管、agent 站点全量、http(s) 走原生）、`:302-303`（页面侧失败与宿主拒绝对用户是同一条 toast，已核 `browserDownloadsSlice.ts:428-438`）、`download_commands.rs:14-16`（64 MiB 与 JS 同界；base64 上限 96 MiB 对应 ≈72 MiB 解码，JS 侧先按 64 MiB 原始字节拦，二者不互相卡死）、`:424-426`（拒绝路径发同一条带 `fileName` 的错误事件，已核前端 `!hasRecord && payload.fileName` 才弹 toast，`id: ""` 不会误标既有记录）。
- **异步/失败路径无新问题**：`save_blob_download` 在 `spawn_blocking` 落定后才用返回的 `record`（非 await 前快照）；上限检查在 `fs::write` 之前（`:459-465`），不会留下超限半成品；拒绝路径与 spawn 失败路径都只影响本次下载并回传事件。

## 记录不修

- **Windows 非法字符 / 保留设备名仍未在 JS 兜底**（`init_script.js:1274-1296` 只处理分隔符；`download_commands.rs:56-59` 整单拒绝）：`download="Q3: report.csv"`、`NUL.txt` 这类建议名仍会「无文件 + 失败 toast」。rev7 F1 的建议修复原文允许保留该语义（「如需保留『整单失败』的语义，至少让名字不含分隔符」），且浏览器侧 `download` 属性带 `: ? * " < > |` 属罕见输入；作为可接受边界记录，若后续要对齐 Chrome 的字符替换再改。
- **纯空白建议名仍会被静默丢弃**：`download="   "` → `__adlTruncateName` 返回原串（`:1285` 早退，未 trim）→ 宿主 `parse_save_blob` `trim()` 后为空返回 `None`（`webview2_postmessage.rs:369-376`），无 toast；页面需刻意构造，且 `download=""` 已走 pathname 兜底，本轮不改。
- **`__adlTruncateName` 现在兼做「basename 归一 + 空名兜底 + 截断」，名称与 describe 标题（`initScriptNavigation.test.ts:52`）只提 truncation**：职责略宽于命名，属风格；拆函数会牵动纯块 markers 与锁，收益不足。
- **测试文件头 JSDoc 仍写「两个纯函数」**（`initScriptNavigation.test.ts:5-13`）：`loadPure` 现返回三个（含 `truncate`），但该句是 C1 主题说明而非「仅有」，不算事实错误；不单独开轮。
- **`save_blob_download` 文档「该标签在下载期间由挂起调度器保护」**（`download_commands.rs:408-409`）：`isDownloading` 确由 `activeDownloads` 派生（`useBrowserSuspendScheduler.ts:104-108`），但 blob 路径先落盘、后发 `browser-download-started`（`:516`）并立即 `complete_download`（`:518`），保护窗口极短；措辞偏强但不影响行为。
- **既有记录项状态未变**：`template.replace('{name}', …)` 的 `$` 语义、blob 成功但 `create_download` 失败留孤儿文件、`spawn_blocking` join 失败早退、每条 postMessage 多次 `serde_json` 解析、超限/取数失败路径不 `revokeObjectURL`、`save-blob-failed` 解析失败无日志、`blob_bridge_passes_requesting_tab_id_through` 标题偏窄（`:436`）、页面自带孤立代理项不净化、`download` 为空时 blob 名退化为 UUID 无扩展名——均与 rev7 一致，非本轮回归。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——本轮零问题。
- rev7 两项均在本轮真正关闭，且删除性推演可让对应用例变红：basename 归一已进唯一的名字归一函数并被纯函数用例 + 接线锁双重覆盖；0 字节用例名已改为与断言一致（空数据仍被锁为合法）。未发现新回归：命令删除无悬空引用、源码锁与实现一致、注释无与最终行为相反的绝对断言。
