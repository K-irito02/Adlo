# 浏览器面板：合规爬虫优化 + "始终新建标签页"按钮

- 日期：2026-08-14
- 状态：已批准
- 范围：浏览器面板（右侧面板）

## 背景

浏览器面板的"获取网站 Logo 与标题"功能会对目标站点发起 HTTP 抓取（`fetch_page_meta_inner`，Tauri 模式；`/__adl_preview_api__/browser/page-meta`，Vite 预览模式）。当前实现伪装 Chrome 120 UA、不检查 robots.txt、无按域名限速，不符合友好合规爬虫语义。

另外，"已打开的标签"（navigator `open` 模式）工具栏的 "+" 按钮（新建标签页）当前受"新建标签/当前标签"切换开关（`browserNavigateInPlace`）影响：就地模式下点击只清空地址栏而非新建标签。需求：该按钮应**始终新建标签页**，不受开关影响。

## 目标

1. 将页面元数据抓取改造为友好合规爬虫：机器人标识 UA、robots.txt 硬门控（Disallow 硬跳过）、按域名限速、本地/私网豁免。
2. 将"已打开的标签"模式下的"新建标签页"按钮改为"始终新建标签页"：新 i18n 文案、新函数名、行为始终新建标签，不受 `browserNavigateInPlace` 影响。

## 非目标（明确不做）

- ETag / 304 条件请求（需持久化 ETag 到三层缓存并处理 304 合并，成本高、收益低）。
- robots.txt `Crawl-delay` 节流执行（仅解析，不执行等待）。本项目为低频按需抓取，域名限速已提供足够保护。

## 设计 1：合规爬虫

### 双端一致性

抓取逻辑存在两套实现，必须保持相同语义（与现有 `USER_AGENT` 双端镜像模式一致）：

| 端 | 位置 |
|----|------|
| Tauri | `src-tauri/src/commands/browser.rs` `fetch_page_meta_inner`（reqwest 客户端） |
| Vite 预览 | `frontend/vite.config.ts` `/__adl_preview_api__/browser/page-meta` 中间件 |

### 组件

| 组件 | 说明 |
|------|------|
| 机器人 UA 常量 | `AIDigitalLife/1.0 (+{本项目仓库 URL}; MetaFetcher)`，实现时填入项目公开仓库 URL。双端同步：Rust `USER_AGENT` 常量 + `frontend/src/shared/userAgent.ts` |
| robots.txt 解析器 | Rust：`crates/browser/src/robots_txt.rs` 纯函数模块；Vite 端：`frontend/dev/` 下对应纯函数模块。解析 `User-agent` / `Allow` / `Disallow`，按 RFC 9309 最具体匹配（先精确 token，后 `*`） |
| robots 缓存 | 按域名内存缓存 + TTL（1 小时），避免每 URL 重复拉取 robots.txt |
| 域名限速器 | 每域名滑动窗口（5s/次），超限返回空结果走兜底 |
| 豁免规则 | `localhost` / `127.x` / `192.168.x` 及私有 IP 跳过 robots 检查与限速 |

### 抓取流程（`fetch_page_meta_inner` 新逻辑）

```
非私网 URL?
  ├─ 否 → 直接抓取（现状流程）
  └─ 是 → 查 robots（缓存）→ Disallow? → 返回空 PageMeta（标题/图标留空，前端走 Google S2 兜底）
            → Allow? → 域名限速通过? → 抓 HTML → 提取标题/favicon
            → favicon 下载前再查 robots（对 favicon URL 门控）
```

- robots.txt 拉取失败（网络错误/超时/非 2xx）按 **Allow** 处理（fail-open），不阻塞抓取；仅当明确读取到 Disallow 才硬跳过。此决策保证合规性优先但不因站点故障而功能不可用。
- 私网判定失败（无法解析 URL）按私网处理：直接抓取，不阻塞本地开发。
- Disallow 时返回的 `PageMeta` 标题与 favicon 均为空字符串，`url` 保留。调用方按现有逻辑走缓存/兜底，不新增错误路径。
- 双端语义一致：Vite 中间件 `/browser/page-meta` 按同一流程执行（含 fail-open 决策与私网豁免）。

### 保持不变

- 10s 超时、64KB HTML 截断、64KB favicon 上限、`image/*` Content-Type 校验
- 3 秒/URL 全局去重（`FETCH_DEDUP_WINDOW_MS`）
- 三层 site meta 缓存（Rust SQLite `site_meta_cache.rs` / preview JSON `.adl-cache/` / 前端 `siteMetaCache.ts`）
- 前端 Google S2 favicon 兜底

### 测试

- 双端各自单元测试覆盖：
  - robots.txt 解析（精确 token 优先于 `*`、Allow/Disallow 优先级、注释与空行、大小写）
  - 私网豁免（localhost / 127.x / 192.168.x / 解析失败）
  - 域名限速（同域连续请求被拦，异域不受影响）
  - Disallow 硬跳过返回空 PageMeta
  - robots 拉取失败 fail-open（网络错误时仍抓取）
  - 原有用例（title/favicon 提取）不回归

## 设计 2："始终新建标签页"按钮

### 现状

`BrowserNavigator.tsx:190-218`：`navigatorMode === 'open'`（已打开的标签）时，工具栏 "+" 按钮：

- 就地模式（`browserNavigateInPlace=true`）→ `handlePlusClick()`（清空地址栏就地编辑）
- 新标签模式 → `browserOpenTab()`（新建标签页）

tooltip 使用 `t.browserNewTabBtn`（"新建标签页"）。

### 目标行为

在"已打开的标签"模式下，该按钮**始终新建标签页**，完全不受 `browserNavigateInPlace` 影响。

### 改动点

| 位置 | 改动 |
|------|------|
| `BrowserNavigator.tsx:209-213` | 移除 `else if (browserNavigateInPlace) { handlePlusClick() }` 分支，`else` 直接调用新建标签逻辑 |
| `BrowserNavigator.tsx:187` | tooltip 改用新 i18n key `t.browserNewTabAlways` |
| `useBrowserPanelActions` / `useBrowserPanelHandlers` | 新增 `handleAlwaysNewTab`，封装 `browserOpenTab(undefined, ...)`，替换原内联逻辑。命名与 `handleOpenTabFromTree`（受开关影响）语义区分 |
| i18n | `en-US/browser.ts` + `zh-CN/browser.ts` 新增 `browserNewTabAlways`：中文 `始终新建标签页`，英文 `Always new tab` |

### 范围确认

- 仅影响"已打开的标签"（`open` 模式）下的 "+" 按钮。
- `tabs`（目录）模式、`list` / `search` 模式、网址输入框 "+" 按钮均不变。
- `BrowserToolbar.tsx` 网址输入框 "+" 按钮保持受 `browserNavigateInPlace` 影响（用户明确保留）。

### 测试

- 新增/更新单测：`open` 模式下点击该按钮总是调用新建标签（不受 `browserNavigateInPlace` 影响）。
- 既有 `BrowserNavModeSwitch` 相关测试不回归。
