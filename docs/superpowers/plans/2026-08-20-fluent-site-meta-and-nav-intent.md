# 浏览器面板 favicon/标题无闪烁 + 软导航不重载 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除浏览器面板 favicon/标题的"兜底→真实"闪烁，并根治 SPA 刷/切视频时因响应式反向导航导致的整页重载。

**Architecture:** 事项1 采用 Chrome/Edge 式"按 origin 索引 + 兜底阶梯 + 站点首字母终级兜底"，查询期以 origin 回落复用同站点图标，未命中才显示首字母；事项2 把导航与展示解耦——`HistoryChanged`（软导航）只更新展示 URL/历史，真实导航仅由显式调用点（地址栏/后退/前进/历史/书签）通过 `navigateTab` 直接触发，移除 `useWebViewLifecycle` 中的响应式反向导航与一次性消费的 selfNav Set。

**Tech Stack:** Tauri 2 / React 19 + TS / Zustand / Rust (crates/browser) / ipc wrapper / 三桥 (tauri/preview/mock)。

## Global Constraints

- 不得破坏现有功能与 UI/UX（dev-rules 核心原则）。
- 前端禁止 `any`、禁止 `else`、`const` 优先、禁 import 别名、禁 star import（dev-rules 编码风格）。
- Rust 禁止 `unwrap()`，错误统一 `AppError`；use 三段式排序；内联 `#[cfg(test)]`（rust-patterns / rust-inline-cfg-test-pattern）。
- UI 展示文本必须 i18n key；空状态文字禁止句号结尾（dev-rules）。本计划新增的中文字面量仅用于调试 `console.warn`（非 UI 文案），可保留。
- 新增/修改 IPC 方法需三端对齐（`shared/ipc/browser.ts` + tauri/preview/mock bridge），返回 `IpcResult<T>`（bridge-three-implementation-pattern / error-handling）。
- 新增 Tauri Command 命名 `{domain}_{action}`（rust-command-domain-action-naming）；新增共享类型跨 IPC 需 serde 双注解 + `#[serde(rename_all = "camelCase")]`。
- 测试文件与被测模块同级 `__tests__/` 或 Rust 内联 `#[cfg(test)]`（frontend-test-tests-co-location）。
- 修复后：ESLint/Prettier/typecheck/clippy/rustfmt + 受影响部分测试（mandatory-testing；全量测试仅在 Phase 4 收尾执行一次）。
- 覆盖所有类型网站：无 favicon、非 SPA、多子域同 icon、`#` 锚点、redirect、BFCache back-forward。

---

### Task 1: favicon 查询加"origin 回落"（事项1 L2）

**Files:**
- Modify: `ai-digital-life/frontend/src/app/utils/siteMetaCache.ts`（在 `getCachedFavicon` 后新增两个函数的原位置）
- Modify: `ai-digital-life/frontend/src/app/utils/favicon.ts`
- Test: `ai-digital-life/frontend/src/app/utils/__tests__/favicon.test.ts`（若不存在则新建）

**Interfaces:**
- Consumes: `getCachedSiteMeta(url)`、`getCachedFavicon(url)`（均已在 siteMetaCache.ts 导出）。
- Produces:
  - `getOriginFaviconDataUri(url: string): string` — 遍历 memoryCache，返回**与 `url` 同 origin** 且非空的 `faviconDataUri`；无则 `''`。
  - `getOriginFaviconUrl(url: string): string` — 同上，返回 `faviconUrl`；无则 `''`。
  - `getFaviconUrl(url)` 新阶梯（favicon.ts 内联逻辑）。

- [ ] **Step 1: 写失败测试**

