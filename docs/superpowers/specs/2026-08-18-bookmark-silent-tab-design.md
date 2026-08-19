# 书签 favicon/标题获取 —— 静默标签页改造设计

> 日期：2026-08-18
> 目标：将本项目 favicon/标题获取改为对齐 Chrome/Edge（Chromium）设计 —— 数据永远来自真实渲染的页面，弃用独立 HTTP 爬虫作为主路径。

---

## 背景与目标

当前项目在 Tauri 桌面端获取网站 favicon 与标题，存在多套方案（WebView2 postMessage、DocumentTitleChanged/FaviconChanged 原生事件、HTTP 爬虫、iframe 上报、Google S2）。
其中 **HTTP 爬虫** 作为 save-only 新建书签的主路径，带来了用户观察到的 4 个问题：

1. B 站标题显示"验证码_哔哩哔哩"（反爬导致的假标题）
2. 抖音标题为空（SPA 服务端空 title）
3. xiaogans.online favicon 显示 Vite 框架占位图标
4. "正在获取页面信息…"慢（爬虫同步等待，最长 10s+ 超时）

Chrome/Edge（Chromium）从不使用独立 HTTP 爬虫抓 title/favicon，而是：
- 标题 = 渲染进程推送的 `document.title`
- favicon = 渲染页面 `<link rel="icon">` 候选 + 尺寸评分 + `/favicon.ico` 兜底 + 本地持久化缓存
- 书签保存直接用"当前 tab 的真实数据"，零额外请求

**本设计目标**：桌面端对齐 Chromium，用真实 WebView2 渲染的**后台静默标签页**作为唯一获取 favicon/标题的途径；HTTP 爬虫等回退型方案**先禁用（保留代码）**，验证通过后删除。

---

## 第 1 节：架构总览

### 核心链路（桌面端，save-only 新建书签）

```
用户输入 URL 点"仅保存"
   │
   ▼
[1] 命中缓存？  ──是──> 直接用缓存 title/favicon（零 WebView）
   │ 否
   ▼
[2] 该 URL 当前有正渲染的 tab？  ──是──> 直接用该 tab 已有 title/favicon（零新建）
   │ 否
   ▼
[3] 后台静默建临时 tab → 导航 URL → 等 DocumentTitleChanged + FaviconChanged
   │          （上限 5~6s，超时用已得部分）
   ▼
[4] 写缓存 → 广播前端 → 销毁临时 tab（释放资源）
```

### 三层防护（对应 Chromium 三支柱）

| 层 | Chromium 对应 | 本项目实现 |
|----|--------------|-----------|
| 缓存优先 | Favicon Cache / F-Cache（本地持久化，TTL） | 已有 `site_meta_cache`（SQLite）+ `page_meta_service.peek`，**保留** |
| 真实渲染主路径 | 数据总来自渲染页 | **新增**后台静默标签页（复用 postMessage/DocumentTitleChanged/FaviconChanged） |
| 占位兜底 | 空标题显 hostname / 无图标显默认 | `is_placeholder_title`/`is_unsafe_title`/`is_framework_default_favicon`，**保留**作为展示层兜底 |

### 禁用范围（本次）

- **禁用**（入口开关，保留代码）：
  - HTTP 爬虫 `fetch_page_meta_inner` / `AppFetcher::fetch`
  - `google` 来源 S2 图标
  - 前端 save-only 的"先等爬虫"计时逻辑（`META_FETCH_TIMEOUT_MS` 等待）
- **保留**：三层缓存、真实渲染事件链（postMessage/DocumentTitleChanged/FaviconChanged）、质量分、占位标题/反爬标题等展示层启发式。

---

## 第 2 节：后端"后台静默标签页"抓取机制

### 目标

提供一个实现 `PageMetaFetcher` 的 `SilentTabFetcher`：后台静默新建 WebView2 标签页导航到目标 URL，等待渲染事件拿标题+图标后写缓存，销毁标签页释放资源。

