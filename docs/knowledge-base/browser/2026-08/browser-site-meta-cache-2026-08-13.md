# 浏览器面板网站元数据持久化缓存（favicon data-URI + 标题）

**日期**：2026-08-13
**范围**：为浏览器面板的标签/书签/历史项引入持久化 favicon 图片本体（base64 data-URI）+ 标题缓存，重开应用零网络秒开。

## 背景

原实现仅缓存 favicon 的 **URL 字符串**（`fetchPageMeta.ts` 的 `faviconUrlCache`），重开后 `<img>` 仍需向远端重新下载图片，出现"有时有延迟"。标题缓存为内存态，重启即丢。

## 解决方案：三层架构

```
渲染层（前端）  BrowserFavicon → getFaviconUrl(url) → 内存 Map<url, dataURI> → data:image/...（零网络）
持久化层        SiteMetaBackend（getAll/upsert/remove/clear）
                 ├─ Tauri:  crates/browser/src/site_meta_cache.rs（SQLite, WAL, 行级写）
                 ├─ 浏览器: previewWorkspaceService/siteMetaCache.ts（JSON 文件 .adl-cache/）
                 └─ Mock:   siteMetaBackends/mock.ts（内存）
```

**关键机制**：
- 启动一次批量预载 + 预载门控（`isSiteMetaCacheReady` false 时图标区空占位，不显示回退图标，杜绝闪烁）
- 成功才写缓存（`setCachedSiteMeta`），抓取失败返回空 → 缓存不动
- 引用计数删除（`removeSiteMetaIfUnreferenced`：检查 tabs/bookmarks/workspaceBookmarks/folders/history 全部引用源）
- 无条数上限，仅限单条尺寸（favicon data-URI ≤ 64KB 原始字节 ≈ 87KB base64、title ≤ 200 字符）
- 抓取函数同时下载 favicon 字节 → base64 data-URI（Tauri 与 preview 双端）

## 经验教训

### 1. 三端后端语义必须一致（本次踩坑：preview PUT 覆写导致数据丢失）

`SiteMetaBackend.upsert` 的语义在 Tauri（`INSERT OR REPLACE`）、Mock（`store.set`）端是**合并**，但 preview 服务初版 PUT 直接 `writeSiteMetaCache(baseDir, b.entries)` **整文件覆写**。前端 `flushPersist` 只发送增量，导致首次 flush 后跨会话缓存被抹掉。

> **规则**：多端实现同一接口时，端与端的语义差异（合并 vs 覆写、异常 vs 静默）必须在设计阶段显式对齐。本例属"同接口不同行为"类缺陷，单端测试无法发现，需跨端契约审查。

### 2. 质量门控的输入语义会随 getter 返回值变化而静默失效

`shouldReplaceFavicon(existingFavicon, meta.favicon)` 用 `getFaviconQualityScore` 给图标 URL 打分。原 `getCachedFavicon` 返回缓存 **URL**，重构后返回 **data-URI** —— data-URI 字符串匹配不到任何 `.ico/.png/.svg` 后缀，落回默认分 3。结果任意分数 ≥3 的 URL 都能覆盖已缓存的高质量 favicon，门控静默失效。

> **规则**：当 getter 的返回类型从"URL"变为"data-URI"时，消费方对返回值的假设（它曾是 URL）必须同步检查。此类"输入语义漂移"是重构后门控/校验静默失效的常见根因。修复：`existing.startsWith('data:')` 早返回保留，并将基线提取为共享 helper `existingFaviconBaseline`。

### 3. 失败路径不能"伪造成功值"进入缓存

Rust `fetch_page_meta_inner` 的 HTTP 错误分支初版返回 `favicon: google_favicon_url(url)`（真值 Google URL）。前端 `handlePageMeta` 的 `if (!meta.title && !meta.favicon) return` 因 Google URL 为真值而放行 → **失败的抓取把 Google 回退写进了缓存**，违反"失败保留旧缓存"。

> **规则**：抓取失败必须返回**全空**（或显式失败标志），不能塞入一个"看起来有效"的回退值。回退应由渲染层（`getFaviconUrl`）在命中缓存之外决定，而非由抓取层混入缓存写入路径。

### 4. 无上限缓存 + base64 图片 → 内存/磁盘可预测性

无条数上限 + 每条约 87KB base64 时，`browser_site_meta_get_all` 全表 IPC 载荷与内存随条目线性增长（已接受为架构取舍）。缓解：单条尺寸上限 + `flushPersist` 序列化（promise 链）保证删除/更新的后端写序，避免 remove 后 stale upsert 复活键。

## 相关文件

- 架构：`docs/architecture/features/builtin-browser.md`
- Spec：`docs/superpowers/specs/2026-08-12-browser-site-meta-cache-design.md`
- 计划：`docs/superpowers/plans/2026-08-12-browser-site-meta-cache.md`
- 核心模块：`frontend/src/app/utils/siteMetaCache.ts`、`crates/browser/src/site_meta_cache.rs`