```ts
// __tests__/favicon.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getFaviconUrl } from '../favicon';
import {
  setSiteMetaBackendForTest,
  __mirrorUpsertForTest,
  buildCachedSiteMetaEntry,
  createMockSiteMetaBackend,
} from '../siteMetaCache';

describe('getFaviconUrl origin fallback', () => {
  beforeEach(() => {
    setSiteMetaBackendForTest(createMockSiteMetaBackend());
  });

  it('reuses the same-origin favicon for a different query/path variant', () => {
    // 站点 www.douyin.com 已有 base URL 条目（base modal 时长路径 => 缓存命中）
    __mirrorUpsertForTest(
      'https://www.douyin.com/search/music?type=general',
      buildCachedSiteMetaEntry('音乐合集', 'https://www.douyin.com/favicon.ico', 'data:image/x'),
    );
    // base 与 modal_id 形态 URL → 精确 miss，但应回落同 origin 图标
    const modalUrl =
      'https://www.douyin.com/search/music?modal_id=7556986863237696804&type=general';
    expect(getFaviconUrl(modalUrl)).toBe('data:image/x');
  });

  it('returns empty when no same-origin entry exists', () => {
    expect(getFaviconUrl('https://no-such-origin.test/p')).toBe('');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --dir frontend run test __tests__/favicon.test.ts`
Expected: FAIL（第二个断言失败：`getFaviconUrl(modalUrl)` 目前返回 `''`）。

- [ ] **Step 3: 实现 origin 回落**

在 `siteMetaCache.ts` 新增（放在 `getCachedFavicon` 附近）：

```ts
/** 解析 url 的 origin（scheme://host[:port]）；失败返回 ''。 */
export function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/** 遍历镜像，返回与 url 同 origin 的第一条条目（供非精确 URL 回落到站点图标）。 */
function findOriginEntry(url: string): SiteMetaCacheEntry | undefined {
  const origin = originOf(url);
  if (!origin) {
    return undefined;
  }
  for (const [cacheKey, entry] of memoryCache) {
    if (originOf(cacheKey) === origin) {
      return entry;
    }
  }
  return undefined;
}

export function getOriginFaviconDataUri(url: string): string {
  return findOriginEntry(url)?.faviconDataUri ?? '';
}

export function getOriginFaviconUrl(url: string): string {
  return findOriginEntry(url)?.faviconUrl ?? '';
}
```

修改 `favicon.ts`：

```ts
import {
  getCachedFavicon,
  getCachedSiteMeta,
  getOriginFaviconDataUri,
  getOriginFaviconUrl,
} from './siteMetaCache';

/**
 * 分级兜底阶梯（Chrome/Edge 式）：
 * L1 精确 URL data-URI → L1b 精确 URL faviconUrl → L2 同 origin data-URI →
 * L2b 同 origin faviconUrl → ''（组件据此显示"站点首字母"兜底）。
 */
export function getFaviconUrl(url: string): string {
  const dataUri = getCachedFavicon(url);
  if (dataUri) {
    return dataUri;
  }
  const exact = getCachedSiteMeta(url)?.faviconUrl;
  if (exact) {
    return exact;
  }
  const originDataUri = getOriginFaviconDataUri(url);
  if (originDataUri) {
    return originDataUri;
  }
  return getOriginFaviconUrl(url);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --dir frontend run test __tests__/favicon.test.ts`
Expected: PASS。

- [ ] **Step 5: Lint/格式/类型检查**

