# 浏览器面板：合规爬虫 + "始终新建标签页"按钮 + Tooltip 优化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将浏览器面板"获取网站 Logo 与标题"的 HTTP 抓取改造为友好合规爬虫（机器人 UA、robots.txt 硬门控、按域名限速、本地/私网豁免），将"已打开的标签"模式下 "+ "按钮改为"始终新建标签页"，并将两处 Tooltip 改为原生 `title` 且放宽 Tooltip 规则绑定。

**Architecture:** 双端镜像实现爬虫合规逻辑（Tauri `src-tauri/src/commands/browser.rs` 与 Vite 预览 `frontend/vite.config.ts`），纯逻辑抽到可单测模块：Rust 端 `crates/browser/src/robots_txt.rs` + `robots_policy.rs`，前端端 `frontend/dev/crawlerRobots.ts` + `crawlerPolicy.ts`。UI 侧在 `BrowserNavigator.tsx` / `BrowserToolbar.tsx` / `BrowserNavModeSwitch.tsx` 做小步改动，i18n 键随文案一并维护。

**Tech Stack:** Rust（reqwest / url / serde / tokio）、React 19 + TypeScript、Zustand、Vitest、@radix-ui/react-switch、TooltipSimple（`@components/Tooltip`）。

## Global Constraints

- **双端一致**：所有功能必须同时可用 Tauri 桌面与浏览器模式。爬虫合规语义两套实现必须一致（机器人 UA、robots 门控、限速、私网豁免、fail-open 决策）。
- **机器人 UA 字符串**（双端镜像，必须完全一致）：`AIDigitalLife/1.0 (+https://github.com/K-irito02/Kora; MetaFetcher)`。Rust 在 `browser.rs` `USER_AGENT`，前端在 `frontend/src/shared/userAgent.ts`。robots.txt 匹配用 product token `AIDigitalLife`。
- **robots.txt 门控**：Disallow 硬跳过（返回空 PageMeta：title/favicon 空串、url 保留）；robots 拉取失败（网络错误/超时/非 2xx）按 **Allow**（fail-open），不阻塞抓取。
- **域名限速**：每域名 5 秒/次（Rust 常量 `RATE_LIMIT_WINDOW`、TS `rateLimitWindowMs`）；超限返回空 PageMeta 走兜底。
- **robots 缓存**：按域名内存缓存 + TTL 1 小时（Rust `ROBOTS_CACHE_TTL`、TS `robotsCacheTtlMs`）。
- **私网豁免**：`localhost` / `127.x` / `192.168.x` / 私有 IP / 链接本地（169.254.x）跳过 robots 检查与限速；URL 解析失败按私网处理（直接抓取）。
- **保持不变**：10s 超时、64KB HTML 截断、64KB favicon 上限、`image/*` Content-Type 校验、3 秒/URL 全局去重（`FETCH_DEDUP_WINDOW_MS`）、三层 site meta 缓存、前端 Google S2 favicon 兜底。
- **非目标（不做）**：ETag/304 条件请求；robots.txt `Crawl-delay` 节流执行（仅解析，不执行等待）。
- **i18n 硬约束**：所有 UI 展示文本必须使用 i18n key，禁止硬编码。新增/重命名 key 必须 en-US 与 zh-CN 同步，且通过 `src/app/i18n/__tests__/keys.test.ts` 的 parity 检查。
- **TDD**：先写失败测试，再实现，再跑绿。UI/UX 变更后禁止跳过红绿测试。
- **内部函数命名不变**：`handleClearTabDirectories` / `browserClearAllFolderTabs` / `browserDeleteAllTabsInNode` 不重命名（面向数据结构而非用户）。
- **规则同步**：`.agents/rules/` 是真源，修改后必须同步到 `.opencode/rules/` 与 `.trae/rules/`。
- 参考实现若复用需标注 MIT 来源（本项目无需新增第三方代码，全部自实现）。

---

## File Structure

### Rust（`ai-digital-life/` 工作区）

| 文件 | 职责 |
|------|------|
| `crates/browser/src/robots_txt.rs` | **新建**。纯函数：`parse_robots_txt`、`RobotsRules::is_allowed`、`product_token`、通配匹配 `longest_match`。无 I/O。 |
| `crates/browser/src/robots_policy.rs` | **新建**。`is_private_url`、`RobotsCache`（TTL）、`DomainRateLimiter`（窗口）、`domain_of`。 |
| `crates/browser/src/lib.rs` | 导出两个新模块（`pub mod robots_txt; pub mod robots_policy;`）。 |
| `src-tauri/src/commands/browser.rs` | `fetch_page_meta_inner` 接入 robots 门控 + 限速 + 私网豁免；favicon 下载前 robots 门控；`USER_AGENT` 改为机器人 UA。 |

### Frontend（`ai-digital-life/frontend/`）

| 文件 | 职责 |
|------|------|
| `dev/crawlerRobots.ts` | **新建**。TS 镜像：`parseRobotsTxt`、`RobotsRules.isAllowed`、`productToken`、`longestMatch`。 |
| `dev/crawlerPolicy.ts` | **新建**。TS 镜像：`isPrivateUrl`、`RobotsCache`、`DomainRateLimiter`、`robotsAllowFetch`。 |
| `vite.config.ts` | `/__adl_preview_api__/browser/page-meta` 中间件接入 robots 门控 + 限速 + 私网豁免；favicon 下载前门控。 |
| `src/shared/userAgent.ts` | `USER_AGENT` 改为机器人 UA（与 Rust 同步）。 |
| `src/app/features/browser/useBrowserPanelHandlers.ts` | 新增 `handleAlwaysNewTab`（始终新建标签）。 |
| `src/app/features/browser/BrowserPanelActionsContext.ts` | 接口新增 `handleAlwaysNewTab`。 |
| `src/app/features/browser/BrowserPanel.tsx` | 接线 `handleAlwaysNewTab`。 |
| `src/app/features/browser/BrowserNavigator.tsx` | open 模式 "+ "按钮改调 `handleAlwaysNewTab`；tooltip/aria-label 改 `browserNewTabAlways`；删除书签按钮改原生 `title` + `browserDeleteAllBookmarks`。 |
| `src/app/features/browser/BrowserToolbar.tsx` | 移除包住 `BrowserNavModeSwitch` 的 `TooltipSimple`，改传 `title` prop。 |
| `src/app/features/browser/BrowserNavModeSwitch.tsx` | 新增 `title` prop 并落到原生 `title` 属性。 |
| `src/app/i18n/en-US/browser.ts` / `zh-CN/browser.ts` | 新增 `browserNewTabAlways`；重命名 `browserDeleteAllTabDirs` → `browserDeleteAllBookmarks` 并改值；`browserOpenTabs` 值改"已打开标签页"。 |

### 规则文件（仓库根，`.agents/rules/` 真源 → 同步副本）

| 文件 | 改动 |
|------|------|
| `.agents/rules/ui-patterns.md` §9 | 删除"非路径场景**禁止**原生 `title` 属性"等硬性绑定；改为"自定义 Tooltip 与原生 `title` 均可使用，开发时由用户决策"。 |
| `.agents/rules/design-system.md` | Tooltip 行删除"必须统一使用一种 Tooltip 方案"；改为"开发时由用户决策"。 |
| 根 `AGENTS.md` 禁止项 | 删除"混合使用多种 Tooltip 方案"禁令。 |
| `ai-digital-life/AGENTS.md` 设计系统约束 | Tooltip 行删除"优先使用 `TooltipSimple`"硬性绑定，改为询问用户。 |
| `.agents/rules/desktop-ui-verification.md:43` | "Tooltip 组件 / 原生 `title` 残留检查"改为"Tooltip 方案（自定义组件/原生 title）双端一致检查"。 |
| `.opencode/rules/` + `.trae/rules/` | 同步 `ui-patterns.md`、`design-system.md` 副本。 |

> 提示：仓库远程 `https://github.com/K-irito02/Kora.git`，UA 中已填入公开仓库 URL。若后续仓库更名，同步更新三处（browser.rs、userAgent.ts、以及本计划中的常量表）。

---

### Task 1: Rust robots.txt 解析与匹配（`crates/browser/src/robots_txt.rs`）

**Files:**
- Create: `ai-digital-life/crates/browser/src/robots_txt.rs`
- Modify: `ai-digital-life/crates/browser/src/lib.rs`（追加两个 `pub mod`）

**Interfaces:**
- Produces:
  - `pub fn product_token(user_agent: &str) -> &str`
  - `pub fn parse_robots_txt(raw: &str) -> RobotsRules`
  - `impl RobotsRules { pub fn is_allowed(&self, user_agent: &str, path: &str) -> bool }`
  - `pub struct RobotsRules { groups: Vec<RobotsGroup> }`（`#[derive(Debug, Clone, Default)]`，字段私有）
  - `fn longest_match(pattern: &str, path: &str) -> Option<usize>`（模块私有，供测试断言）