### 生命周期

```
创建隐藏 WebView (create_for_tab + 不 show)
   → navigate(url)
   → 挂接回调：DocumentTitleChanged（标题）、FaviconChanged（图标）
   → 判定完成：
       标题已拿 + 图标已拿 → 完成
       或 超时(5~6s)     → 用已得部分完成
   → 结果写入 page_meta_service 缓存（复用 report/write_success）
   → 销毁临时 tab（destroy_tab 释放资源）
```

### 完成判定（双通道）

| 事件 | 提供数据 | 触发时机 |
|------|---------|---------|
| `DocumentTitleChanged` | `title` | 页面 `<title>` 变化 |
| `FaviconChanged` | `favicon` | 页面 `<link rel="icon">` 变化 |

- 完成 = 拿到真实 title + favicon_url（`is_placeholder_title`/`is_unsafe_title` 过滤后仍非空）或到达 5~6s 超时。
- favicon 仅有 URL 无 data-URI 时，可复用现有下载逻辑转 data-URI；或暂存 URL，前端 `BrowserFavicon` 按 `<img>` 直接加载 URL。

### 静默渲染的复用与隔离

- **复用** `BrowserManager::create_for_tab` + `navigate_tab` + `destroy_tab`、`BrowserPool`（LRU 淘汰）。
- **隔离**：静默 tab 用独立、不展示的 WebView（不 `show()`，或 `opacity:0` / bounds 0 尺寸），保证用户无感知、零闪烁。
- **避坑**：静默 tab 不得进入用户可见导航 tab 池（避免顶替用户 tab）。用独立静默容器管理，或复用池但标记 `silent` 不参与用户 LRU 展示。

### 线程模型

- `SilentTabFetcher::fetch(url)` 返回 await future；真实渲染发生在 WebView2 UI 线程/事件回调。
- 用一对一等待通道：`fetch` 发起导航后 `await` 一个 `Notify`/`mpsc`，由 `DocumentTitleChanged/FaviconChanged` 回调在完成时触发；超时用 `tokio::time::timeout`。

### 并发与资源上限

- 并发静默 tab 数量设上限（如同时最多 2~3 个），避免批量建书签时创建过多 WebView。参考现有 `warmup(&urls, &AppFetcher, 8)`。

### 错误与边界

- 导航失败/超时：返回空 meta 或已得部分；写缓存前 `is_unsafe_title`/`is_placeholder_title` 过滤，防止写"验证码_哔哩哔哩"或"douyin.com"占位为权威。
- WebView 创建失败：降级为宿主名占位（不做爬虫，遵循全禁）。
- 销毁失败：残留 WebView 由 `BrowserPool` LRU + 现有 cleanup 兜底回收。

---

## 第 3 节：前端改动与双端一致性

### save-only 分支三步走

```
[1] pageMetaClient.peek(url)          命中缓存 → 直接用（零网络）
[2] 检查当前是否有渲染该 URL 的 tab   有 → 直接用该 tab 已有 title/favicon
[3] 否则 pageMetaClient.getSilent(url)  触发后台静默 tab 补齐（等标题+图标或超时）
```

保留 `isUnsafeTitle`/`isPlaceholderTitle` 过滤、宿主名占位回退、后台无感刷新。

### 新增前端 IPC 通道

| 命令 | 作用 | 备注 |
|------|------|------|
| `browser_page_meta_get` | 改为：优先缓存 → 渲染 tab → 静默 tab；不再走爬虫（开关禁用） | 复用现有签名，避免改 IPC 契约 |
| `page_meta_updated` 事件 | 静默 tab 写缓存后广播，前端 `siteMetaCache` 实时刷新 | 现有链路，零新增 |

> 遵守"禁用先不删"：`AppFetcher` HTTP 爬虫代码保留，仅在入口加开关。`get` 语义不变。

### 双端一致性

