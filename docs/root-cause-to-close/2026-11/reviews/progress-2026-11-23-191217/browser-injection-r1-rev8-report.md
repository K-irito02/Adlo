# browser-injection R1 rev8 审查报告

## 范围

- 工作树：`E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-1`；快照：`.review-diffs/manifest-rev8.md`（base `aced53d8`，78 文件）。只看 rev8 完整快照，未复用旧快照、未看任何增量 diff、未执行 `git diff/log/show`。
- 指定文件：`adlo/crates/browser/src/init_script.js`、`adlo/crates/browser/src/webview2_postmessage.rs`、`adlo/frontend/src/app/features/browser/initScriptNavigation.test.ts`。
- 连带只读核对（用于验证注释断言，不进范围结论）：`adlo/src-tauri/src/commands/download_commands.rs`（`sanitize_download_file_name`）、`adlo/src-tauri/src/webview_event_bridge.rs`（`save_blob_failed`）。
- 方法：只读源码 + 静态推演；另在 Code Mode 运行时内**按 `init_script.js:1274-1296` 原文逐字重敲**该函数做纯字符串复算（未读写文件、未起进程）。**未运行测试套件**（删除性推演代替）**未启动 dev server / 浏览器**（未占用任何端口，无残留进程）。
- 重点：`__adlTruncateName` 新增 basename 处理（`/`、`\`、空名）是否与保存/失败两通道、扩展名/代理对逻辑自洽；有无新回归。

## 上轮问题关闭情况（逐条）

1. **rev7 结论「本轮零问题」— 维持，且本轮未引入回归。** rev7 已关闭的 rev6-F1/F2 两条在本轮源码中保持原样：
   - 保存通道 `init_script.js:323` 仍在 `fetch` 之前 `filename = __adlTruncateName(filename);`，`:333`/`:329`/`:337` 三个出口都用截断后的值；
   - 失败通道 `:308` `fileName: __adlTruncateName(filename)` 未变；
   - `initScriptNavigation.test.ts:249-255` 的 `blobSection` 调用点锁（`__adlSaveBlobDownload(filename, b64);` / `'too large'` / `'fetch failed: ' + String(e)`）与 `:899-910` 的 `hits === 2`（`:602`、`:632` 两处 `}else{navigateToUrl(href);}`）字节未动，断言仍可满足。

2. **本轮变更（`__adlTruncateName` 新增 basename 处理）— 自洽，无回归。** 新增块 `init_script.js:1276-1284`：
   - **两条通道同源**：保存通道与失败通道都只经 `__adlTruncateName` 一个出口（全仓 `grep` 3 处引用 + 1 处定义，无第三处绕过）；宿主侧最终展示/落盘的名字因此一致 —— `webview_event_bridge.rs:76-88` 的失败事件用同一 `fileName`，`download_commands.rs:428` 的成功落盘用同一名字，不存在「提示名 ≠ 落盘名」。
   - **注释断言成立**：`:1276` 「path separators are rejected by the host」经核对 `download_commands.rs:49-51`（`name.contains('/') || name.contains('\\')` → reject）为真，且两个分隔符是**无条件**拒绝（未按平台分支），因此页面侧 `\`→`/` 归一后再取末段与宿主口径一致，不是过度承诺。
   - **与扩展名/代理对逻辑自洽**：basename 在长度判定之前完成，截断与扩展名保留只在纯粹的 basename 上运行；纯字符串复算（原文逐字重跑）结果：
     - `'dir/name.ext'`→`name.ext`、`'C:\dir\name.ext'`→`name.ext`、`'a/b/'`/`'/'`/`'\\'`/`'C:\a\b\'`→`download`；所有输出都不再含 `/` 或 `\`。
     - `'a'.repeat(300)`→255、`'x'.repeat(300)+'.pdf'`→251+`.pdf`=255、`'😀'.repeat(200)`→254、`'a'.repeat(254)+'😀'+'.xlsx'`→255、`'dir/'+'a'*300+'.pdf'`→255、`'dir/'+'a'*250+'😀'*5+'.pdf'`→254：**恒 ≤255 码元**，故 ≤255 Unicode 标量，恒不触发 `webview2_postmessage.rs:332/365` 的 `chars().count() > 255` 拒绝线（阈值同为 255、同为 `>` 判定）；`JSON.stringify` 长度 ≤257。
     - 所有输出均**不含孤立代理**，且 `truncate(truncate(x)) === truncate(x)`（basename 剥离与 255 早退共同保证幂等），失败通道的二次截断不会二次变形。
   - **删除性推演（回归保护有效）**：删掉 `1278-1281`（取末段）→ 新用例 `:69`（`'dir/name.ext'`）与 `:70`（`C:\dir\name.ext`，此时也不再被归一）变红；删掉 `1277` 的 `\`→`/` → `:70` 变红；只删 `1282-1284`（空名兜底）→ `:71`（`'/'`→`download`）变红；把 255 改小或删扩展名/末位代理守卫 → 既有 `:56`/`:61`/`:65` 变红。三类边界各有独立失败断言，不是「标题承诺、断言不覆盖」。
   - **pure block 仍完整**：函数 `1274-1296` 落在 `// __ADL_PURE_START__`（`:1192`）与 `// __ADL_PURE_END__`（`:1297`）之间，`extractPureBlock()` 切片后 `loadPure()`（`test.ts:40`）仍能取到 `truncate`；函数声明提升，`:308`/`:323` 的前置调用合法。
   - **无新副作用**：basename 化只会让名字更短且更安全（`'dir/..'`→`'..'` 仍被宿主 `download_commands.rs:45-47` 精确拒绝；Windows 保留名/非法字符仍由宿主 `is_windows_illegal` 拦截，本轮未放宽任何一条）。