- [ ] **Step 1: 写失败测试**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn product_token_takes_part_before_slash() {
        assert_eq!(product_token("AIDigitalLife/1.0"), "AIDigitalLife");
        assert_eq!(product_token("Googlebot"), "Googlebot");
        assert_eq!(product_token("  Foo/2.1  "), "  Foo"); // token = 按 '/'.split 后首段（含首尾空格由调用方自行 trim）
    }

    #[test]
    fn disallow_blocks_matching_path() {
        let rules = parse_robots_txt("User-agent: AIDigitalLife\nDisallow: /private/");
        assert!(!rules.is_allowed("AIDigitalLife/1.0", "/private/data.html"));
    }

    #[test]
    fn allow_wins_over_disallow_on_equal_specificity() {
        let rules = parse_robots_txt(
            "User-agent: *\nDisallow: /foo\nAllow: /foo\n",
        );
        assert!(rules.is_allowed("AIDigitalLife", "/foo"));
    }

    #[test]
    fn most_specific_user_agent_group_wins_over_star() {
        let rules = parse_robots_txt(
            "User-agent: *\nDisallow: /x\n\nUser-agent: AIDigitalLife\nAllow: /\n",
        );
        // 精确 token 命中第二组 → Allow
        assert!(rules.is_allowed("AIDigitalLife/1.0", "/x"));
        // 其他 bot 命中 * → Disallow /x
        assert!(!rules.is_allowed("OtherBot/1.0", "/x"));
    }

    #[test]
    fn comments_and_blank_lines_ignored() {
        let rules = parse_robots_txt(
            "# top comment\n\nUser-agent: AIDigitalLife # inline\n# comment\nDisallow: /tmp\n\n",
        );
        assert!(!rules.is_allowed("AIDigitalLife", "/tmp/a"));
        assert!(rules.is_allowed("AIDigitalLife", "/ok"));
    }

    #[test]
    fn empty_allow_or_disallow_is_ignored() {
        let rules = parse_robots_txt("User-agent: *\nDisallow:\nAllow:\n");
        assert!(rules.is_allowed("AIDigitalLife", "/anything"));
    }

    #[test]
    fn no_rules_for_token_allows_everything() {
        let rules = parse_robots_txt("User-agent: Googlebot\nDisallow: /x\n");
        assert!(rules.is_allowed("AIDigitalLife/1.0", "/x"));
    }

    #[test]
    fn wildcard_star_matches_any_sequence() {
        assert_eq!(longest_match("/a/*/c", "/a/b/c"), Some(6));
        assert_eq!(longest_match("/a*", "/a"), Some(2));
        assert_eq!(longest_match("*", "/anything"), Some(9));
        assert_eq!(longest_match("/a/*/c", "/a/b/d"), None);
    }

    #[test]
    fn dollar_anchor_requires_end_of_path() {
        assert_eq!(longest_match("/a$", "/a"), Some(2));
        assert_eq!(longest_match("/a$", "/ab"), None);
        // 无 $ 时按前缀匹配（最长匹配长度）
        assert_eq!(longest_match("/a", "/ab"), Some(2));
    }

    #[test]
    fn prefix_match_longest_wins_across_rules() {
        let rules = parse_robots_txt(
            "User-agent: *\nDisallow: /foo/bar\nDisallow: /foo\nAllow: /foo\n",
        );
        // 最长匹配 /foo/bar (Disallow) 赢过 /foo 的 Allow/Disallow 平局
        assert!(!rules.is_allowed("AIDigitalLife", "/foo/bar"));
        // /foo 上 Allow 与 Disallow 等长 → Allow 赢
        assert!(rules.is_allowed("AIDigitalLife", "/foo"));
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cargo test -p adl-browser robots_txt
```

Expected: FAIL（模块不存在 / `cannot find function`）。

- [ ] **Step 3: 实现模块**

```rust
//! robots.txt 解析与匹配（RFC 9309 子集）。
//!
//! 纯函数模块，无 I/O、无网络依赖。供 Tauri 端 `fetch_page_meta_inner`
//! 与 Vite 预览端 robots 门控（`frontend/dev/crawlerRobots.ts`）共用语义。

/// robots.txt 中 User-Agent 行用的产品令牌：取 `User-Agent` 字符串 `'/'` 前段。
pub fn product_token(user_agent: &str) -> &str {
    user_agent.split('/').next().unwrap_or(user_agent)
}

#[derive(Debug, Clone, Default)]
pub struct RobotsRules {
    groups: Vec<RobotsGroup>,
}

#[derive(Debug, Clone, Default)]
struct RobotsGroup {
    user_agents: Vec<String>,
    allow: Vec<String>,
    disallow: Vec<String>,
}

/// 解析 robots.txt 正文。忽略注释（`#` 起）与空行；`user-agent` / `allow` /
/// `disallow` 字段名不区分大小写；连续 `user-agent` 行归同一组；遇到首个
/// `allow`/`disallow` 后再次出现 `user-agent` 视为新组；空值规则被忽略。
pub fn parse_robots_txt(raw: &str) -> RobotsRules {
    let mut groups: Vec<RobotsGroup> = Vec::new();
    let mut current: Option<RobotsGroup> = None;

    for line in raw.lines() {
        let line = line.split('#').next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        let Some((field, value)) = line.split_once(':') else {
            continue;
        };
        let field = field.trim().to_ascii_lowercase();
        let value = value.trim();
        match field.as_str() {
            "user-agent" => {
                let has_rules = current
                    .as_ref()
                    .is_some_and(|g| !g.allow.is_empty() || !g.disallow.is_empty());
                if has_rules {
                    if let Some(g) = current.take() {
                        groups.push(g);
                    }
                }
                current
                    .get_or_insert_with(RobotsGroup::default)
                    .user_agents
                    .push(value.to_string());
            }
            "allow" => {
                if !value.is_empty() {
                    current
                        .get_or_insert_with(RobotsGroup::default)
                        .allow
                        .push(value.to_string());
                }
            }
            "disallow" => {
                if !value.is_empty() {
                    current
                        .get_or_insert_with(RobotsGroup::default)
                        .disallow
                        .push(value.to_string());
                }
            }
            _ => {}
        }
    }
    if let Some(g) = current.take() {
        groups.push(g);
    }
    RobotsRules { groups }
}

impl RobotsRules {
    /// 判断某个爬虫是否被允许抓取 `path`（URL 的 pathname 部分）。
    /// 组选择：精确匹配产品令牌优先于 `*`；无匹配组或无路径规则 → 允许。
    /// 路径规则：`allow` 与 `disallow` 中取最长匹配；等长时 `allow` 优先（RFC 9309）。
    pub fn is_allowed(&self, user_agent: &str, path: &str) -> bool {
        let token = product_token(user_agent);
        let Some(group) = self.select_group(token.trim()) else {
            return true;
        };
        let path = if path.is_empty() { "/" } else { path };
        let allow_len = group
            .allow
            .iter()
            .filter_map(|p| longest_match(p, path))
            .max();
        let disallow_len = group
            .disallow
            .iter()
            .filter_map(|p| longest_match(p, path))
            .max();
        match (allow_len, disallow_len) {
            (Some(a), Some(d)) => a >= d,
            (Some(_), None) => true,
            (None, Some(_)) => false,
            (None, None) => true,
        }
    }

    fn select_group(&self, token: &str) -> Option<&RobotsGroup> {
        self.groups
            .iter()
            .find(|g| g.user_agents.iter().any(|ua| ua.eq_ignore_ascii_case(token)))
            .or_else(|| self.groups.iter().find(|g| g.user_agents.iter().any(|ua| ua == "*")))
    }
}

/// 计算 `pattern` 对 `path` 的最长匹配长度（前缀匹配）；无匹配返回 `None`。
/// 支持 `*`（匹配任意字符序列，含空）与末尾 `$`（锚定到路径结尾）。
fn longest_match(pattern: &str, path: &str) -> Option<usize> {
    let anchored = pattern.ends_with('$');
    let core = if anchored { &pattern[..pattern.len() - 1] } else { pattern };
    let p: Vec<char> = core.chars().collect();
    let s: Vec<char> = path.chars().collect();

    // dp[i][j] = pattern[..i] 是否匹配到 path 恰好前 j 个字符
    let mut dp = vec![vec![false; s.len() + 1]; p.len() + 1];
    dp[0][0] = true;
    for i in 1..=p.len() {
        if p[i - 1] == '*' {
            for j in 0..=s.len() {
                if dp[i - 1][j] {
                    dp[i][j] = true;
                }
            }
            for j in 1..=s.len() {
                if dp[i][j - 1] {
                    dp[i][j] = true;
                }
            }
        } else {
            for j in 1..=s.len() {
                if dp[i - 1][j - 1] && p[i - 1] == s[j - 1] {
                    dp[i][j] = true;
                }
            }
        }
    }

    if anchored {
        dp[p.len()][s.len()].then_some(s.len())
    } else {
        (0..=s.len()).rev().find(|&j| dp[p.len()][j])
    }
}
```

- [ ] **Step 4: 更新 `lib.rs` 并运行测试确认通过**

追加模块声明（放在 `pub mod html_meta;` 附近）：

```rust
pub mod robots_policy;
pub mod robots_txt;
```

```bash
cargo test -p adl-browser robots_txt
```

Expected: PASS（9 个用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/crates/browser/src/robots_txt.rs ai-digital-life/crates/browser/src/lib.rs
git commit -m "feat(rust): add robots.txt parser and matcher"
```

---

### Task 2: Rust 私网判定 + robots 缓存 + 域名限速（`crates/browser/src/robots_policy.rs`）

**Files:**
- Create: `ai-digital-life/crates/browser/src/robots_policy.rs`
- Modify: `ai-digital-life/crates/browser/src/lib.rs`（已在 Task 1 声明 `pub mod robots_policy;`）

**Interfaces:**
- Consumes: `crate::robots_txt::RobotsRules`（Task 1）。
- Produces:
  - `pub fn is_private_url(url_str: &str) -> bool`
  - `pub fn domain_of(url_str: &str) -> Option<String>`
  - `pub const ROBOTS_CACHE_TTL: Duration`
  - `pub struct RobotsCache`：`get(&self, domain: &str, now: Instant) -> Option<RobotsRules>` / `insert(&self, domain: &str, rules: RobotsRules, now: Instant)`
  - `pub struct DomainRateLimiter`：`new(window: Duration)` / `try_acquire(&self, domain: &str, now: Instant) -> bool`

- [ ] **Step 1: 写失败测试**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn now() -> Instant {
        Instant::now()
    }

    #[test]
    fn private_url_detection() {
        assert!(is_private_url("http://localhost:3000"));
        assert!(is_private_url("http://127.0.0.1/"));
        assert!(is_private_url("http://127.0.0.1:5173/x"));
        assert!(is_private_url("http://192.168.1.1/"));
        assert!(is_private_url("http://10.0.0.5/"));
        assert!(is_private_url("http://172.16.5.5/"));
        assert!(is_private_url("http://169.254.1.1/"));
        assert!(is_private_url("not-a-url"));
        assert!(is_private_url("http://[::1]/"));
    }

    #[test]
    fn public_url_not_private() {
        assert!(!is_private_url("https://example.com/"));
        assert!(!is_private_url("https://github.com/K-irito02/Kora"));
        assert!(!is_private_url("http://8.8.8.8/"));
    }

    #[test]
    fn domain_of_extracts_host() {
        assert_eq!(domain_of("https://example.com/a/b").as_deref(), Some("example.com"));
        assert_eq!(domain_of("https://a.example.com:8080/x").as_deref(), Some("a.example.com"));
        assert_eq!(domain_of("not-a-url"), None);
    }

    #[test]
    fn robots_cache_hits_within_ttl_and_expires_after() {
        let cache = RobotsCache::new();
        let t0 = now();
        cache.insert("example.com", parse_robots_txt("User-agent: *\nDisallow: /x"), t0);
        assert!(cache.get("example.com", t0 + Duration::from_secs(600)).is_some());
        assert!(cache.get("example.com", t0 + ROBOTS_CACHE_TTL + Duration::from_secs(1)).is_none());
        assert!(cache.get("other.com", t0).is_none());
    }

    #[test]
    fn rate_limiter_blocks_same_domain_within_window() {
        let limiter = DomainRateLimiter::new(Duration::from_secs(5));
        let t0 = now();
        assert!(limiter.try_acquire("example.com", t0));
        assert!(!limiter.try_acquire("example.com", t0 + Duration::from_secs(2)));
        assert!(limiter.try_acquire("example.com", t0 + Duration::from_secs(5)));
        assert!(limiter.try_acquire("other.com", t0)); // 异域不受影响
    }

    fn parse_robots_txt(_raw: &str) -> crate::robots_txt::RobotsRules {
        crate::robots_txt::parse_robots_txt(_raw)
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cargo test -p adl-browser robots_policy
```

Expected: FAIL。

- [ ] **Step 3: 实现模块**

```rust
//! 爬虫策略：私网判定、robots 缓存、域名限速。
//!
//! 纯逻辑 + `std::sync::Mutex`，不依赖 reqwest/tokio，便于单测。
//! 供 Tauri 端 `fetch_page_meta_inner` 使用；前端对应 `frontend/dev/crawlerPolicy.ts`。

use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use url::Url;

use crate::robots_txt::RobotsRules;

/// robots.txt 内存缓存 TTL：1 小时。
pub const ROBOTS_CACHE_TTL: Duration = Duration::from_secs(3600);

/// URL 是否指向本地/私网（跳过 robots 检查与限速）。
/// 判定失败（无法解析）按私网处理，保证本地开发不阻塞。
pub fn is_private_url(url_str: &str) -> bool {
    let Ok(url) = Url::parse(url_str) else {
        return true;
    };
    let Some(host) = url.host() else {
        return true;
    };
    match host {
        url::Host::Domain(d) => d.eq_ignore_ascii_case("localhost"),
        url::Host::Ipv4(ip) => {
            ip.is_loopback() || ip.is_private() || ip.is_link_local() || ip.is_unspecified()
        }
        url::Host::Ipv6(ip) => ip.is_loopback() || ip.is_unspecified(),
    }
}

/// 提取 URL 的 host（域名），解析失败返回 `None`。
pub fn domain_of(url_str: &str) -> Option<String> {
    Url::parse(url_str)
        .ok()
        .and_then(|u| u.host_str().map(|s| s.to_string()))
}

/// 按域名内存缓存 robots 规则，TTL 内命中，过期视为未命中（重新拉取）。
#[derive(Default)]
pub struct RobotsCache {
    entries: Mutex<HashMap<String, (Instant, RobotsRules)>>,
}

impl RobotsCache {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get(&self, domain: &str, now: Instant) -> Option<RobotsRules> {
        let entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        match entries.get(domain) {
            Some((fetched_at, rules)) if now.duration_since(*fetched_at) < ROBOTS_CACHE_TTL => {
                Some(rules.clone())
            }
            _ => None,
        }
    }

    pub fn insert(&self, domain: &str, rules: RobotsRules, now: Instant) {
        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries.insert(domain.to_string(), (now, rules));
    }
}

/// 每域名限速器：同一域名在窗口期内至多允许一次。超限返回 false（调用方走兜底）。
pub struct DomainRateLimiter {
    last_allowed: Mutex<HashMap<String, Instant>>,
    window: Duration,
}

impl DomainRateLimiter {
    pub fn new(window: Duration) -> Self {
        Self {
            last_allowed: Mutex::new(HashMap::new()),
            window,
        }
    }

    pub fn try_acquire(&self, domain: &str, now: Instant) -> bool {
        let mut last = self.last_allowed.lock().unwrap_or_else(|e| e.into_inner());
        match last.get(domain) {
            Some(prev) if now.duration_since(*prev) < self.window => false,
            _ => {
                last.insert(domain.to_string(), now);
                true
            }
        }
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cargo test -p adl-browser robots_policy
```

Expected: PASS。随后整体回归：

```bash
cargo test -p adl-browser
```

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/crates/browser/src/robots_policy.rs
git commit -m "feat(rust): add private-ip check, robots cache, and per-domain rate limiter"
```

---

### Task 3: 接入 Tauri `fetch_page_meta_inner` + 机器人 UA

**Files:**
- Modify: `ai-digital-life/src-tauri/src/commands/browser.rs`
- Modify: `ai-digital-life/frontend/src/shared/userAgent.ts`（双端 UA 镜像）

**Interfaces:**
- Consumes: `adl_browser::robots_txt::{parse_robots_txt, RobotsRules}`、`adl_browser::robots_policy::{is_private_url, domain_of, RobotsCache, DomainRateLimiter}`（Task 1/2）。
- Produces:
  - `async fn robots_allow_fetch(client: &reqwest::Client, url_str: &str) -> bool`（私有）
  - `fn empty_page_meta(url: &str) -> PageMeta`（私有）
  - 常量 `ROBOTS_CACHE` / `RATE_LIMITER`（`OnceLock`）、`RATE_LIMIT_WINDOW`、`BOT_PRODUCT_TOKEN`

- [ ] **Step 1: 写失败测试（对新增纯辅助做断言）**

在 `browser.rs` 底部现有 `mod favicon_data_uri_tests` 附近新增测试模块，验证 robots 门控的纯决策辅助：

```rust
#[cfg(test)]
mod robots_gate_tests {
    use super::*;
    use adl_browser::robots_txt::parse_robots_txt;

    /// 纯决策：私网直接放行；无 robots（fail-open）放行；Disallow 硬跳过。
    fn gate(url: &str, robots: Option<&RobotsRules>) -> bool {
        if is_private_url(url) {
            return true;
        }
        match robots {
            None => true, // fail-open
            Some(rules) => {
                let path = url
                    .parse::<url::Url>()
                    .map(|u| u.path().to_string())
                    .unwrap_or_else(|_| "/".to_string());
                rules.is_allowed(BOT_PRODUCT_TOKEN, &path)
            }
        }
    }

    #[test]
    fn private_url_always_allowed() {
        assert!(gate("http://localhost:3000", None));
        assert!(gate("http://127.0.0.1/x", Some(&parse_robots_txt("User-agent: *\nDisallow: /\n"))));
    }

    #[test]
    fn fail_open_when_robots_unavailable() {
        assert!(gate("https://example.com/x", None));
    }

    #[test]
    fn disallow_hard_skips_public_url() {
        let rules = parse_robots_txt("User-agent: AIDigitalLife\nDisallow: /private");
        assert!(!gate("https://example.com/private/a", Some(&rules)));
        assert!(gate("https://example.com/public", Some(&rules)));
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cargo test -p ai-digital-life robots_gate_tests
```

Expected: FAIL（`BOT_PRODUCT_TOKEN` 未定义）。

> 注：包名请以实际为准（`src-tauri/Cargo.toml` 中 `name = "ai-digital-life"`）。若工作区包名不同，用 `cargo test --workspace robots_gate_tests`。

- [ ] **Step 3: 改 `USER_AGENT` + 新增常量和辅助函数 + 接入抓取流程**

在 `browser.rs` 顶部 `use` 区追加：

```rust
use adl_browser::robots_policy::{is_private_url, domain_of, DomainRateLimiter, RobotsCache};
use adl_browser::robots_txt::parse_robots_txt;
```

替换 `USER_AGENT` 常量（line 272 附近）：

```rust
/// Canonical User-Agent for outbound browser HTTP requests.
///
/// Mirrors `frontend/src/shared/userAgent.ts` (`USER_AGENT`). Update both
/// locations together — they must stay in sync so Tauri-mode and preview-mode
/// requests appear identical to servers. This is a compliant crawler identity
/// (robots.txt product token: `AIDigitalLife`), not a browser UA spoof.
const USER_AGENT: &str = "AIDigitalLife/1.0 (+https://github.com/K-irito02/Kora; MetaFetcher)";
const BOT_PRODUCT_TOKEN: &str = "AIDigitalLife";
```

在 `FETCH_DEDUP_WINDOW_MS` 常量附近追加：

```rust
const RATE_LIMIT_WINDOW: std::time::Duration = std::time::Duration::from_secs(5);

static ROBOTS_CACHE: std::sync::OnceLock<RobotsCache> = std::sync::OnceLock::new();
static RATE_LIMITER: std::sync::OnceLock<DomainRateLimiter> = std::sync::OnceLock::new();

/// 统一构造空 PageMeta（robots 拦截 / 限速兜底返回值）。
fn empty_page_meta(url: &str) -> PageMeta {
    PageMeta {
        title: String::new(),
        favicon: String::new(),
        url: url.to_string(),
        favicon_data_uri: String::new(),
    }
}

/// robots 门控（含私网豁免与 fail-open）。返回 true 表示允许抓取。
/// 私网直接放行；否则查缓存 → 未命中则拉取 robots.txt（失败按 Allow）→
/// 用 `BOT_PRODUCT_TOKEN` 匹配 URL 的 path。
async fn robots_allow_fetch(client: &reqwest::Client, url_str: &str) -> bool {
    if is_private_url(url_str) {
        return true;
    }
    let Ok(parsed) = url::Url::parse(url_str) else {
        return true;
    };
    let Some(domain) = parsed.host_str().map(|s| s.to_string()) else {
        return true;
    };
    let now = std::time::Instant::now();
    let rules = {
        let cache = ROBOTS_CACHE.get_or_init(RobotsCache::new);
        if let Some(rules) = cache.get(&domain, now) {
            Some(rules)
        } else {
            let robots_url = format!("{}://{domain}/robots.txt", parsed.scheme());
            let fetched = client.get(&robots_url).send().await;
            let rules = match fetched {
                Ok(resp) if resp.status().is_success() => {
                    let body = resp.text().await.unwrap_or_default();
                    (!body.is_empty()).then(|| parse_robots_txt(&body))
                }
                _ => None,
            };
            if let Some(rules) = &rules {
                cache.insert(&domain, rules.clone(), std::time::Instant::now());
            }
            rules
        }
    };
    match rules {
        Some(rules) => rules.is_allowed(BOT_PRODUCT_TOKEN, parsed.path()),
        None => true, // fail-open
    }
}
```

修改 `fetch_page_meta_inner`：在 `let client = ...build()...?;` 之后、`let response = client.get(url)...` 之前插入门控（HTML 抓取与 favicon 下载分别门控）：

```rust
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent(USER_AGENT)
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| AppError::Internal(format!("failed to build http client: {e}")))?;

    // 合规爬虫门控：robots.txt Disallow 硬跳过（私网豁免 / fail-open 见辅助函数）。
    if !robots_allow_fetch(&client, url).await {
        tracing::info!(url = %url, "fetch_page_meta_inner: blocked by robots.txt, returning empty");
        return Ok(empty_page_meta(url));
    }
    // 按域名限速（5s/次）；私网已在上层豁免。
    if let Some(domain) = domain_of(url) {
        if !RATE_LIMITER
            .get_or_init(|| DomainRateLimiter::new(RATE_LIMIT_WINDOW))
            .try_acquire(&domain, std::time::Instant::now())
        {
            tracing::info!(url = %url, domain = %domain, "fetch_page_meta_inner: rate limited, returning empty");
            return Ok(empty_page_meta(url));
        }
    }

    let response = client.get(url)
        .header("Accept", "text/html,application/xhtml+xml")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .send()
        .await;
```

并修改 favicon 下载处（`let favicon_data_uri = if final_favicon.is_empty() {` 分支），在下载前加 robots 门控：

```rust
    let favicon_data_uri = if final_favicon.is_empty() {
        String::new()
    } else {
        // 对 favicon URL 再查一次 robots 门控（跨域 CDN 也受保护）。
        if robots_allow_fetch(&client, &final_favicon).await {
            download_favicon_data_uri(&client, &final_favicon).await
        } else {
            String::new()
        }
    };
```

> 注意：将原 `empty_page_meta` 用途处（dedup 分支与非 http 分支）保持不变即可，无需改动那两处。

同步改 `frontend/src/shared/userAgent.ts`：

```ts
/**
 * Canonical User-Agent string for outbound HTTP requests from the browser
 * subsystem (Vite preview proxy + robots.txt gate).
 *
 * Rust side mirrors this exact string in `src-tauri/src/commands/browser.rs`
 * (`USER_AGENT` const). Update both locations together — they must stay in sync
 * so that Tauri-mode and preview-mode requests appear identical to servers.
 * This is a compliant crawler identity (robots.txt product token: `AIDigitalLife`),
 * not a browser UA spoof.
 */
export const USER_AGENT =
  'AIDigitalLife/1.0 (+https://github.com/K-irito02/Kora; MetaFetcher)';
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cargo test --workspace robots_gate_tests
cargo clippy --workspace --all-targets -- -D warnings
```

Expected: PASS；clippy 0 警告。若 `robots_gate_tests` 未匹配到，改用 `cargo test --workspace` 全量跑（629+ 用例应全绿）。

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/src-tauri/src/commands/browser.rs ai-digital-life/frontend/src/shared/userAgent.ts
git commit -m "feat(rust): wire robots.txt gate, rate limiting, and bot UA into page-meta fetch"
```

---

### Task 4: 前端 robots/策略镜像模块（`frontend/dev/crawlerRobots.ts` + `crawlerPolicy.ts`）

**Files:**
- Create: `ai-digital-life/frontend/dev/crawlerRobots.ts`
- Create: `ai-digital-life/frontend/dev/crawlerRobots.test.ts`
- Create: `ai-digital-life/frontend/dev/crawlerPolicy.ts`
- Create: `ai-digital-life/frontend/dev/crawlerPolicy.test.ts`

**Interfaces:**
- Produces:
  - `export interface RobotsRules { groups: RobotsGroup[] }`、`export interface RobotsGroup { userAgents: string[]; allow: string[]; disallow: string[] }`
  - `export function parseRobotsTxt(raw: string): RobotsRules`
  - `export function productToken(userAgent: string): string`
  - `export function isAllowed(rules: RobotsRules, userAgent: string, path: string): boolean`
  - `export function longestMatch(pattern: string, path: string): number | null`
  - `export function isPrivateUrl(urlStr: string): boolean`
  - `export function domainOf(urlStr: string): string | null`
  - `export const robotsCacheTtlMs = 3600_000`
  - `export class RobotsCache`：`get(domain: string, now: number): RobotsRules | null` / `insert(domain: string, rules: RobotsRules, now: number)`
  - `export class DomainRateLimiter`：`new(windowMs: number)` / `tryAcquire(domain: string, now: number): boolean`
  - `export async function robotsAllowFetch(urlStr: string, fetchImpl?: typeof fetch, now?: number): Promise<boolean>`（供 vite.config.ts 使用）

> 语义与 Task 1/2 Rust 实现一一对应（同一套测试覆盖点）。

- [ ] **Step 1: 写失败测试（`crawlerRobots.test.ts`）**

```ts
import { describe, it, expect } from 'vitest';
import { parseRobotsTxt, isAllowed, productToken, longestMatch } from './crawlerRobots';

describe('crawlerRobots', () => {
  it('productToken takes part before slash', () => {
    expect(productToken('AIDigitalLife/1.0')).toBe('AIDigitalLife');
    expect(productToken('Googlebot')).toBe('Googlebot');
  });

  it('disallow blocks matching path', () => {
    const rules = parseRobotsTxt('User-agent: AIDigitalLife\nDisallow: /private/');
    expect(isAllowed(rules, 'AIDigitalLife/1.0', '/private/data.html')).toBe(false);
  });

  it('allow wins over disallow on equal specificity', () => {
    const rules = parseRobotsTxt('User-agent: *\nDisallow: /foo\nAllow: /foo\n');
    expect(isAllowed(rules, 'AIDigitalLife', '/foo')).toBe(true);
  });

  it('most specific user-agent group wins over star', () => {
    const rules = parseRobotsTxt(
      'User-agent: *\nDisallow: /x\n\nUser-agent: AIDigitalLife\nAllow: /\n',
    );
    expect(isAllowed(rules, 'AIDigitalLife/1.0', '/x')).toBe(true);
    expect(isAllowed(rules, 'OtherBot/1.0', '/x')).toBe(false);
  });

  it('comments and blank lines ignored', () => {
    const rules = parseRobotsTxt('# top\n\nUser-agent: AIDigitalLife # inline\n# c\nDisallow: /tmp\n\n');
    expect(isAllowed(rules, 'AIDigitalLife', '/tmp/a')).toBe(false);
    expect(isAllowed(rules, 'AIDigitalLife', '/ok')).toBe(true);
  });

  it('empty allow or disallow ignored', () => {
    const rules = parseRobotsTxt('User-agent: *\nDisallow:\nAllow:\n');
    expect(isAllowed(rules, 'AIDigitalLife', '/anything')).toBe(true);
  });

  it('no rules for token allows everything', () => {
    const rules = parseRobotsTxt('User-agent: Googlebot\nDisallow: /x\n');
    expect(isAllowed(rules, 'AIDigitalLife/1.0', '/x')).toBe(true);
  });

  it('wildcard star and dollar anchor', () => {
    expect(longestMatch('/a/*/c', '/a/b/c')).toBe(6);
    expect(longestMatch('/a$', '/a')).toBe(2);
    expect(longestMatch('/a$', '/ab')).toBeNull();
    expect(longestMatch('/a', '/ab')).toBe(2);
  });

  it('prefix match longest wins across rules', () => {
    const rules = parseRobotsTxt('User-agent: *\nDisallow: /foo/bar\nDisallow: /foo\nAllow: /foo\n');
    expect(isAllowed(rules, 'AIDigitalLife', '/foo/bar')).toBe(false);
    expect(isAllowed(rules, 'AIDigitalLife', '/foo')).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm --dir ai-digital-life/frontend vitest run dev/crawlerRobots.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现 `crawlerRobots.ts`**

```ts
/**
 * robots.txt 解析与匹配（RFC 9309 子集）——纯函数，无 I/O。
 * 与 Rust `crates/browser/src/robots_txt.rs` 语义一一对应。
 */

export interface RobotsGroup {
  userAgents: string[];
  allow: string[];
  disallow: string[];
}

export interface RobotsRules {
  groups: RobotsGroup[];
}

export function productToken(userAgent: string): string {
  return userAgent.split('/')[0] ?? userAgent;
}

export function parseRobotsTxt(raw: string): RobotsRules {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;

  for (const rawLine of raw.split('\n')) {
    const line = (rawLine.split('#')[0] ?? '').trim();
    if (!line) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const field = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();
    if (field === 'user-agent') {
      const hasRules = current !== null && (current.allow.length > 0 || current.disallow.length > 0);
      if (hasRules) {
        groups.push(current!);
        current = null;
      }
      if (!current) {
        current = { userAgents: [], allow: [], disallow: [] };
      }
      current.userAgents.push(value);
    } else if (field === 'allow' && value) {
      if (!current) current = { userAgents: ['*'], allow: [], disallow: [] };
      current.allow.push(value);
    } else if (field === 'disallow' && value) {
      if (!current) current = { userAgents: ['*'], allow: [], disallow: [] };
      current.disallow.push(value);
    }
  }
  if (current) groups.push(current);
  return { groups };
}

export function isAllowed(rules: RobotsRules, userAgent: string, path: string): boolean {
  const token = productToken(userAgent).trim();
  const group =
    rules.groups.find((g) => g.userAgents.some((ua) => ua.toLowerCase() === token.toLowerCase())) ??
    rules.groups.find((g) => g.userAgents.some((ua) => ua === '*'));
  if (!group) return true;
  const p = path.length ? path : '/';
  const allowLen = group.allow.map((pat) => longestMatch(pat, p)).filter((n): n is number => n !== null);
  const disallowLen = group.disallow.map((pat) => longestMatch(pat, p)).filter((n): n is number => n !== null);
  const aMax = allowLen.length ? Math.max(...allowLen) : null;
  const dMax = disallowLen.length ? Math.max(...disallowLen) : null;
  if (aMax === null && dMax === null) return true;
  if (aMax === null) return false;
  if (dMax === null) return true;
  return aMax >= dMax;
}

export function longestMatch(pattern: string, path: string): number | null {
  const anchored = pattern.endsWith('$');
  const core = anchored ? pattern.slice(0, -1) : pattern;
  const p = core.split('');
  const s = path.split('');
  const dp: boolean[][] = Array.from({ length: p.length + 1 }, () =>
    Array(s.length + 1).fill(false),
  );
  dp[0][0] = true;
  for (let i = 1; i <= p.length; i++) {
    if (p[i - 1] === '*') {
      for (let j = 0; j <= s.length; j++) {
        if (dp[i - 1][j]) dp[i][j] = true;
      }
      for (let j = 1; j <= s.length; j++) {
        if (dp[i][j - 1]) dp[i][j] = true;
      }
    } else {
      for (let j = 1; j <= s.length; j++) {
        if (dp[i - 1][j - 1] && p[i - 1] === s[j - 1]) dp[i][j] = true;
      }
    }
  }
  if (anchored) {
    return dp[p.length][s.length] ? s.length : null;
  }
  for (let j = s.length; j >= 0; j--) {
    if (dp[p.length][j]) return j;
  }
  return null;
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm --dir ai-digital-life/frontend vitest run dev/crawlerRobots.test.ts
```

Expected: PASS。

- [ ] **Step 5: 写 `crawlerPolicy.test.ts`（失败测试）**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isPrivateUrl,
  domainOf,
  RobotsCache,
  DomainRateLimiter,
  robotsCacheTtlMs,
  robotsAllowFetch,
} from './crawlerPolicy';
import { parseRobotsTxt } from './crawlerRobots';

describe('crawlerPolicy', () => {
  it('isPrivateUrl detects localhost and private ranges', () => {
    expect(isPrivateUrl('http://localhost:3000')).toBe(true);
    expect(isPrivateUrl('http://127.0.0.1/')).toBe(true);
    expect(isPrivateUrl('http://192.168.1.1/')).toBe(true);
    expect(isPrivateUrl('http://10.0.0.5/')).toBe(true);
    expect(isPrivateUrl('http://172.16.5.5/')).toBe(true);
    expect(isPrivateUrl('http://169.254.1.1/')).toBe(true);
    expect(isPrivateUrl('not-a-url')).toBe(true);
    expect(isPrivateUrl('http://[::1]/')).toBe(true);
  });

  it('isPrivateUrl leaves public hosts alone', () => {
    expect(isPrivateUrl('https://example.com/')).toBe(false);
    expect(isPrivateUrl('https://github.com/K-irito02/Kora')).toBe(false);
    expect(isPrivateUrl('http://8.8.8.8/')).toBe(false);
  });

  it('domainOf extracts host', () => {
    expect(domainOf('https://example.com/a/b')).toBe('example.com');
    expect(domainOf('https://a.example.com:8080/x')).toBe('a.example.com');
    expect(domainOf('not-a-url')).toBeNull();
  });

  it('robots cache hits within ttl and expires after', () => {
    const cache = new RobotsCache();
    const t0 = 1000;
    cache.insert('example.com', parseRobotsTxt('User-agent: *\nDisallow: /x'), t0);
    expect(cache.get('example.com', t0 + 60_000)).not.toBeNull();
    expect(cache.get('example.com', t0 + robotsCacheTtlMs + 1)).toBeNull();
    expect(cache.get('other.com', t0)).toBeNull();
  });

  it('rate limiter blocks same domain within window', () => {
    const limiter = new DomainRateLimiter(5000);
    const t0 = 1000;
    expect(limiter.tryAcquire('example.com', t0)).toBe(true);
    expect(limiter.tryAcquire('example.com', t0 + 2000)).toBe(false);
    expect(limiter.tryAcquire('example.com', t0 + 5000)).toBe(true);
    expect(limiter.tryAcquire('other.com', t0)).toBe(true);
  });

  it('robotsAllowFetch: private url bypasses robots', async () => {
    const fetchImpl = vi.fn();
    expect(await robotsAllowFetch('http://localhost:3000', fetchImpl)).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('robotsAllowFetch: fail-open on robots fetch failure', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 } as Response));
    expect(await robotsAllowFetch('https://example.com/x', fetchImpl, 1000)).toBe(true);
  });

  it('robotsAllowFetch: disallow hard blocks public url', async () => {
    const body = 'User-agent: AIDigitalLife\nDisallow: /private\n';
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, text: async () => body } as unknown as Response));
    expect(await robotsAllowFetch('https://example.com/private/a', fetchImpl, 1000)).toBe(false);
    expect(await robotsAllowFetch('https://example.com/public', fetchImpl, 2000)).toBe(true);
  });
});
```

- [ ] **Step 6: 运行测试确认失败**

```bash
pnpm --dir ai-digital-life/frontend vitest run dev/crawlerPolicy.test.ts
```

Expected: FAIL。

- [ ] **Step 7: 实现 `crawlerPolicy.ts`**

```ts
/**
 * 爬虫策略：私网判定、robots 缓存、域名限速、robots 门控决策。
 * 与 Rust `crates/browser/src/robots_policy.rs` 语义一一对应。
 * 供 `vite.config.ts` `/__adl_preview_api__/browser/page-meta` 中间件使用。
 */
import { parseRobotsTxt, isAllowed, type RobotsRules } from './crawlerRobots';

export const robotsCacheTtlMs = 3600_000;

export function isPrivateUrl(urlStr: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(urlStr).hostname.toLowerCase();
  } catch {
    return true;
  }
  if (hostname === 'localhost' || hostname === '::1') return true;
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 0 || a === 127 || a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

export function domainOf(urlStr: string): string | null {
  try {
    return new URL(urlStr).hostname;
  } catch {
    return null;
  }
}

export class RobotsCache {
  private entries = new Map<string, { fetchedAt: number; rules: RobotsRules }>();

  get(domain: string, now: number): RobotsRules | null {
    const entry = this.entries.get(domain);
    if (!entry) return null;
    if (now - entry.fetchedAt >= robotsCacheTtlMs) return null;
    return entry.rules;
  }

  insert(domain: string, rules: RobotsRules, now: number): void {
    this.entries.set(domain, { fetchedAt: now, rules });
  }
}

export class DomainRateLimiter {
  private lastAllowed = new Map<string, number>();
  constructor(private readonly windowMs: number) {}

  tryAcquire(domain: string, now: number): boolean {
    const prev = this.lastAllowed.get(domain);
    if (prev !== undefined && now - prev < this.windowMs) return false;
    this.lastAllowed.set(domain, now);
    return true;
  }
}

/**
 * robots 门控（含私网豁免与 fail-open）。返回 true 表示允许抓取。
 * `now` 参数便于测试注入时间；生产调用省略。
 */
export async function robotsAllowFetch(
  urlStr: string,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<boolean> {
  if (isPrivateUrl(urlStr)) return true;
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return true;
  }
  const domain = parsed.hostname;
  const cache = globalThis.__adlRobotsCache ?? (globalThis.__adlRobotsCache = new RobotsCache());
  const cached = cache.get(domain, now);
  let rules: RobotsRules | null;
  if (cached) {
    rules = cached;
  } else {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let fetched: Response | null = null;
    try {
      fetched = await fetchImpl(`${parsed.protocol}//${domain}/robots.txt`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'AIDigitalLife/1.0 (+https://github.com/K-irito02/Kora; MetaFetcher)' },
      });
    } catch {
      fetched = null;
    } finally {
      clearTimeout(timeout);
    }
    if (fetched && fetched.ok) {
      const body = await fetched.text().catch(() => '');
      rules = body ? parseRobotsTxt(body) : null;
    } else {
      rules = null;
    }
    if (rules) cache.insert(domain, rules, now);
  }
  if (!rules) return true;
  return isAllowed(rules, 'AIDigitalLife', parsed.pathname);
}
```

> 注意：`globalThis.__adlRobotsCache` 需要一个 TS 声明。在 `crawlerPolicy.ts` 顶部加：
>
> ```ts
> declare global {
>   var __adlRobotsCache: RobotsCache | undefined;
> }
> ```

- [ ] **Step 8: 运行测试确认通过**

```bash
pnpm --dir ai-digital-life/frontend vitest run dev/crawlerPolicy.test.ts dev/crawlerRobots.test.ts
pnpm --dir ai-digital-life/frontend run typecheck
```

Expected: PASS；typecheck 0 errors。

- [ ] **Step 9: 提交**

```bash
git add ai-digital-life/frontend/dev/crawlerRobots.ts ai-digital-life/frontend/dev/crawlerRobots.test.ts ai-digital-life/frontend/dev/crawlerPolicy.ts ai-digital-life/frontend/dev/crawlerPolicy.test.ts
git commit -m "feat(frontend): add crawler robots/policy mirror modules"
```

---

### Task 5: 接入 Vite `/__adl_preview_api__/browser/page-meta` 中间件

**Files:**
- Modify: `ai-digital-life/frontend/vite.config.ts`

**Interfaces:**
- Consumes: `isPrivateUrl`、`robotsAllowFetch`、`DomainRateLimiter`（Task 4）。
- Produces: 无（纯接线）。`USER_AGENT` 已在 Task 3 更新，中间件继续用它作为 fetch 头。

- [ ] **Step 1: 写失败测试**

在 `ai-digital-life/frontend/dev/previewWorkspaceService/` 目录模式之外，为中间件逻辑抽一个可测纯函数。为控制改动面，新增 `ai-digital-life/frontend/dev/previewCrawlerGate.ts`，把门控决策抽为可测函数，并让 vite.config.ts 调用它：

```ts
// previewCrawlerGate.ts —— 供 vite.config.ts page-meta 中间件使用
import { isPrivateUrl, robotsAllowFetch } from './crawlerPolicy';

