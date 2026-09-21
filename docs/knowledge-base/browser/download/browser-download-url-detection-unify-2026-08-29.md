# 浏览器下载 URL 检测三端统一（query-key 解析）

## 背景

下载 URL 检测（isDownloadUrl / is_download_url）在三个独立实现点存在，逻辑分叉会造成"一个链接在三处表现不一致"：

| 实现点 | 位置 |
|--------|------|
| Rust 后端 | `src-tauri/src/commands/browser_webview_setup.rs` `is_download_url` |
| JS 注入脚本 | `crates/browser/src/init_script.js` `isDownloadUrl` |
| TS 工具函数 | `frontend/src/app/utils/downloadUrl.ts` `isDownloadUrl` |

## 问题与修复

### 1. 扩展名集合漂移

三端各维护一份 `DOWNLOAD_EXTENSIONS` 扩展名集合，曾含 `js`（内联脚本资源不应判为下载）。手工复制 + 注释防漂移，容易漏同步。

**修复**：三端扩展名集合逐项保持一致，统一移除 `js`。

### 2. 检测语义分叉

下载 `download=` 查询参数检测语义三端不一致：

- Rust 用 `query.contains("download=")`（裸子串），可命中值内部的字面 `?download=`
- JS/TS 用正则 `/[?&]download=/`（要求前缀 `?`/`&`），但仍可命中 query **值内部**的字面 `?`（如 `?redirect=https://x?download=1`）

**修复**：三端统一改为 query-param key 解析：

- Rust：`url.query_pairs().any(|(k,_)| k.eq_ignore_ascii_case("download"))`
- JS/TS：遍历 `searchParams` key，`key.toLowerCase() === 'download'`

语义现在是：**`download` 必须是独立 query key（大小写不敏感），而非某值内部的子串**。彻底消除子串歧义。

### 3. query 作用域（fragment 隔离）

检测要基于 query 字符串，而非「完整 URL + 正则通配」，否则 fragment 中的 `#?download=1` 会被误命中。

**修复**：TS/JS 用 `new URL(url).search` / `searchParams`（fragment 不属于 query 作用域），Rust 天然用 `url.query()` / `query_pairs()`。

## 经验教训

1. **三处实现一致性是最难审查的维度**：逐项人工比对才能发现（如 query 值内嵌字面 `?` 导致正则与 key 解析分叉）。建议用「同一组输入在三端跑出相同判定」作为审查门槛，而非只看某一端。
2. **query 检测优先用 key 解析而非子串正则**：`URLSearchParams` / `url::Url::query_pairs()` 是标准且消除歧义的方案，可避免正则回溯与值内嵌字面匹配问题。
3. **跨端同步注释必须描述真实语义**：注释若引用不存在的 API（如 `.has('download')`，它大小写敏感）会误导后续维护者"简化"回错误实现。
4. **已知边界要显式记录**：如 `URLSearchParams` 按 `&` 和 `;` 分隔，而 Rust `form_urlencoded` 仅按 `&` 分隔——`?a=1;download=1` 三端判定分叉（现实影响趋近零）。这类边界在代码注释写明，未来评估是否统一。

## 验证

- TS 单测 `downloadUrl.test.ts`：14 用例（独立 key 大小写、fragment 隔离、值内嵌不命中）
- Rust 单测 `browser_webview_setup.rs`：`is_download_url_detects_query_and_path_signals` 等
- 6 组关键输入三端判定一致：`?download=1` / `?download` / `?DOWNLOAD=1` / `?redirect=..?download=1` / `?a&download=1` / `#?download=1`

关联归档：`docs/root-cause-resolution/2026-08/progress-2026-08-29-230000.md`