Run:
- `pnpm --dir frontend run lint:fix`
- `pnpm --dir frontend run format`
- `pnpm --dir frontend run typecheck`
Expected: 全部通过。

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/app/utils/siteMetaCache.ts ai-digital-life/frontend/src/app/utils/favicon.ts ai-digital-life/frontend/src/app/utils/__tests__/favicon.test.ts
git commit -m "feat(browser): favicon 分级兜底加 origin 回落"
```

---

### Task 2: 站点首字母终级兜底替换地球兜底（事项1 L4）

**Files:**
- Modify: `ai-digital-life/frontend/src/app/components/BrowserFavicon.tsx`
- Test: `ai-digital-life/frontend/src/app/components/__tests__/BrowserFavicon.test.tsx`（若不存在则新建）

**Interfaces:**
- Consumes: `getFaviconUrl(url)`（Task 1）、当前 `IconWorld` 兜底分支。
- Produces: 组件内 `siteInitial(url): string`（host 首字母，大写）；移除 `IconWorld` 作为 favicon 兜底的使用。

- [ ] **Step 1: 写失败测试**（新增首字母兜底断言；需先确认现有测试文件结构与 mock 方式——若已存在 `__tests__/BrowserFavicon.test.tsx` 则在其内追加用例，否则新建）

```tsx
// __tests__/BrowserFavicon.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BrowserFavicon } from '../BrowserFavicon';
// mock 使 getFaviconUrl('/favicon') 返回空，从而触发首字母兜底
vi.mock('../BrowserFavicon', ...); // 说明：按组件实际 prop 接口补全 mock
```

> 注意：本 step 的测试需先读 `BrowserFavicon.tsx` 当前 props（`url`、`title?`、`size?` 等）与实际渲染方式以写准确的断言。这一步的**验收判据**：当 `getFaviconUrl` 返回空时组件渲染首字母而非地球图标。

- [ ] **Step 2: 运行测试确认失败**

（路径以实际测试文件为准。）Expected: FAIL（当前渲染 `IconWorld`）。

- [ ] **Step 3: 实现首字母兜底 + 移除地球兜底**

在 `BrowserFavicon.tsx`：
- 新增 `function siteInitial(url: string): string`：解析 host，取首个字母大写（域名首字符为数字或非字母时回退 `'#'`），解析失败返回 `'#'`。
- 在"空缓存 / `degraded`"分支中，用首字母兜底渲染替换 `IconWorld`。
- **删除 `IconWorld` 在 favicon 兜底处的使用**。删除前 `Grep` 确认 `IconWorld` 全部引用：若仅此处使用则删除图标用法（保留图标定义不影响，但按最小变更只改本组件）；若他处（文件树等）仍用则仅移除本组件内的引用。

```tsx
// 示意（以真实组件结构为准）：
function siteInitial(url: string): string {
  try {
    const host = new URL(url).hostname.charAt(0).toUpperCase();
    return /[A-Z0-9]/.test(host) ? host : '#';
  } catch {
    return '#';
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Expected: PASS。

- [ ] **Step 5: Lint/格式/类型检查**

Run: `pnpm --dir frontend run lint:fix`、`format`、`typecheck`。Expected: 通过。

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/app/components/BrowserFavicon.tsx <测试文件>
git commit -m "feat(browser): favicon 终级兜底改为站点首字母，移除地球占位"
```

---

### Task 3: Rust 新增 per-tab 显式导航意图（事项2 D1/D4）

**Files:**
- Create: `ai-digital-life/crates/browser/src/navigation_intent.rs`
- Modify: `ai-digital-life/crates/browser/src/lib.rs`（注册模块）
- Modify: `ai-digital-life/src-tauri/src/<browser 命令域>.rs`（新增 command，路径以实际为准，遵循 ipc()/ipc_try() 包装，见 tauri-command-ipc-wrapper-pattern）

**Interfaces:**
- Consumes: `crate::browser_events::should_emit_history_changed`（仅参照，不改）。
- Produces:
  - `pub fn mark_navigation_intent(tab_id: &str, url: &str)` — 登记一条 pending 显式导航意图（tab_id → url，单槽覆盖）。
  - `pub fn consume_navigation_intent(tab_id: &str, url: &str) -> bool` — 若待 URL 与该 tab 匹配则清除并返回 `true`；否则 `false`（用于 NavigationStarting/SourceChanged 到达时判定"本次是宿主显式导航"）。
  - Tauri command `browser_mark_navigation_intent(input)` → `IpcResult<()>`；三桥同步（见 Task 5）。

- [ ] **Step 1: 写失败测试**（Rust 内联 `#[cfg(test)]`）

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn intent_is_consumed_only_on_matching_url() {
        mark_navigation_intent("t1", "https://a.com/x");
        assert!(!consume_navigation_intent("t1", "https://a.com/y"));
        // 软导航 pushState 产生新 URL，不消费；宿主显式导航到匹配 URL 才消费
        assert!(consume_navigation_intent("t1", "https://a.com/x"));
        // 单槽：消费后为空
        assert!(!consume_navigation_intent("t1", "https://a.com/x"));
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl-browser navigation_intent`（crate 名以实际为准，先 `cargo check --workspace` 确认）。
Expected: 编译失败（模块不存在）或 FAIL。

- [ ] **Step 3: 实现 navigation_intent.rs**

```rust
use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::LazyLock;

/// Per-tab 显式导航意图（host 主动导航：地址栏/后退/前进/历史/书签/新标签）。
/// 单槽覆盖（只记最近一次显式导航）；软导航（SPA pushState）无 NavigationStarting，
/// 不会走到消费点，故宿主永不据此重新 Navigate。
static PENDING_INTENT: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn mark_navigation_intent(tab_id: &str, url: &str) {
    if let Ok(mut map) = PENDING_INTENT.lock() {
        map.insert(tab_id.to_string(), url.to_string());
    }
}

pub fn consume_navigation_intent(tab_id: &str, url: &str) -> bool {
    if let Ok(mut map) = PENDING_INTENT.lock() {
        if map.remove(tab_id).as_deref() == Some(url) {
            return true;
        }
    }
    false
}
```

（模块路径、crate 名 `adl-browser` 以 `crates/browser/Cargo.toml` 实际为准。）

- [ ] **Step 4: 运行测试确认通过 + lint**

Run: `cargo test -p adl-browser navigation_intent`；`cargo fmt --all`；`cargo clippy -p adl-browser --all-targets -- -D warnings`。
Expected: PASS / 无告警。

- [ ] **Step 5: 新增 Tauri command（ipc 包装）**

在浏览器命令域新增（示例；遵循 `ipc_try` 包装与集合类型约定）：

```rust
#[tauri::command]
pub fn browser_mark_navigation_intent(
    app: tauri::AppHandle,
    tab_id: String,
    url: String,
) -> Result<(), adl_errors::AppError> {
    adl_browser::navigation_intent::mark_navigation_intent(&tab_id, &url);
    Ok(())
}
```

并在 `invoke_handler` 注册。确认 `webview2_history.rs` 的 `HistoryChanged` 分支**不触发任何 Navigate**（当前已仅 `emit_url_changed`，无需改；保持就以注释/断言固化该行为）。

- [ ] **Step 6: 编译检查 + Commit**

Run: `cargo check --workspace`。Expected: 通过。
```bash
git add ai-digital-life/crates/browser/src/navigation_intent.rs ai-digital-life/crates/browser/src/lib.rs <tauri 命令文件>
git commit -m "feat(rust): 浏览器 per-tab 显式导航意图"
```

---

### Task 4: 前端移除响应式反向导航 + selfNav Set（事项2 根因修复）

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/browser/useWebViewLifecycle.ts`
- Modify: `ai-digital-life/frontend/src/app/features/browser/useBrowserUrlChange.ts`
- Modify: `ai-digital-life/frontend/src/app/features/browser/BrowserPanel.tsx`（移除 `webViewSelfNavigatedRef` 接线；若地址栏"当前标签"导航依赖 effect 则以显式 `navigateTab` 替换）

**Interfaces:**
- Consumes: `navigateTabInPool(tabId,url)`（显式调用点直接使用）；`browserMarkNavigationIntent(tabId,url)`（Task 5 桥接）。
- Produces: 移除 `webViewSelfNavigatedRef` 选项与自洽的导航语义；effect 只负责创建/激活/隐藏。

- [ ] **Step 1: 先确认显式导航调用链（重要，防回归）**

- `Grep` 地址栏提交路径：找到"current tab mode"导航入口（`browserNavigateActiveTab` / 地址栏 submit）。
- 确认：地址栏/历史/书签/新标签是否已直接调用 `navigateTabInPool`/`navigateTab`；若"当前标签"导航目前**依赖** `useWebViewLifecycle` 里那段 `urlChanged` 分支，则把导航移到显式调用点。
- 记录结论到 Task 4 备注（不要只靠记忆）。

- [ ] **Step 2: 移除 useWebViewLifecycle 的响应式导航**

删除 `useWebViewLifecycle.ts` 中 `activateOrCreate` 内的 `else if (urlChanged) { ... selfNav ... navigateTabInPool ... }` 分支（L133-165，含两侧 `console.warn` 调试日志），改为：WebView 已在池中时**仅激活，不导航**。同步移除接口选项 `webViewSelfNavigatedRef` 及其类型定义/解构。

```ts
// activateOrCreate 修改后：
const activateOrCreate = async () => {
  const currentTabId = tab.id;
  try {
    if (!isTabInPool(currentTabId)) {
      setLoadingTabId(currentTabId);
      await createWebViewForTab(currentTabId, tab.url, getResolvedTheme());
    }
    await activateTabInPool(currentTabId);
    webViewActiveRef.current = true;
    tabUrlMapRef.current.set(currentTabId, tab.url);
    // ...（保留原 loading 清理逻辑）
  } catch (e) {
    setLoadingTabId(null);
    throw e;
  }
};
```

- [ ] **Step 3: 移除 useBrowserUrlChange 的 selfNav 记录**

删除 `useBrowserUrlChange.ts` 中 `webViewSelfNavigatedRef` 相关：接口字段、`const set = webViewSelfNavigatedRef.current; set.add(...); ...evict...` 块（L246-260）、`console.warn('selfNav-recorded')`、以及参数/依赖数组中的引用。`onUrlChanged` 改为仅做展示 URL/历史更新与 `markUrlSeen`，不再维护导航标记。

- [ ] **Step 4: 更新调用方接线**

在 `BrowserPanel.tsx` 及 `useBrowserWebView.ts`/`useBrowserIframeState.ts` 中移除 `webViewSelfNavigatedRef` 的创建与传递。为显式导航调用点（地址栏/历史/书签/新标签）确保调用 `navigateTabInPool(tabId,url)` 并（在 Rust 侧用）`markNavigationIntent(tabId,url)`。

- [ ] **Step 5: 类型检查**

Run: `pnpm --dir frontend run typecheck`。Expected: 通过（无未使用变量/缺失 prop 报错）。

- [ ] **Step 6: 受影响测试 + Lint + Commit**

Run: `pnpm --dir frontend run test`（browser 相关用例）、`lint:fix`、`format`。
```bash
git add ai-digital-life/frontend/src/app/features/browser/useWebViewLifecycle.ts ai-digital-life/frontend/src/app/features/browser/useBrowserUrlChange.ts ai-digital-life/frontend/src/app/features/browser/BrowserPanel.tsx
git commit -m "fix(browser): 移除响应式反向导航，软导航不再触发重载"
```

---

### Task 5: IPC 三桥 / 能力 对齐（事项2 D4 闭环 + 双端一致）

**Files:**
- Modify: `ai-digital-life/frontend/src/shared/ipc/browser.ts`
- Modify: tauri bridge（`frontend/src/tauri-bridge/.../browser*`）、preview bridge（`frontend/src/preview-bridge/...`）、mock bridge（`...mock.ts`）
- Modify: capability 文件（新增 command 权限，路径 `src-tauri/capabilities/*`）

**Interfaces:**
- Consumes: Rust command `browser_mark_navigation_intent`（Task 3）、前端 `BrowserBridge` 接口。
- Produces: `browser.markNavigationIntent(input:{ tabId:string; url:string }): Promise<IpcResult<unknown>>`；三桥相同签名。

- [ ] **Step 1: 定义接口（shared/ipc/browser.ts）**

```ts
export interface BrowserBridge {
  // ...existing
  /** 登记显式导航意图，供 Rust 在 NavigationStarting/SourceChanged 消费（避免软导航误当显式导航）。 */
  markNavigationIntent(input: { tabId: string; url: string }): Promise<IpcResult<unknown>>;
}
```

- [ ] **Step 2: 三桥实现**

- Tauri bridge：`invoke('browser_mark_navigation_intent', { tabId, url })` 包 `IpcResult<unknown>`。
- Mock bridge：`Promise.resolve({ ok: true, data: null })`。
- Preview bridge：调用对应后端（或 no-op）+ mock 语义，保证与 Tauri 行为一致。
- 遵循 `ipc()`/`IpcResult` 与错误类型 `AppError`（error-handling / bridge-three-implementation-pattern）。

- [ ] **Step 3: capability 注册**

在对应 capability 文件给新 command 添加权限条目（值以现有 browser 命令格式为准）。

- [ ] **Step 4: 双端一致核对**

确认浏览器模式 `handleIframeLoad` 的 `expectedNavigationUrlRef` 语义为"显式导航才有 navigate"（若当前若 iframe 直接被来源变化反向导航则收严；仅显式通过 `navigateBrowser` 触发的导航才 navigate）。

- [ ] **Step 5: 类型检查 + 受影响测试 + Commit**

Run: `pnpm --dir frontend run typecheck`、`test`、`lint:fix`、`format`。
```bash
git add ai-digital-life/frontend/src/shared/ipc/browser.ts <三桥文件> <capability 文件>
git commit -m "feat(browser): 显式导航意图 IPC 三桥对齐"
```

---

### Task 6: URL 归一化 + 回归验证（事项2/1 收尾）

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/browser/browserUrlUtils.ts`（如需补充 base≡modal_id 归一化；先确认 `normalizeUrlForCompare` 现有逻辑）
- Modify: `ai-digital-life/frontend/src/app/features/browser/useBrowserPageMeta.ts`（确认 `applyBroadcastUpdate` 合并守卫已阻止 `next:""` 清空；若仍有分支清空真实图标则补守卫）
- Test: 对应 `__tests__/`

**Interfaces:**
- Consumes: `normalizeUrlForCompare`、`applyBroadcastUpdate`（已含合并守卫）。
- Produces: 无新公共接口，仅收敛相等性判定与空值守卫。

- [ ] **Step 1: 审查 normalizeUrlForCompare**

`Read browserUrlUtils.ts`。若 `normalizeUrlForCompare` 已把 base 与 `modal_id=XXX` 视为不同 key 且参与 `urlChanged` 判定，则引入归一化：比较/写入统一剥离 `modal_id=...` 查询参数（先确认是否已有类似 `stripTrackingParams`）。

- [ ] **Step 2: 审查 applyBroadcastUpdate 空值守卫**

确认 `useBrowserPageMeta.ts` 走 `applyBroadcastUpdate`（已含"空字段保留既有值"合并守卫）。若日志 L286 `next:""` 仍可复现（即存在不走 `applyBroadcastUpdate`、直接清空 favicon 的分支），补成立即返回守卫；否则记录"已由合并守卫覆盖，无需改动"。

- [ ] **Step 3: 加对应单测**（归一化剥离 modal_id 的相等性；空广播不清空镜像）

```ts
// __tests__/browserUrlUtils.test.ts
it('treats base and modal_id variants as equal for compare key', () => {
  expect(normalizeUrlForCompare('https://a.com/search/music?type=general'))
    .toBe(normalizeUrlForCompare('https://a.com/search/music?modal_id=123&type=general'));
});
```

- [ ] **Step 4: 受影响全量回归（前端浏览器用例 + Rust browser crate）**

Run:
- `pnpm --dir frontend run test`（浏览器面板相关）
- `cargo test -p adl-browser`
- `pnpm --dir frontend run typecheck`、`lint:fix`、`format`、`cargo fmt --all`、`cargo clippy -p adl-browser --all-targets -- -D warnings`
Expected: 全部通过。

- [ ] **Step 5: 提交归一化 + 守卫收敛**

```bash
git add ai-digital-life/frontend/src/app/features/browser/ ai-digital-life/frontend/src/app/utils/ai-digital-life/frontend/src/app/utils/__tests__/
git commit -m "fix(browser): URL 归一化 + 空广播守卫收敛"
```

---

## 验证（修复实施后，人工 + 手动回归）

- 抖音：首次打开标签/历史条目即为真实 favicon/标题，无闪烁、无地球兜底。
- 抖音：刷/切视频不再整页重载（对照 `debug-logs-browser.txt` 不再出现 `urlChanged-decision/NAVIGATE-TAB`；Rust `[warn] navigate (POTENTIAL RELOAD SITE)` 仅出现在**显式**导航时）。
- 多类站点回归：无 favicon（显示首字母）、非 SPA、多子域同 icon、`#` 锚点、redirect、BFCache back-forward。
- 双端：Tauri 与浏览器模式行为一致。

## 未决/执行期要点

- Task 4 Step 1 必须先确认"地址栏 current-tab 导航"是否依赖旧 effect 分支；若依赖则为显式调用点补 `navigateTab`，确保不回归。
- Task 3 的 command 是否真正需要由前端每次显式导航调用：若显式调用点已直接 `navigateTab`（不经 effect），IPC 可作为"幂等硬约束"保留，但**不得造成额外 Navigate**——执行时以实测为准，若不再需要则降级为仅保留 Rust 表 + 单测（向后兼容用法）。