/**
 * 返回 true 表示允许继续抓取。用于 page-meta 中间件的 HTML 与 favicon 两处门控。
 * fetchImpl/now 便于测试注入。
 */
export async function pageMetaGateAllows(
  url: string,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<boolean> {
  return robotsAllowFetch(url, fetchImpl, now);
}
```

测试 `dev/previewCrawlerGate.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest';
import { pageMetaGateAllows } from './previewCrawlerGate';

describe('previewCrawlerGate', () => {
  it('private url always allowed (no fetch)', async () => {
    const fetchImpl = vi.fn();
    expect(await pageMetaGateAllows('http://localhost:3000', fetchImpl)).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('disallow hard blocks; fail-open on error', async () => {
    const disallow = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => 'User-agent: *\nDisallow: /private',
    }) as unknown as Response);
    expect(await pageMetaGateAllows('https://example.com/private/a', disallow, 1000)).toBe(false);

    const fail = vi.fn(async () => ({ ok: false, status: 500 } as Response));
    expect(await pageMetaGateAllows('https://example.com/x', fail, 1000)).toBe(true);
  });
});
```

> 这是对 `robotsAllowFetch` 的薄封装测试，真正逻辑已在 Task 4 覆盖。此步保证中间件接入点有回归保护。

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm --dir ai-digital-life/frontend vitest run dev/previewCrawlerGate.test.ts
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 接入 `vite.config.ts`**

在文件顶部追加 import：

```ts
import { pageMetaGateAllows } from './dev/previewCrawlerGate';
```

在 `/__adl_preview_api__/browser/page-meta` 分支（当前 line 86 起）`const targetUrl = searchParams.get('url');` 与参数校验之后、`try { const controller = new AbortController(); ... fetch(targetUrl...)` 之前插入 HTML 门控：

```ts
            // 合规爬虫门控：robots.txt Disallow 硬跳过（私网豁免 / fail-open 见辅助函数）。
            if (!(await pageMetaGateAllows(targetUrl))) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.statusCode = 200;
              res.end(JSON.stringify({ title: '', favicon: '', faviconDataUri: '', url: targetUrl }));
              return;
            }
