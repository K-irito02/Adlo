# 代码审查报告：下载统一走原生 WebView2 管线（issue-1-rev1）

## 0. 输入与范围

- 审查快照：`e:\AI-DIGITAL-LIFE\SourceWorkspace\.review-diffs\issue-1-rev1.diff`
- 对照源码（只读）：
  - `ai-digital-life/crates/browser/src/init_script.js`
  - `ai-digital-life/crates/browser/src/download_handler.rs`
  - `ai-digital-life/crates/browser/src/download_manager.rs`
  - `ai-digital-life/src-tauri/src/commands/download_commands.rs`
  - `ai-digital-life/src-tauri/src/commands/browser_webview_setup.rs`
  - `ai-digital-life/frontend/src/app/stores/slices/browserDownloadsSlice.ts`（browser-download-error 消费端）

变更概要：删除 `window.fetch` 下载拦截；`window.open` 用 `new URL(rawUrl, location.href)` 解析相对路径并仅采纳 http(s)，下载 URL 改走 `window.location.assign` 同文档导航触发原生 DownloadStarting；`location.assign/replace` 与表单提交下载不再 JS 拦截，仅记录日志；`download_save_blob` 错误处理重构并新增 `browser-download-error` 发射。

---

## 1. 根因与正确性

### 1.1 相对 URL 根因识别 — 正确（采纳）
根因判定成立：`isValidWebUrl`（JS 侧 `init_script.js:17-20`、Rust 侧 `new_window_target`）只接受 `http://`/`https://`/`//` 前缀。用户自建站 `window.open('/uploads/.../file.exe', '_blank')` 的相对路径被旧门判为 invalid → 返回 null，下载不触发。用 `new URL(rawUrl, location.href)` 解析并仅采纳 http(s) 是**正确、最小化**的修复；同时协议相对 `//host/x` 也能在此正确解析为绝对 http(s)。安全边界（`javascript:`/`data:`/`mailto:` 未被采纳）正确，仍返回 null。

### 1.2 location.assign 命中自身 override — 正确（无递归）
`window.open` 下载分支（`init_script.js:319`）调用 `window.location.assign(resolvedUrl)`，命中被重写的 `Location.prototype.assign`（`339-352`）；该 override 对 http(s) 仅记录日志后调 `originalAssign.call(this, url)` 走原生导航，不会再次进入下载拦截逻辑，无递归、无双重下载。

### 1.3 遗漏的边界情况

- **（中-高，新回归风险）扩展名判定 vs WebView2 MIME 判定不匹配**：JS `isDownloadUrl` 按 URL 扩展名（`DOWNLOAD_EXTENSIONS`）/`/download/`/query 判定下载，而 WebView2 `DownloadStarting` 是按**响应**的 Content-Disposition/MIME 触发的。若 `window.open('.zip'.../'/download/'...)` 实际返回 `text/html`（401/302 重定向到登录页、Range 非全量、动态页），WebView2 不会触发下载，而是把**当前文档真实导航**到该 URL 展示内容——用户当前页面/SPA 状态被丢弃。旧实现 fetch+base64+IPC（`__adlDownloadUrl`）保存文件时页面不丢失。普通下载链接（Content-Disposition: attachment）不受影响，但"按扩展名猜下载、实际返回 HTML"的站点会失去当前页。属架构取舍，需在文档/验收明确，并对返回 HTML 的"假下载"做兜底提示。

- **（中）`<a download>` / `<form>` 的 `target="_blank"` 下载仍被取消**：click 路径对 `<a download target="_blank">` 已显式归一化为 `_self`（`init_script.js:228-235`），但 form submit 路径（`379-404`）现在既不 `preventDefault` 也不强制 `target=_self`。WebView2 对 form 的 `target="_blank"` 下载会触发 `NewWindowRequested` → `new_window_handler` 对下载 URL `Deny`（`browser_webview_setup.rs:77-83`），下载被取消——正是 diff 注释自述的 `window.open` 同类问题（`init_script.js:311-316`），表单路径漏了同样的归一化。建议：form action 为下载 URL 且 `target` 非 `_self` 时，同样改写为 `_self` 后再放行。

- **（中，预存）blob: 下载经 `window.open` 仍不可用**：解析块仅采纳 http(s)，`blob:` 保持 raw → `isValidWebUrl(blob:)` 为 false → 返回 null。变更前后行为相同（此前 `window.open` 也用 `isValidWebUrl` 门）。blob: 下载目前只在**点击 `<a>`** 路径可用（`192-214`），`window.open(blobUrl)` 场景仍未覆盖。可接受但建议注明为已知限制。

- **（低）非 http 下载（ftp: 等）**：不被采纳 → 返回 null，与旧逻辑一致，属故意取舍，可接受。

- **（低）window.open 非下载相对 URL 行为变化**：`window.open('/relative/page')` 旧逻辑返回 null，现解析为绝对 URL 并经 `origOpen` 开新窗口。更贴近 Chrome，属改进；仅当站点依赖返回 null（如探测弹窗能力）时有轻微行为变化。

---

## 2. 技术方案与设计质量

