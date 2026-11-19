# 网站图标自愈：标题-only 条目、双端 warmup 口径与惯例兜底

**日期**: 2026-11-19
**来源**: 用户报告（关于页点 GitHub/Gitee/问题反馈后标签页只显示首字母图标；快捷站点同样）+ 根因排查
**关联**: `docs/root-cause-to-close/2026-11/progress-2026-11-19-163622.md`、[ADR-0021](../../../adr/0021-site-meta-failure-tombstone-and-alias-backfill.md)、[ADR-0020](../../../adr/0020-site-icon-mirror-and-bookmark-snapshot.md)

## 问题

dev Tauri 桌面端：点击「关于」页的 GitHub / Gitee / 问题反馈，打开的标签页图标是兜底首字母；
右键「刷新网站图标与标题」后才出现真实图标。「添加快捷站点」保存后同样只有通用首字母图标，
只有「新建书签」能拿到真实图标。

## 根因（四层叠加）

1. **桌面端 live 上报常只带标题**：三条来源里 `DocumentTitleChanged`（Method 3）几乎必到，
   `FaviconChanged`（Method 4）与注入脚本 `postMessage`（Method 1）经常缺失 → 缓存先落一条
   「标题-only」条目（`favicon_url=''`、`last_ok_at>0`）。
2. **`silent_cache_hit` 把「有标题」当有效命中**（`src-tauri/src/commands/browser.rs`）：
   `warmup` 与 `browser_page_meta_get` 据此跳过静默抓取 → 标题-only 条目**再也不会补图标**。
   唯一出口是 force 的 `browser_page_meta_refresh`，即用户手动「刷新网站图标与标题」。
3. **双端口径不一致**：预览端 `warmup` 的条件是 `!entry || now >= entry.nextRetryAt`，
   标题-only 条目（`nextRetryAt=0`）会重抓；桌面端被第 2 条短路。这正是「只有 dev Tauri 出现」的原因。
4. **打开入口不请求元数据**：`openUrlByMethod → browserOpenTab` 不发任何元数据请求；
   快捷站点 `browserAddShortcut({name,url})` 不写 icon，`ShortcutCard` 直接渲染 `name[0]`，
   完全不接站点元数据管线。

实测用户库（`%APPDATA%\com.adlo.app.slot-2\site-meta-cache.db`）：72 条中 **23 条**有标题、
favicon 为空、`last_ok_at>0`、`fail_count=0`（douyin / mongodb 文档 / Microsoft account /
openrouter / liepin…）；关于页两个仓库 URL 在库中**无条目**。

## 修复

| 层 | 改动 |
| --- | --- |
| Rust `warmup` | 新增 `warmup_target_allowed`：标题-only 也补抓（与预览端「不把有标题当有效命中」一致），单次启动预算 40 条 + 每 URL 10 分钟冷却；删除 `silent_fetch_suppressed` |
| Rust `browser_page_meta_get` | 命中「无任何图标」缓存时即时返回 + 后台 `spawn_meta_refetch`（静默补抓 + 广播，同冷却；冷却键用 `normalize_cache_key`，与 warmup 共用一条记录） |
| Rust `fetch_silent_meta` | 静默渲染一个图标都没拿到时回退 `{origin}/favicon.ico`（`spawn_convention_favicon`）：魔数嗅探拒非图片、60s per-origin 冷却；`report` 后校验 `favicon_url` 仍是惯例 URL 才回填 data-URI（与 `spawn_favicon_download` 的陈旧守卫同口径） |
| 前端 `faviconSelfHeal` | 新增 `ensureSiteFavicon(url, {force})`：已有可显示图标跳过、常规 10 分钟节流、`force` 独立 60s 冷却、并发 2 + 队列；走 `pageMetaClient.refresh`（与手动刷新同链路） |
| `BrowserFavicon` | `pending='spinner'`（标签页）在「已结算无图标」或「外部图标重试耗尽」时自动补抓；失败事实与所属 URL 成对提交（换页不继承）；被动列表（`initial`）不逐行抓取 |
| `ShortcutCard` | 改用 `BrowserFavicon`（initial + 名称首字母兜底），挂载即补抓；CSS 适配 32px 圆形槽 |

## 验证

- 浏览器预览：新增快捷站点 `https://developer.mozilla.org/zh-CN/`，保存后先显示首字母 `M`，
  随后**未点击任何刷新**自动变成真实图标（data-URI）；预览镜像新增该 URL 的 `faviconUrl + dataUri`。
- dev Tauri（同一数据库）：启动预热对 4 条标题-only URL 建静默 WebView 重抓；
  `spawn_convention_favicon: convention icon persisted`（douyin → `/favicon.ico`，data-URI 5753）；
  标题-only 条目 23 → 21（剩余为登录墙 / 404 / 区域限制页）。
- 回归保护：`faviconSelfHeal.test.ts`（跳过已有图标 / force 独立冷却 / 节流 / 并发 2 / 非 http）、
  `BrowserFavicon.test.tsx`（spinner 自愈、initial 不自愈、force 路径、跨 URL 不继承耗尽）、
  `ShortcutCard.test.tsx`（镜像 data-URI → 真实图标；空镜像 → 名称首字母 + 请求补抓）；
  Rust 单测覆盖 `warmup_target_allowed`、冷却键归一化、`url_origin`。全部做过「删掉修复即变红」推演。

## 经验教训

1. **「有标题」不等于「已结算」**：缓存命中判定必须把标题与图标分开看；只要图标维度可以缺失，
   就要有补抓路径，否则该站点会永久停在兜底图标（同类问题在 2026-08-22 已出现过一次）。
2. **双端必须逐条对齐语义而不是对齐「看起来一致」**：预览端的 TTL 重抓与桌面端的「无图标补抓」
   只共享一半口径，注释里要写清未对齐的部分，避免下一轮被当成漏修。
3. **组件级自愈要限制在活跃宿主**：标签页/快捷站点可以逐项补抓；历史/书签这类可能有数百行的被动列表
   交给启动 `warmup` 批量补齐，避免一次性建出大量隐藏 WebView2。
4. **后台写入必须带「事实归属」**：失败事实（空图标、重试耗尽）与 URL 成对提交，换页的同一提交里
   旧页事实不得触发新页的补抓。
5. **惯例兜底要与预览端同语义**：静默渲染拿不到图标时回退 `{origin}/favicon.ico`，
   内容按魔数嗅探校验，404/HTML 错误页静默跳过。

## 涉及文件

| 文件 | 变更 |
|------|------|
| `src-tauri/src/commands/browser.rs` | `warmup_target_allowed` / `favicon_less_refetch_key` / `spawn_meta_refetch` / `spawn_convention_favicon` / `url_origin` / `has_favicon` |
| `frontend/src/app/features/browser/faviconSelfHeal.ts` | `ensureSiteFavicon`（常规/force 两套节流 + 并发队列） |
| `frontend/src/app/components/BrowserFavicon.tsx` | spinner 宿主自愈 effect、URL 归属成对状态、`fallbackText` |
| `frontend/src/app/features/browser/browser-landing/ShortcutCard.tsx` + CSS | 复用共享 favicon 组件与补抓 |
| `adlo/scripts/check-rust-changed.mjs` | `testArgs` → `testCommands`（bin-only 外壳跑 `--bins`） |