```

并在 favicon 下载之前（`let faviconDataUri = ''; if (favicon && (...)) {` 处）加 favicon 门控：

```ts
              let faviconDataUri = '';
              if (
                favicon &&
                (favicon.startsWith('http://') || favicon.startsWith('https://')) &&
                (await pageMetaGateAllows(favicon))
              ) {
                try {
                  const iconController = new AbortController();
                  const iconTimeout = setTimeout(() => iconController.abort(), 5000);
                  const iconResp = await fetch(favicon, {
                    signal: iconController.signal,
                    headers: { 'User-Agent': USER_AGENT },
                  });
                  clearTimeout(iconTimeout);
                  // ...其余原逻辑不变
```

> 保持中间件其余逻辑（HTML 解析、favicon data-URI、错误兜底）不变。Vite 中间件里调用 `fetch`（HTML）与 `iconResp` 已有原 UA 头，无需改动。

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm --dir ai-digital-life/frontend vitest run dev/previewCrawlerGate.test.ts dev/crawlerPolicy.test.ts dev/crawlerRobots.test.ts
pnpm --dir ai-digital-life/frontend run typecheck
pnpm --dir ai-digital-life/frontend run lint
```

Expected: PASS；typecheck 0 errors；lint 0 errors（允许 pre-existing warnings）。

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/frontend/vite.config.ts ai-digital-life/frontend/dev/previewCrawlerGate.ts ai-digital-life/frontend/dev/previewCrawlerGate.test.ts
git commit -m "feat(frontend): wire robots gate into preview page-meta middleware"
```

---

### Task 6: "始终新建标签页"按钮（Design 2）

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/browser/useBrowserPanelHandlers.ts`
- Modify: `ai-digital-life/frontend/src/app/features/browser/BrowserPanelActionsContext.ts`
- Modify: `ai-digital-life/frontend/src/app/features/browser/BrowserPanel.tsx`
- Modify: `ai-digital-life/frontend/src/app/features/browser/BrowserNavigator.tsx`
- Modify: `ai-digital-life/frontend/src/app/i18n/en-US/browser.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/browser.ts`
- Create: `ai-digital-life/frontend/src/app/features/browser/useBrowserPanelHandlers.test.ts`

**Interfaces:**
- Consumes: `browserOpenTab`（store action，签名 `(url?: string, title?: string, folderId?: string) => void`）。
- Produces:
  - `useBrowserPanelHandlers` 新增返回 `handleAlwaysNewTab: (title: string) => void`
  - `BrowserPanelActions` 接口新增 `handleAlwaysNewTab: (title: string) => void`
  - i18n 新增 `browserNewTabAlways`：zh `始终新建标签页` / en `Always new tab`

- [ ] **Step 1: 写失败测试（`useBrowserPanelHandlers.test.ts`）**

```ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBrowserPanelHandlers } from './useBrowserPanelHandlers';

function setup(browserNavigateInPlace: boolean) {
  const browserOpenTab = vi.fn();
  const browserNavigateActiveTab = vi.fn();
  const browserSelectTab = vi.fn();
  const setBrowserNavigateInPlace = vi.fn();
  const { result } = renderHook(() =>
    useBrowserPanelHandlers({
      browserOpenTab,
      browserNavigateActiveTab,
      browserSelectTab,
      browserNavigateInPlace,
      setBrowserNavigateInPlace,
    }),
  );
  return { result, browserOpenTab, browserNavigateActiveTab, browserSelectTab };
}

describe('useBrowserPanelHandlers.handleAlwaysNewTab', () => {
  it('opens a new tab regardless of the navigate-in-place toggle', () => {
    for (const inPlace of [true, false]) {
      const { result, browserOpenTab } = setup(inPlace);
      act(() => result.current.handleAlwaysNewTab('New tab page'));
      expect(browserOpenTab).toHaveBeenCalledWith(undefined, 'New tab page');
      expect(browserOpenTab).toHaveBeenCalledTimes(1);
    }
  });
});

describe('useBrowserPanelHandlers.handleOpenTabFromTree (regression)', () => {
  it('keeps respecting the toggle', () => {
    const { result, browserNavigateActiveTab, browserSelectTab, browserOpenTab } = setup(true);
    act(() => result.current.handleOpenTabFromTree('https://x.com'));
    expect(browserNavigateActiveTab).toHaveBeenCalledWith('https://x.com');
    expect(browserSelectTab).not.toHaveBeenCalled();
    expect(browserOpenTab).not.toHaveBeenCalled();
  });

  it('existing tab switch still unaffected by toggle', () => {
    const { result, browserSelectTab, browserNavigateActiveTab } = setup(true);
    act(() => result.current.handleOpenTabFromTree('https://x.com', 'tab-1'));
    expect(browserSelectTab).toHaveBeenCalledWith('tab-1');
    expect(browserNavigateActiveTab).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm --dir ai-digital-life/frontend vitest run src/app/features/browser/useBrowserPanelHandlers.test.ts
```

Expected: FAIL（`handleAlwaysNewTab` 不存在）。

- [ ] **Step 3: 实现 handlers + 接口 + 接线**

`useBrowserPanelHandlers.ts`：

```ts
export interface UseBrowserPanelHandlersResult {
  pendingNavigationsRef: React.MutableRefObject<Set<string>>;
  handleNavigationStart: (url: string) => void;
  handleOpenTabFromTree: (url: string, tabId?: string) => void;
  handleToggleNavigateMode: (checked: boolean) => void;
  handleAlwaysNewTab: (title: string) => void;
  handlePointerDown: (e: React.PointerEvent) => void;
}
```

在 `handleToggleNavigateMode` 之后新增：

```ts
  // "已打开的标签"模式下的 "+" 按钮：始终新建标签页，不受 browserNavigateInPlace 影响。
  // 与 handleOpenTabFromTree（受开关影响）语义区分。
  const handleAlwaysNewTab = useCallback(
    (title: string) => {
      browserOpenTab(undefined, title);
    },
    [browserOpenTab],
  );
```

返回对象追加 `handleAlwaysNewTab`。

`BrowserPanelActionsContext.ts` 接口追加：

```ts
  handleAlwaysNewTab: (title: string) => void;
```

`BrowserPanel.tsx`：
- 在 `useBrowserPanelHandlers(...)` 解构处追加 `handleAlwaysNewTab`；
- 在 `actionsValue` 对象（line 341 附近）与 deps 数组（line 384 附近）各追加 `handleAlwaysNewTab`。

- [ ] **Step 4: i18n 新增 key**

`zh-CN/browser.ts`（在 `browserNewTabBtn` 附近）追加：

```ts
  browserNewTabAlways: '始终新建标签页',
```

`en-US/browser.ts` 追加：

```ts
  browserNewTabAlways: 'Always new tab',
```

- [ ] **Step 5: 改 `BrowserNavigator.tsx`**

解构处（line 66-67 附近）追加 `handleAlwaysNewTab`：

```tsx
    browserOpenTab,
    handleOpenTabFromTree,
    handleAlwaysNewTab,
```

替换 open 模式 "+" 按钮逻辑（line 209-213）：

```tsx
                  if (navigatorMode === 'tabs') {
                    const path = selectedTreePathRef.current;
                    if (!path || (!path.startsWith('folder:') && !path.startsWith('workspace:'))) {
                      showToast(t.browserSelectDirFirst, 'warning');
                      return;
                    }
                    let wsId: string | undefined;
                    let fId: string | undefined;
                    if (path.startsWith('workspace:')) {
                      wsId = path.slice('workspace:'.length);
                    } else if (path.startsWith('folder:')) {
                      fId = path.slice('folder:'.length);
                      wsId = resolveFolderWorkspaceId(fId, browserTabFolders);
                    }
                    setCreateTabDialog({ open: true, workspaceId: wsId, folderId: fId });
                  } else {
                    // open 模式：始终新建标签页，不受 browserNavigateInPlace 影响
                    handleAlwaysNewTab(t.browserNewTabPage);
                  }
```

替换 tooltip（line 187）与 aria-label（line 215）中 open 分支文案：

```tsx
              content={navigatorMode === 'tabs' ? t.browserNewTab : t.browserNewTabAlways}
              ...
                aria-label={navigatorMode === 'tabs' ? t.browserNewTab : t.browserNewTabAlways}
```

> 若 `browserNewTabBtn` 不再被引用，检查是否还有其他使用处；本文件内仅此两处，替换后 `browserNewTabBtn` 可保留（其他区域可能仍在用，如 Landing 页），无需删除 key。若 tsc 报未使用导入，按 lint 处理。

- [ ] **Step 6: 运行测试确认通过**

```bash
pnpm --dir ai-digital-life/frontend vitest run src/app/features/browser/useBrowserPanelHandlers.test.ts
pnpm --dir ai-digital-life/frontend vitest run src/app/i18n/__tests__/keys.test.ts
pnpm --dir ai-digital-life/frontend run typecheck
pnpm --dir ai-digital-life/frontend run lint
```

Expected: PASS；parity 检查通过；typecheck 0 errors。

- [ ] **Step 7: 提交**

```bash
git add ai-digital-life/frontend/src/app/features/browser/useBrowserPanelHandlers.ts ai-digital-life/frontend/src/app/features/browser/useBrowserPanelHandlers.test.ts ai-digital-life/frontend/src/app/features/browser/BrowserPanelActionsContext.ts ai-digital-life/frontend/src/app/features/browser/BrowserPanel.tsx ai-digital-life/frontend/src/app/features/browser/BrowserNavigator.tsx ai-digital-life/frontend/src/app/i18n/en-US/browser.ts ai-digital-life/frontend/src/app/i18n/zh-CN/browser.ts
git commit -m "feat(frontend): make open-mode plus button always open a new tab"
```

---

### Task 7: Tooltip 原生 `title` 优化 + i18n 文案（Design 3）

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/browser/BrowserNavModeSwitch.tsx`
- Modify: `ai-digital-life/frontend/src/app/features/browser/BrowserToolbar.tsx`
- Modify: `ai-digital-life/frontend/src/app/features/browser/BrowserNavigator.tsx`
- Modify: `ai-digital-life/frontend/src/app/i18n/en-US/browser.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/browser.ts`
- Create: `ai-digital-life/frontend/src/app/features/browser/BrowserNavModeSwitch.test.tsx`

**Interfaces:**
- Consumes: `browserNavigateInPlace`、`t`（useTCopy）。
- Produces:
  - `BrowserNavModeSwitch` 新增 prop `title?: string`（渲染到原生 `title` 属性）
  - i18n 重命名 `browserDeleteAllTabDirs` → `browserDeleteAllBookmarks`，值改为"删除工作区与非工作区全部书签（保留目录结构）"
  - i18n `browserOpenTabs` 值改为"已打开标签页"（zh）/ `Open Tabs`（en 不变）

- [ ] **Step 1: 写失败测试（`BrowserNavModeSwitch.test.tsx`）**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserNavModeSwitch } from './BrowserNavModeSwitch';

describe('BrowserNavModeSwitch native title', () => {
  it('renders the native title attribute from the title prop', () => {
    render(
      <BrowserNavModeSwitch
        checked={false}
        onCheckedChange={() => {}}
        leftLabel="New tab"
        rightLabel="Current tab"
        title="Current tab: sidebar/address bar links open in active tab"
      />,
    );
    expect(screen.getByRole('switch')).toHaveAttribute(
      'title',
      'Current tab: sidebar/address bar links open in active tab',
    );
  });

  it('keeps aria-label from labels when no title is given', () => {
    render(
      <BrowserNavModeSwitch
        checked={true}
        onCheckedChange={() => {}}
        leftLabel="New tab"
        rightLabel="Current tab"
      />,
    );
    const switchEl = screen.getByRole('switch');
    expect(switchEl).toHaveAttribute('aria-label', 'Current tab');
    expect(switchEl).not.toHaveAttribute('title');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm --dir ai-digital-life/frontend vitest run src/app/features/browser/BrowserNavModeSwitch.test.tsx
```

Expected: FAIL（`title` 属性未渲染）。

- [ ] **Step 3: 改 `BrowserNavModeSwitch.tsx`**

接口追加 `title?: string`，并在 `motion.button` 上传递：

```tsx
interface BrowserNavModeSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  leftLabel: string;
  rightLabel: string;
  title?: string;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
  onFocus?: (e: React.FocusEvent) => void;
  onBlur?: (e: React.FocusEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
}

export function BrowserNavModeSwitch({
  checked,
  onCheckedChange,
  leftLabel,
  rightLabel,
  title,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  onClick,
}: BrowserNavModeSwitchProps) {
  // ...unchanged...
      <motion.button
        className="adl-browser-nav-mode-switch"
        style={{ justifyContent: checked ? 'flex-end' : 'flex-start' }}
        whileTap="tap"
        initial={false}
        onTapStart={() => setIsTapped(true)}
        onTapCancel={() => setIsTapped(false)}
        onTap={() => setIsTapped(false)}
        aria-label={checked ? rightLabel : leftLabel}
        title={title}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={onClick}
      >
```

- [ ] **Step 4: 改 `BrowserToolbar.tsx`**

移除包住 `BrowserNavModeSwitch` 的 `TooltipSimple`（line 121-131），改为直接渲染并传 `title`：

```tsx
        <BrowserNavModeSwitch
          checked={browserNavigateInPlace}
          onCheckedChange={handleToggleNavigateMode}
          leftLabel={t.browserNavigateNewTab}
          rightLabel={t.browserNavigateInPlace}
          title={browserNavigateInPlace ? t.browserNavigateInPlace : t.browserNavigateNewTab}
        />
```

> 若 `TooltipSimple` 在文件内仍有其他使用（前进/后退/刷新等按钮都有），import 保留；否则按 lint 清理未使用 import。

- [ ] **Step 5: i18n 文案与 key 重命名**

`zh-CN/browser.ts`：
- `browserOpenTabs: '已打开的标签'` → `'已打开标签页'`
- `browserDeleteAllTabDirs: '删除工作区与非工作区全部标签 （保留目录结构）'` → 重命名并改值：

```ts
  browserDeleteAllBookmarks: '删除工作区与非工作区全部书签（保留目录结构）',
```

`en-US/browser.ts`：
- `browserOpenTabs: 'Open Tabs'`（保持不变，语义已一致）
- `browserDeleteAllTabDirs: 'Delete all workspace and custom directory tabs (keep directory structure)'` → 重命名：

```ts
  browserDeleteAllBookmarks:
    'Delete all workspace and custom directory bookmarks (keep directory structure)',
```

- [ ] **Step 6: 改 `BrowserNavigator.tsx` 删除书签按钮（line 251-260）**

移除 `TooltipSimple`，改原生 `title` + 新 key：

```tsx
          <span
            style={{ display: navigatorMode === 'tabs' || navigatorMode === 'list' ? '' : 'none' }}
          >
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
              onClick={() => handleClearTabDirectories()}
              aria-label={t.browserDeleteAllBookmarks}
              title={t.browserDeleteAllBookmarks}
            >
              <IconTrash size={14} decorative />
            </button>
          </span>
```

> 同步检查 `browserDeleteAllTabDirs` 的全部引用点并改为 `browserDeleteAllBookmarks`：
> - `BrowserNavigator.tsx:251/256`（本步完成）
> - 注意：`browserTreeEntryUtils.tsx:184` 与 `browserEntrySubEntriesUtils.tsx:116` 使用的是 `browserDeleteAllTabsHint`（context-menu hint），**不是** `browserDeleteAllTabDirs`，无需改动。用 `rg "browserDeleteAllTabDirs"` 全库确认无残留。

- [ ] **Step 7: 运行测试确认通过**

```bash
rg -n "browserDeleteAllTabDirs" ai-digital-life/frontend/src || echo "no stale refs"
pnpm --dir ai-digital-life/frontend vitest run src/app/features/browser/BrowserNavModeSwitch.test.tsx src/app/i18n/__tests__/keys.test.ts
pnpm --dir ai-digital-life/frontend run typecheck
pnpm --dir ai-digital-life/frontend run lint
```

Expected: 无残留引用；PASS；typecheck/lint 通过。

- [ ] **Step 8: 提交**

```bash
git add ai-digital-life/frontend/src/app/features/browser/BrowserNavModeSwitch.tsx ai-digital-life/frontend/src/app/features/browser/BrowserNavModeSwitch.test.tsx ai-digital-life/frontend/src/app/features/browser/BrowserToolbar.tsx ai-digital-life/frontend/src/app/features/browser/BrowserNavigator.tsx ai-digital-life/frontend/src/app/i18n/en-US/browser.ts ai-digital-life/frontend/src/app/i18n/zh-CN/browser.ts
git commit -m "feat(frontend): use native title tooltips and refine bookmark/open-tabs copy"
```

---

### Task 8: Tooltip 规则放宽（治理/文档）

**Files:**
- Modify: `.agents/rules/ui-patterns.md`
- Modify: `.agents/rules/design-system.md`
- Modify: `AGENTS.md`
- Modify: `ai-digital-life/AGENTS.md`
- Modify: `.agents/rules/desktop-ui-verification.md`
- Modify: `.opencode/rules/ui-patterns.md`、`.opencode/rules/design-system.md`
- Modify: `.trae/rules/ui-patterns.md`、`.trae/rules/design-system.md`

> 这是纯文档/治理变更，不改变运行时行为，无需红绿测试，但必须保持规则副本同步一致。

- [ ] **Step 1: 改真源 `.agents/rules/ui-patterns.md` §9**

将 §9 现有表述（line 304-315）替换为：

```markdown
## 9. Tooltip

### 方案选择

- **可选方案**：`TooltipSimple`（便捷组件）、`Tooltip` + `TooltipTrigger` + `TooltipContent`（组合模式）、系统原生 `title` 属性。
- **决策方式**：自定义 Tooltip 与原生 `title` 均可使用，**开发时由用户决策**，不预设硬性绑定。
- 参考：
  - `TooltipSimple` 适用于多数按钮提示。
  - 原生 `title` 适用于轻量纯文本提示（无定位/动画需求）。
- 文件：[Tooltip.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/components/Tooltip.tsx)
```

- [ ] **Step 2: 改真源 `.agents/rules/design-system.md` Tooltip 行**

line 16 替换为：

```markdown
| Tooltip | 自定义 Tooltip 组件与原生 `title` 均可使用，具体方案开发时由用户决策（详见 [ui-patterns.md](../../../.agents/rules/ui-patterns.md#9-tooltip)） |
```

- [ ] **Step 3: 改根 `AGENTS.md` 禁止项**

删除 line 91 `- 混合使用多种 Tooltip 方案（例外：纯文本路径展示可使用原生 \`title\`，见 [ui-patterns.md](../../../.agents/rules/ui-patterns.md#9-tooltip)）` 整行。

- [ ] **Step 4: 改 `ai-digital-life/AGENTS.md` 设计系统约束 Tooltip 行**

将 `| Tooltip | 优先使用 TooltipSimple 组件。对于文件/路径展示等需要系统原生复制行为的场景，可根据实际判断使用原生 title 属性 |` 替换为：

```markdown
| Tooltip | 自定义 Tooltip 组件与原生 `title` 均可使用，具体方案开发时由用户决策 |
```

- [ ] **Step 5: 改 `.agents/rules/desktop-ui-verification.md:43`**

`| Tooltip 组件 / 原生 \`title\` 残留检查 | 两模式一致 |` 替换为：

```markdown
| Tooltip 方案（自定义组件/原生 `title`）双端一致检查 | 两模式一致 |
```

- [ ] **Step 6: 同步副本到 `.opencode/rules/` 与 `.trae/rules/`**

复制更新后的 `ui-patterns.md`、`design-system.md` 到 `.opencode/rules/` 与 `.trae/rules/`（与真源逐字一致）。

- [ ] **Step 7: 校验同步一致**

```bash
git diff --stat
# 逐对 diff 确认副本一致：
diff <(Get-Content .agents/rules/ui-patterns.md) <(Get-Content .opencode/rules/ui-patterns.md)
diff <(Get-Content .agents/rules/design-system.md) <(Get-Content .trae/rules/design-system.md)
```

（PowerShell 下可用 `git diff --no-index` 替代 `<(...)` 进程替换。）

- [ ] **Step 8: 提交**

```bash
git add .agents/rules/ui-patterns.md .agents/rules/design-system.md .agents/rules/desktop-ui-verification.md AGENTS.md ai-digital-life/AGENTS.md .opencode/rules/ui-patterns.md .opencode/rules/design-system.md .trae/rules/ui-patterns.md .trae/rules/design-system.md
git commit -m "docs: relax tooltip scheme rules to user-decision"
```

---

## Self-Review

### 1. Spec coverage

| Spec 需求 | 覆盖任务 |
|-----------|----------|
| 机器人 UA（双端） | Task 3（browser.rs + userAgent.ts） |
| robots.txt 解析器（Rust 纯函数） | Task 1 |
| robots.txt 解析器（Vite 纯函数） | Task 4 |
| robots 缓存（TTL 1h） | Task 2（Rust）/ Task 4（TS） |
| 域名限速（5s/次） | Task 2 / Task 4 |
| 私网豁免（localhost/127.x/192.168.x/解析失败） | Task 2 / Task 4 |
| robots 拉取失败 fail-open | Task 3 gate / Task 4 robotsAllowFetch / Task 5 |
| Disallow 硬跳过返回空 PageMeta | Task 3 / Task 5 |
| favicon 下载前 robots 门控 | Task 3 / Task 5 |
| 抓取流程时序（robots → 限速 → 抓 HTML → favicon 门控） | Task 3（Tauri）/ Task 5（Vite） |
| 保持 dedup/超时/截断/三层缓存/Google S2 | 未改动（Task 3 只加门控） |
| 不做 ETag/304、不做 Crawl-delay 执行 | 未实现（符合非目标） |
| Design 2：open 模式 "+ "始终新建标签 | Task 6 |
| Design 2：新 i18n `browserNewTabAlways` | Task 6 Step 4 |
| Design 3：导航开关 Tooltip → 原生 title | Task 7 |
| Design 3：删除书签按钮 Tooltip → 原生 title | Task 7 |
| Design 3：i18n 重命名 `browserDeleteAllBookmarks` + 值改"书签" | Task 7 |
| Design 3：`browserOpenTabs` 值改"已打开标签页" | Task 7 |
| Design 3：规则放宽（5 个规则文件 + 同步副本） | Task 8 |
| 双端一致性（Rust + Vite 同语义） | Task 3 + Task 5（镜像实现 + 各自测试） |

### 2. Placeholder scan

- 所有步骤均含真实代码/命令，无 "TBD/TODO/类似 Task N"。
- Task 3 中"包名请以实际为准"为可选提示而非占位实现；`cargo test --workspace` 兜底可执行。
- 常量表（UA 字符串、TTL、窗口）在各任务内均给出精确值。

### 3. Type consistency

- `robots_allow_fetch`（Rust）/ `robotsAllowFetch`（TS）签名一致（含 fail-open 语义）。
- `RobotsRules::is_allowed`（Rust）/ `isAllowed`（TS）路径与 UA 参数一致；`longest_match` / `longestMatch` 均返回 `Option<usize>` / `number | null`。
- `RobotsCache.get/insert`、`DomainRateLimiter.tryAcquire` 双端一致（Rust 用 `Instant`，TS 用 `now: number`，语义相同）。
- `handleAlwaysNewTab: (title: string) => void` 在 handler 结果、Actions 接口、`BrowserPanel.tsx` 接线三处一致。
- `browserDeleteAllBookmarks` / `browserNewTabAlways` 在 en/zh 双端同步，`keys.test.ts` parity 强制校验。

---

## Execution Handoff

计划已保存至 `docs/superpowers/plans/2026-08-14-browser-crawler-compliance-and-always-new-tab.md`。两种执行方式：

**1. Subagent-Driven（推荐）** — 每个任务派发独立子代理，任务间做两阶段审查，快速迭代。

**2. Inline Execution** — 在当前会话内按 executing-plans 批量执行，带检查点审查。

请选择执行方式。
