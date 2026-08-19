# 进度 — 2026-08-18 10:45（书签页面信息 4 问题）

## [ ] 事项 1：B 站书签标题为"验证码_哔哩哔哩"
- 状态：进行中
- 根因：HTTP 爬虫被 B 站反爬下发了验证码页，`<title>` 为"验证码_哔哩哔哩"，被提取后写入缓存成为权威标题。
- 修复：`write_success` 对反爬/验证码标题（is_unsafe_title）做门控清空；`should_apply_exact_match_title` 拒绝写入 unsafe 标题。
- 验证：待用户重测

## [ ] 事项 2：抖音书签标题为空
- 状态：进行中
- 根因：抖音为 JS/SPA 站，裸 HTTP 抓不到标题 → meta 缓存为空；收藏节点快照为占位宿主名（douyin.com），`resolveDisplayTitle` 返回空 metaTitle 覆盖占位 → 显示为空。
- 修复：`resolveDisplayTitle` 当 metaTitle 为空/占位时回退快照占位宿主名，绝不显示空。
- 验证：待用户重测

## [ ] 事项 3：xiaogans.online 显示 Vite 框架图标
- 状态：进行中
- 根因：站点根页声明 `/vite.svg`，favicon_score 给 svg 高分（200）被选中；质量门控 svg=10 又高于真实图标，错误锁定。历史曾获取到真实 favicon，因某次抓到 vite.svg 后被锁定。
- 修复：新增 `is_framework_default_favicon`（vite.svg/next.svg/vercel.svg 等），`extract_favicon` 命中时返回 None 走 origin favicon.ico 兜底；质量门控降低其分数。
- 验证：待用户重测

## [ ] 事项 4：点击"仅保存"后"正在获取页面信息…"很慢
- 状态：进行中
- 根因：save-only 在 `handleCreateTabConfirm` 同步 await `pageMetaClient.get`，后台串行拉 robots.txt + 页面 + favicon data-uri，整体无上界。
- 修复：前端 cache-first（peek）+ 网络拉取上限超时（Promise.race, META_FETCH_TIMEOUT_MS=6000）+ 后台继续拉取；后端补全耗时日志定位瓶颈。
- 验证：待用户重测

## 2026-08-18 会话复核（代码已就绪，编译/测试/lint 全部通过）

复核确认四项修复代码均已落地，并补齐调试日志：

- **事项 1（B 站验证码标题）**：`meta_merge::is_unsafe_title` + `page_meta_service::write_success` 清空验证码标题；`should_apply_exact_match_title`/`report` 拒绝写入。Rust 测试 `get_unsafe_title_clears_cached_captcha`、`report_captcha_title_is_rejected` 覆盖。
- **事项 2（抖音空标题）**：`resolveDisplayTitle` 空 metaTitle 回退快照占位（宿主名），前端测试 `browserDisplayUtils.test.ts` 新增用例覆盖。
- **事项 3（xiaogans Vite 图标）**：`is_framework_default_favicon` 识别 vite.svg/next.svg 等占位图标，`html_meta::extract_favicon` 命中返回 None 走 `{origin}/favicon.ico` 兜底；质量分压到 3。Rust 测试 `extract_favicon_skips_framework_default`、`framework_default_favicon_scored_low` 覆盖。
- **事项 4（仅保存慢）**：`useBrowserDialogs` cache-first + 6s 上限超时 + 宿主名占位回退；后端 `fetch_page_meta_inner` 分阶段耗时日志（robots_ms / page_ms / parse_ms / total_ms）。

**本次会话修复（复核时发现并修正）：**
1. `useBrowserDialogs.ts` L101 引用了不存在类型 `PageMetaLike`（TS 编译错误）→ 移除泛型参数，交由 `pageMetaClient.get` 类型推断。
2. `meta_merge.rs` L106 `file == f`（String vs &&str）Rust 编译错误 → 改为 `file == *f`；并顺带按 clippy 建议 `splitn(2)…nth(1)` → `split_once`。
3. `page_meta_service.rs` 测试 `report_captcha_title_is_rejected` 断言过时（report 被拒时本不该新增内存条目）→ 改为 `peek().is_none()`。
4. rustfmt 格式化 + 前端 prettier/curly 自动修复。

**自动验证结果：**
- 前端：`tsc --noEmit` 通过；`browserDisplayUtils.test.ts` 24/24 通过；eslint 0 error 0 warning。
- 后端：`cargo test -p adl-browser` 94/94 通过；`cargo clippy -p adl-browser --all-targets -- -D warnings` 通过；`cargo fmt` 通过。
- 待用户实机重测后，将上述四项标记 `已完成`。