## 新增发现

本轮零问题：未发现需修复项。

## 记录不修

- **纯空白名仍会静默丢弃**（预存，不在本轮引入）：`'   '` 经 `__adlTruncateName` 原样返回（复算已验），宿主 `parse_save_blob`（`webview2_postmessage.rs:359-372`）`trim` 后为空 → 返回 `None`，既不落盘也不发 `browser-download-error`，用户无提示。在 `__adlTruncateName` 里加一次 `trim()` 即可顺手闭合；本轮与 rev6-F1 无关，故只记录。
- **函数名与职责扩大**：`__adlTruncateName` 现在同时做「取末段 + 兜底 + 截断 + 保扩展名」，名只揭示截断（Mysterious Name）。下次触碰时改名（如 `__adlDownloadName`）即可，纯风格。
- **与浏览器模式的命名差异**：Chrome/Edge 把 `download="dir/name.ext"` 的 `/` 替换为 `_`（`dir_name.ext`），桌面注入脚本取末段（`name.ext`）；两者都能落盘，仅极端带路径的属性值文件名不同，不单列。
- **blob URL 段内 `%2F` 的行为变化**：点击处理器 `:453-454` 对 blob 段做 `decodeURIComponent`，段内 `%2F` 解码出 `/` 后现在会被取末段（此前是宿主 reject 报错）；方向更宽松，属本轮 basename 设计的自然结果。
- **rev7 结转项仍在**：截断不变量放在调用方（`:308`/`:323`）而非 `__adlSaveBlobDownload` 出口；`webview2_postmessage.rs:1-13` 模块文档仍不列 `save-blob-failed`（`:90` 先于 `:96` 分派）；测试文件头 `test.ts:6` 仍写「两个纯函数」（`loadPure` 已返回三个）；`blobSection` 上界依赖 `'// ---- FETCH OVERRIDE'` 注释字面量；扩展名保留的 20 码元界未写进注释；失败调用点仍是字面量锁而非 jsdom 行为锁。
- **`dot > 0` 使 300 字符的 dotfile 不保留「扩展名」**：`.xxx…` 形态的名字没有扩展名概念，按基名截断正确，非缺陷。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）—— 本轮零问题。新增的 basename 处理与宿主 `sanitize_download_file_name` 的无条件分隔符拒绝同口径，保存/失败两条通道共用同一出口且名字一致；复算证明截断仍恒 ≤255 码元、不产孤立代理、幂等，扩展名与代理对逻辑未被破坏；新用例对 `dir/`、`C:\…\`、`/` 三条路径逐条删除敏感，既有 255/扩展名/末位代理与 `hits === 2` 等回归锁无退化。
