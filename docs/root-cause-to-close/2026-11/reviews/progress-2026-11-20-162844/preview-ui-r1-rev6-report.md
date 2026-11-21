# preview-ui R1 定向复核 — rev6

## 范围

仅核对 `adlo/frontend/src/app/regions/right-panel/heavyPreviewLimits.ts` 两处：

1. 媒体阈值说明（`HEAVY_PREVIEW_BYTES` 注释，5–11 行）与 hint 体积改为 `fileContent.length` 近似（`TEXT_HEAVY_PREVIEW_CHARS` 注释，22–27 行）是否与最终实现（`FilePreviewRenderers.tsx` / `EditorSurfaceShell.tsx`）逐句相符；
2. 同文件是否还有旧上限 / `TextEncoder` 残留。

只读源码 + rev6 快照；未跑测试、未起服务、未改源码。

## 上轮问题关闭情况

本轮为定向复核，主代理未附逐条上轮清单；按指定两点核对结果：

1. 媒体阈值说明（媒体「先确认再渲染」、Office/PDF 整份 fetch）→ **已关闭**（逐句相符，见下）。
2. hint 体积按 `fileContent.length` 近似 → **已关闭**（实现如此，`TextEncoder` 已移除）。
3. 同文件旧上限 / `TextEncoder` 残留 → **无**。

## 核对明细（逐句）

- 「文本读取上限为 8MB」：`adlo/crates/workspace/src/lib.rs:67` `DEFAULT_MAX_TEXT_FILE_BYTES: u64 = 8 * 1024 * 1024`；浏览器/预览服务同值 `adlo/frontend/dev/previewWorkspaceService/files.ts:9`。
- 「媒体走 Range 流式端点，不再有传输体积上限」：`crates/server/src/router.rs:55-56` 注册 `/workspace/media`；`crates/server/src/handlers/workspace.rs:520-629` 按 `Range` 返回 206/整文件 200、`ReaderStream` 流式，无体积上限；前端消费方仅把 `fileMedia.url` 作 `<img>/<audio>/<video>` 的 src（`FilePreviewRenderers.tsx:430-445`）；httpBridge 用例以 60 MiB 源验证无 50 MiB 限制（`frontend/src/httpBridge/__tests__/mediaSource.test.ts:56`）。
- 「这里的媒体阈值只是『先确认再渲染』的二次门禁」：`FilePreviewRenderers.tsx:357-379`——只有 `fileMedia.size > 阈值` 且未确认时返回 `HeavyPreviewGate`，确认后照常渲染，不截断字节。操作语义属实（「二次」见「记录不修」）。
- 「Office/PDF 分支会把整份字节 fetch 给解析库」：`FilePreviewRenderers.tsx:113-146` `fetch(url)` → `response.arrayBuffer()`（不带 `Range`，服务端回整份）；PDF 分支在 `:254-266` 也直接用该 `data`。门在挂载 `OfficeBranch` 之前（`:361-379`），确认前零请求与注释（`:109-112`）一致。
- 「阈值同时限制这一步」：Office 四个品类均列入 `HEAVY_PREVIEW_BYTES`（12-20 行），门以 `fileMedia.size` 判定；确认后不再重复打扰（模块级 Set），与门语义一致。
- 「未列出的品类（text/code/markdown/binary）无字节门：文本走字符门，binary 无预览——索引得 undefined 即『不设门』」：品类全集见 `fileTypeRouter.ts:1-12`，未列入即这四类；`FilePreviewRenderers.tsx:360` 以 `undefined` 判定不设门；binary 走 `UnsupportedPreviewCard`（`:471-480`）；文本门见 `EditorSurfaceShell.tsx:244-263`（`length > TEXT_HEAVY_PREVIEW_CHARS` + `isHeavyTextCategory`）。
- 「按 JS string.length 即 UTF-16 码元计」：`EditorSurfaceShell.tsx:246`、`useFilesPanelProps.ts:27`、`diffCost.ts:23-30` 全用 `.length`；无字节编码参与判定。
- 「hint 显示的体积按 `fileContent.length` 近似（见 EditorSurfaceShell）」：`EditorSurfaceShell.tsx:151-153` `heavyTextBytes = fileContent?.length ?? 0`，`:255` `formatBytes(heavyTextBytes)`；该分支下 `fileContent !== undefined` 保证非空（`:245`）。`heavyPreviewLimits.ts` 内及 `EditorSurfaceShell.tsx` 本段已无 `TextEncoder`。
- 「变更预览体积取 base/current 较大者，仅用于确认门卡片；是否进门由 `classifyDiffTier` 决定」：`panels/DiffEditorSection.tsx:298-321`（`formatBytes(heavyContentLength)` → `HeavyPreviewGate`）与 `:108/:302`（`costTier === 'heavy'`）。
- 旧上限残留：`heavyPreviewLimits.ts` 全文无 50MB / base64 / `TextEncoder` 字样，剩余常量（`LIGHT_MAX_CHARS` / `LIGHT_MAX_LINES` / `HEAVY_MAX_LINES` / `CONFIRMED_PATHS_LIMIT`）均有活跃消费者。

## 新增发现

无。

## 记录不修

- `heavyPreviewLimits.ts:7`「二次门禁」：删除传输上限后「首道门」已不存在；同句已明说「不再有传输体积上限」，操作语义（只确认、不截断）不变，属可读性措辞（可选改为「确认门」）。
- `heavyPreviewLimits.ts:24`「txt/md/代码超 1MB 时先提示」为简写：未列两个边界——(a) 该文件有活跃补丁时走补丁 diff、不进门（`EditorSurfaceShell.tsx:241-249` 已就地注释）；(b) `'text'` 是所有未识别后缀的兜底（`fileTypeRouter.ts:210`），不止 `.txt`。行为无误，不改变事实。
- `FilePreviewRenderers.tsx:360` 的 `fileCategory === 'binary' ? undefined : ...` 与「binary 未列入 map 即不设门」重复，属纯冗余，非旧上限残留。

## 结论

- 需修复项：0（本轮零问题）（critical/high/medium/low 各 0）