| 端 | 行为 |
|----|------|
| Tauri 桌面 | 走真实渲染静默 tab（本次主路径） |
| 浏览器预览 | 本次不改（保留现状，预览 meta 服务仍可用），因预览模式无 WebView 无法静默渲染 |

- 桌面端：`browser_page_meta_get`（后端）→ 静默 tab
- 预览端：调用 preview-bridge 独立实现，不经过 Rust 后端，天然隔离

### 前端留存物

- **删除**前端自身 6s 计时（`META_FETCH_TIMEOUT_MS` 等待），超时交给后端静默 tab，职责单一、避免双超时竞态。
- **保留** `[bookmark-new-meta]` 调试日志便于测试排查。

---

## 第 4 节：禁用开关、回退策略与测试计划

### 禁用开关落点

| 开关 | 位置 | 作用 |
|------|------|------|
| `SILENT_FETCH_ENABLED`（桌面端） | Rust `commands/browser.rs` | `true` → 走静默 tab；`false` → 走原爬虫 |

实际二合一：`browser_page_meta_get` 判断开关，`true` 走静默 tab、`false` 走爬虫。删除时移除静默分支切换与爬虫 `fetch` 调用即可恢复干净。

### 回退策略

| 场景 | 回退 |
|------|------|
| 静默 tab 创建/导航失败 | 缓存（若有）否则宿主名占位 + 后台无感刷新 |
| 静默 tab 5~6s 超时 | 用已得 title/favicon；均无 → 宿主名占位 |
| 拿到验证码/占位标题 | `is_unsafe_title`/`is_placeholder_title` 过滤 → 不写权威缓存 |
| WebView 资源不足（并发上限） | 排队或宿主名占位，不外溢 |

所有回退不阻塞"仅保存"，书签始终能创建成功；标题/图标随后由无感刷新补齐。

### 测试计划

**自动测试**

| 层面 | 测试 |
|------|------|
| Rust `adl-browser` | `SilentTabFetcher` 完成判定（标题+图标齐→完成；单标题→等待后完成；超时→已得部分）；`is_unsafe_title`/`is_placeholder_title` 在 write 前生效 |
| Rust 命令层 | 开关回退：`SILENT_FETCH_ENABLED=false` 仍走爬虫/空 meta |
| 前端单元 | `getSilent` 逻辑、save-only 三步走、调试日志 |

> WebView2 真实渲染无法在 CI 单测自动化，端到端靠手动验证。

**手动验证（用户执行）**

1. 新建未访问过的站书签（B 站）→ 标题为真实标题非"验证码"；favicon 为 B 站图标。
2. 新建 `xiaogans.online` → favicon 为该站真实图标，非 Vite 占位。
3. 新建抖音 → 标题为真实标题或宿主名，非空。
4. 新建已缓存/已打开过的站 → 立即返回（零 WebView）。
5. 观察"正在获取页面信息…"耗时 ≤ ~5~6s，超时后书签仍保存成功。
6. 桌面端日志（`debug-logs.txt`）可见静默 tab 创建→完成→销毁时间戳。

**验收一致判定**：4 项与你报告的 4 个 bug 逐一对应，全部符合即测试通过，随后删除开关与爬虫冗余。

---

## 涉及改动文件清单

- `crates/browser/src/silent_tab_fetcher.rs`（新增）：`SilentTabFetcher` + 完成判定 + 独立静默容器
- `crates/browser/src/lib.rs`：导出 `SilentTabFetcher`
- `crates/browser/src/page_meta_service.rs`：接入 `getSilent`/静默 fetch 通道（若需）
- `src-tauri/src/commands/browser.rs`：`browser_page_meta_get` 加开关 + 静默分支；`fetch_page_meta_inner` 入口禁用
- `frontend/.../useBrowserDialogs.ts`：save-only 三步走 + `getSilent`
- `frontend/.../pageMetaClient.ts`：新增 `getSilent`（三桥对齐）
- 前端 debug 日志保留