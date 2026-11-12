# 启动预热（page-meta warmup）重复静默抓取：失败零缓存 + 重定向键分叉

**日期**：2026-11-12
**环境**：Tauri 桌面端（slot-1 dev 实例，`com.adlo.app.slot-1` 数据目录）

**术语**：启动预热 / 失败墓碑 / 重定向分叉 / 静默抓取见 [GLOSSARY.md](../../../../GLOSSARY.md)（浏览器域）；决策记录见 [ADR-0021](../../../adr/0021-site-meta-failure-tombstone-and-alias-backfill.md)。

## 症状

每次启动 dev Tauri，`terminal-logs.txt` 都重复几十段 INFO/DEBUG：
`browser webview created for tab tab_id="silent_…"`、`[ADL-META] create_silent_webview: created OK`、
`webview2_audio::imp: audio handlers registered`、`fetch_silent_meta: FINAL returned meta`（全 0）、
对应 `apply_theme` / `set_profile_color_scheme` 等十余行。静默 WebView2 为每个书签/历史/标签页 URL 重建一次。

## 根因（两个结构分叉，缺一补一即复发）

1. **失败路径零缓存**：静默抓取全空（超时/登录墙/反爬，如 mail.google.com 6s 超时全 0、aistudio、openai、
   scholar、wetools.com）时，Rust 路径 `fetch_silent_meta` 不写任何缓存条目、`fail_count`/`next_retry_at`
   列为死字段 → 每次启动必 miss 必重抓。预览端虽有 `markFailure` 指数退避，但失败墓碑仅存会话内存，重启同样复发。
2. **重定向键分叉**：`poll_silent_meta` 里 `svc.report(&u, …)` 的 `u` 是 WebView2 上报的（跳转后）URL，
   `report` 条目键落在跳转 URL；而 `browser_page_meta_warmup` / `browser_page_meta_get` 只按**请求 URL** 的
   归一化键 `peek`（无双键探测）→ 所有会重定向的书签（QQ 邮箱、opencode.ai、mimo、minimax、kimi、
   siliconflow、openrouter.ai 等）永远 miss，每次启动必重抓。双端一致性对照：预览端 HTTP 爬虫直接跟随
   重定向、条目键就是请求键，无此问题。
3. 次要：`preload()` 在 setup 里 fire-and-forget，warmup 理论上可能早于预载 peek 到空内存（实测赶在抓取前完成）。

## 修复（双端对齐；fail-closed 为先）

- Rust `PageMetaService::note_failure`：失败落「失败墓碑」条目（fail_count+1、`next_retry_at` 指数退避
  `min(5min×2^min(n,5), 2h)`、保留既有 title/favicon、**持久化 store，跨重启生效**）；全程持 memory 锁。
- 命令层 `backfill_request_meta(req_url, meta)`：抓取结束后——非空 meta 按**请求键** `report`（复用占位/质量/
  data-URI 门控）；全空落 `note_failure` 失败墓碑。重定向站点从此在请求键 peek 命中。
- `browser_page_meta_get`：退避中的失败墓碑（last_ok_at==0 && now<next_retry_at）直接返回空 PageMeta，不创建
  WebView、不 emit（避免空 meta 广播清空前端镜像；RC3 合并守卫兜底）。
- `browser_page_meta_warmup`：入口显式 `svc.preload().await`（幂等，get_all + or_insert），消除竞态；
  过滤改为统一的 `silent_fetch_suppressed = silent_cache_hit || silent_backoff_active`。
- 预览端 `pageMetaService.ts markFailure` 增加 `schedulePersist`：失败墓碑持久化，与 Rust 同构；双端行为一致。

## 验证（第二次重启稳态）

- 第一次重启后缺失的别名条目/失败墓碑逐条落盘（`site-meta-cache.db-wal` 约 4MB 新写入）；
- 第二次启动 `terminal-logs.txt`：`browser_page_meta_warmup: targets selected targets=0`，
  `create_silent_webview` 0 次，无 ERROR。

## 一般性教训

- **缓存设计的三问**：① 谁写？② 谁读？③ 失败写了吗？——只看「成功路径有没有缓存」会漏掉「失败没有记录」，
  失败率与重试频率在重启场景被无限放大。schema 里的 `fail_count`/`next_retry_at` 从不使用就是「设计了
  但没接上」的典型。
- **静默后台路径的 URL 身份**：WebView2 上报键（跳转后 URL）与请求键分叉时，写入方、读取方必须约定同键
  （此处 chosen: 双写——poll 写上报键 + fetch 结束按请求键 `report` 别名）。任何「peek 只读一键」的调用方
  都是潜在永久 miss。
- **dev 实例分实例化**：slot-N 的 `com.adlo.app.slot-N` 数据目录独立，跨重启的「秒开复发」只有打开自己的
  `.adl-logs` 才能发现；`worktree:env` 的 instance/slot 输出应作为「启动后看哪个日志」的依据。