- **命名/注释**：充分，下载路由意图、`window.open` 根因、`new_window_handler` DENY 的坑均有注释（`init_script.js:281-329`）。
- **remove_fetch 拦截清理**：完整，原 `window.fetch` override 整段替换为说明注释，无残留死代码。
- **无死代码**：`__adlDownloadUrl`/`__adlSaveBlobDownload`/`__adlArrayBufferToBase64`/`getFilenameFromUrl`/`isBlobUrl` 仍被 **blob: 点击路径**（`init_script.js:192-214`）使用；Rust `download_save_blob` 命令仍为 blob 路径服务，均非死代码。✓
- **download_save_blob 重构**（`download_commands.rs:198-281`）：闭包收集 `Result<DownloadRecord, AppError>` + `match` 错误分支 emit `browser-download-error` + `return Err`，结构干净；成功路径改用 `record.file_path`（resolved 结果）上报，比原 `final_path` 更准确。✓
- **职责不一致（低）**：click 路径对 `<a download>` 直接放行、靠原生导航；`window.open` 路径却显式 navigate 当前文档——两者表面"都走原生"但语义不同，且 click 路径能做 `target=_self` 归一化而 `window.open` 路径无法归一化目标窗口。可接受但建议注释说明两条路径策略不同。
- **form submit listener 近乎无意义（低）**：当前仅记录日志、无任何副作用。若无其它用途可考虑删除减噪；保留观测亦无害。
- **JS/Rust 双份下载判定（预存，低）**：`init_script.js isDownloadUrl` 与 `browser_webview_setup.rs is_download_url`、`DOWNLOAD_EXTENSIONS` 双份维护，扩展名表易漂移。建议注释标注需同步。

---

## 3. 副作用与安全性

- **（中-高）window.open 下载绕过 SPA 守卫且可能丢失当前页**：下载改走 `location.assign` 绕开 SPA nav-guard，下载本不应进 SPA history，方向正确；但对**非 attachment 的 inline 响应**，`location.assign` 会替换当前文档，SPA 守卫被真正绕过且页面丢失（见 1.3）。建议在文档/验收明确取舍，并对返回 HTML 的"假下载"URL 提供兜底提示。
- **（安全，正确）非 http(s) scheme 保持禁用**：`javascript:`/`data:` 等未被采纳，仍返回 null，未引入 XSS/协议绕过。✓
- **（正确）download_save_blob 错误事件契约一致**：`browser-download-error` payload `{id, url, reason, canRetry}` 与前端 `DownloadErrorPayload` 消费（`browserDownloadsSlice.ts:204-223`，用 `payload.reason→interrupt_reason`、`payload.id` 移除 activeDownloads）匹配；错误分支 `tracing::warn!` + emit + `return Err` 完整。✓
- **（低）`#![allow(linker_messages)]`（main.rs）**：抑制无害 MSVC 链接器 "creating library .lib/.exp" 信息，合理无副作用；但与"下载管线"变更无关，属附带改动，建议单独提交/描述中注明。
- **on_download 新增 decision 日志**（`browser_webview_setup.rs:163-168`）：打印 url/allowed/resolved_destination，对排查 DownloadStarting 是否放行有实质价值，无副作用。✓

---

## 4. 预存问题（审查范围内）

- **（中，安全）`download_save_blob` 路径穿越**：`download_commands.rs:226` `target_dir.join(&file_name)` 未校验 `file_name`。file_name 来源于 download attribute 或 URL 最后一段（`init_script.js`），恶意 `../` / 绝对路径可越出默认下载目录写入任意位置。blob 文件由页面触发，暴露面可控，建议加路径约束（拒绝 `..` 组件 / 仅取 NameOnly）。
- **（低）`get_record_by_url` 精确字符串去重**（`download_manager.rs:233`）：相对/绝对、query 顺序、fragment 差异会导致同一下载重复建记录。本次 relative 解析可能反而增加此类重复触发概率。
- **（低）`isDownloadUrl` 每 URL 打多行 debug/console**：每命中一次就 console.log，噪音大，仅影响调试。
- **（低）进度监控基于文件大小轮询**（`start_download_progress_monitor`）：粗糙，非本变更引入。

---

## 5. 结论汇总

| 区域 | 结论 | 严重性 | 建议 |
|------|------|--------|------|
| 相对 URL 根因 | 识别与修复正确 | — | 采纳 |
| location.assign 自身 override | 无递归，正确 | — | 采纳 |
| window.open 下载改导航 / extension vs MIME 不匹配 | 回归风险：inline 响应会把当前页真实导航丢页 | 中-高 | 文档/验收明确取舍；对返回 HTML 的假下载提供兜底 |
| `<a download>/<form>` target=_blank 下载 | click 已归一化 `_self`，**表单路径漏归一化** → 下载仍被 new_window_handler DENY 取消 | 中 | 表单 target 非 `_self` 时改写 `_self` |
| blob: 经 window.open | 预存不可用，未覆盖 | 中(预存) | 注明限制，可后续补 |
| download_save_blob 错误处理 | 完整正确，契约一致 | — | 采纳 |
| remove_fetch / 死代码 | 清理干净，无死代码 | — | 采纳 |
| download_save_blob 路径穿越 | 预存安全问题 | 中(预存) | 加文件名约束 |
| JS/Rust 双份下载判定 | 易漂移 | 低(预存) | 注释注明需同步 |
| main.rs allow(linker_messages) | 合理但与主题无关 | 低 | 建议独立提交 |

**总体判定**：变更方向（回归原生 DownloadStarting，拿到进度/记录/默认路径）正确，相对 URL 根因修复切实有效，错误处理与契约对齐良好。**合并不阻塞，但建议先处理表单 `target="_blank"` 下载归一化（中）**，并明确 window.open 下载改导航对 inline 响应的丢页取舍（中-高，需文档/验收确认）。