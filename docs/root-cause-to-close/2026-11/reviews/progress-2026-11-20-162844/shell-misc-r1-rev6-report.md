# shell-misc R1 定向复核（rev6）

## 范围

仅核三处（rev6 快照 + 工作区源码交叉验证）：

1. `adlo/frontend/src/app/i18n/{zh-CN,en-US}/settings.ts` → `storageCategoryLogsRelated`
2. `adlo/frontend/src/app/utils/debugLogCollector.ts` 头注释 vs 实际全局暴露
3. `adlo/frontend/src/app/regions/right-panel/heavyPreviewLimits.ts` 媒体/Office 说明 vs 实现

未跑测试/服务，未改源码。

## 上轮问题关闭情况

1. **`storageCategoryLogsRelated` 去掉「复制调试日志 / copy debug logs」— 已关闭**
   - zh-CN:254 = `与调试工具（日志收起器、控制台导出 API）及问题排查流程有关。`
   - en-US:286-287 = `Relates to debugging tools (log collector, console export API) and the troubleshooting workflow.`
   - rev6 diff 两侧同形替换（`log collector` / `console export API` 对位），无单端残留。

2. **`debugLogCollector.ts` 头注释全局名与赋值一致 — 已关闭**
   - 头注释（1-6 行）声明 `window.__dlDebugLogs` / `window.__exportDebugLogs`；
   - 赋值 353 行 `global.__dlDebugLogs = debugLogs`、355 行 `global.__exportDebugLogs = exportLogsAsText`，名称一致。
   - 「界面不再提供复制按钮」成立：`createDraggableCopyButton` 及其 `DOMContentLoaded` 挂载已整体删除（diff 19-180 行），`src` 内无其他复制日志按钮/`debugCopyLogs` 引用（仅测试标题保留该描述）。

3. **`heavyPreviewLimits.ts` 媒体/Office 说明与实现一致 — 已关闭（无新漂移）**
   - 「文本读取上限为 8MB」：`dev/previewWorkspaceService/files.ts:9` `DEFAULT_MAX_TEXT_FILE_BYTES = 8 * 1024 * 1024`，mock 同限。
   - 「媒体走 Range 流式端点，不再有传输体积上限」：`httpBridge.ts:198` 说明 `url` 为 Range 端点，`<img>/<audio>/<video>` 直接引用；阈值仅作用于 `HEAVY_PREVIEW_BYTES`。
   - 「Office/PDF 分支会把整份字节 fetch 给解析库，阈值同时限制这一步」：`FilePreviewRenderers.tsx:123-128` `fetch(url)→arrayBuffer()`；确认门（361-379）在 `OfficeBranch` 挂载前返回，确认前不发起 fetch（同文件 110-111 注释一致）。
   - 「未列出的品类（text/code/markdown/binary）无字节门」：`HEAVY_PREVIEW_BYTES` 仅含 image/audio/video/docx/pdf/spreadsheet/presentation；`FilePreviewRenderers.tsx:360` 用 `Partial` 索引，binary 显式 `undefined`，新增品类默认不设门，与注释「有意为之」一致。
   - 「hint 体积按 `fileContent.length` 近似（见 EditorSurfaceShell）」：`EditorSurfaceShell.tsx:153/255` `heavyTextBytes = fileContent.length` → `formatBytes(...)`，措辞「近似」与实现相符。

## 新增发现

无（本轮三处均未发现需修复的新漂移）。

## 记录不修

- zh `storageCategoryLogsRelated` 用「日志收起器」，en 对应 `log collector`；「收起器」为历史沿用词（根 `AGENTS.md` 调试工具表同样写作「日志收起器」），非本轮新引入，语义可读懂且与仓库既有称谓一致 — 不改。
- 根 `AGENTS.md`「调试工具」表仍列「复制按钮」行，属治理文档漂移，按简报 §28 不在 R1 范围，留给 P5 同步。
- `debugLogCollector.ts:3` 「写入选定日志文件」措辞略泛（实际落点由模式/构建决定），属既有表述、无绝对断言，不改。

## 结论

- 需修复项：0（critical/high/medium/low 各 0）—— 本轮零问题。
