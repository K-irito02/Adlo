# 浏览器面板历史导航与标题提取修复（回退多击 / 标题卡首个视频 / 历史去重）

**日期**：2026-08-14
**范围**：修复内置浏览器面板的 B 站/YouTube 回退多击、回退首击刷新、标题卡在第一个视频、历史记录重复、新标签页回退按钮禁用态等问题。

## 背景

B 站/YouTube 等 SPA 视频站的导航行为导致原生历史栈冗余与标题过期：

1. **回退多击**：B 站 SPA 用 `pushState` 反复加/重排 tracking 参数（`vd_source`/`spm_id_from`/`trackid`），每条都是新的原生 WebView2 历史条目；且视频跳转常为「整页导航 + pushState」双条目（无斜杠 + 带斜杠），原生 `GoBack` 一次只退一条 → 需多次点击。
2. **回退首击刷新**：`HistoryChanged` 去重误杀 url-changed 事件 → 前端对 WebView 自发导航做冗余 `navigateTabInPool` → 整页重载。
3. **标题卡在第一个视频**：SPA 站点 `document.title`/`og:title` 固定为第一个视频，URL 经 pushState 前进；com 链路（DocumentTitleChanged / SPA 兜底）带「正确 URL + 过期标题」上报，前端无来源门控时 com 覆盖 http 抓取的正确标题。

## 解决方案：C1 + C2 + 标题来源门控三层

### C1：注入脚本历史 URL 归一化（源头消除冗余条目）

`crates/browser/src/init_script.js` 最外层包装 `history.pushState/replaceState`：
- URL 剥离 tracking 参数（`vd_source`/`spm_id_from`/`trackid`/`utm_*`/`gclid`/`fbclid`/`yclid`/`igshid` 等）+ 剩余参数排序 + 去尾部斜杠
- 归一化结果与当前位置相同时改用 `replaceState` → 原生历史不再产生冗余条目
- YouTube radio 自动播放参数（`list=RD...`/`start_radio`/`pp`/`index`）同步剥离
- 前端 `historyDedupKey`/`normalizedQueryForDedup`（`browserDisplayUtils.ts`）与 C1 `__adlNormalizeHistoryUrl` **双实现必须同步**，用 `__ADL_PURE` marker 提取真源测试防漂移

### C2：前端智能回退（循环 GoBack）

`useBrowserNavigation.ts` `smartGoBack`：一次用户点击后，订阅 `onUrlChanged`，若落点 URL 与起始 URL 的 `historyDedupKey` 相同（同一视频的斜杠/参数变体条目）则自动继续 GoBack，直到 key 真正变化或达上限（`SMART_BACK_MAX_STEPS=6`）。关键点：
- **hash 变化即停**（`#a → #b` 是真实锚点导航，不可跳过）
- **canGoBackTab 检查**（回退到原生栈底时 `setCanGoBack(false)` + 停止）
- **cancelled 标志**防在途 Promise 击穿重入保护

### can_go_back/can_go_forward 原生 IPC

- `WebViewHandle` trait + `TauriWebViewHandle` 用 `ICoreWebView2::CanGoBack/CanGoForward`（`mpsc::channel` 同步等待主线程回调）
- 前端 `useBrowserNavigation` 维护按钮状态，`BrowserToolbar` 回退/前进按钮 disabled
- 浏览器（iframe）模式用 `deriveIframeCanNavigate(index, entryCount)` 从 iframe 历史栈派生（双端一致）
- **Tauri 权限白名单必须登记新命令**（`digital-life.toml`）否则 invoke 被拦截静默返回 false

### 标题来源门控（provenance）

`useBrowserPageMeta.ts`：
- `isPlaceholderTitle`：空 / 等于 URL / 裸 hostname 视为占位
- `shouldApplyExactMatchTitle(currentTitle, url, incomingTitle, source, currentSource)`：`http`/`iframe` 恒可升级；`com` 仅可覆盖「占位」或「来源为 com/google」的标题（实时更新如 "(3)" 未读）；不可覆盖 http/iframe 抓取的标题
- `titleSourceRef` **按 tabId 隔离** provenance（同 URL 多标签防污染）
- activeTab 分支（meta 先于 onUrlChanged 时）同样门控标题并记录 provenance
- A2 `spawn_spa_fallback` 标题择优 `h1 → og:title → twitter:title → document.title`，h1 限定视频页（youtube `/watch`、bilibili/douyin `/video/`，域名 endsWith 精确匹配）

## 经验教训

### 1. WebView2 对单次导航会发射多次 HistoryChanged，去重窗口需按 ms 级设计

`HistoryChanged` 对一次 pushState 可能触发多次（去重窗口内只保留一次 url-changed）。但窗口**太宽会吞掉合法的快速回退**（用户 <窗口内回到同 URL → 事件被吞 → 前端失步）。实测 WebView2 的重复事件在**毫秒级**，去重窗口定 **500ms** 即可充分去重且不吞回退。窗口是「去重可靠性」与「回退响应」的权衡，取值前应实测重复事件间隔。

> **规则**：事件去重窗口应基于实测的重复事件间隔设计，而非拍脑袋设 2s 这类大值；窗口吞掉的合法事件会造成难查的时序 bug（回退失步、状态残留）。

### 2. `with_webview` 是异步投递到主线程的，闭包外立即读值永远是初始值

wry/tauri 的 `with_webview` 通过 `send_user_message` 把闭包**异步投递到主线程事件循环**执行，闭包执行晚于 `with_webview` 返回。用 `AtomicBool` 在闭包外立即读取 → **永远读到初始 false**（按钮永远禁用）。必须用 `mpsc::channel` 在闭包内 `tx.send(result)`、闭包外 `rx.recv_timeout(1000ms)` 阻塞等待。

> **规则**：任何依赖 `with_webview` 闭包内计算结果的调用，都必须通过同步通道等待回调执行完毕；直接读取会产生「貌似正确但永远初始值」的难查 bug。

### 3. init_script.js 是顺序同步执行的单个 IIFE，中段异常会阻止末尾包装器安装

init_script.js 的 click handler / window.open 重写 / nav-guard / meta 上报 / C1 包装按顺序执行。任何中段异常（如 `document.head` 为 null 时 `headObs.observe(null)`）会**中断外层 IIFE**，末尾的 C1 历史包装器永不安装 → pushState 未被归一化 → 原生历史栈膨胀（多击回退）。诊断：页面 `error` 事件上报 `page-error`；修复：**每段 IIFE 用 try/catch 隔离** + `if (head)` 保护。

> **规则**：注入脚本的多段功能必须逐段 try/catch 隔离，单段异常不能阻断后续功能安装；对 DOM 可用性（`document.head` 可能为 null）做显式保护。

### 4. 浏览器 tab 持久化 localStorage 会造成 vitest 全量测试偶发竞态

`browserTabs` 通过 `writeTabs` 持久化到 localStorage。测试若通过 `browserOpenTab`/`browserUpdateTab` 创建 tab（会写 localStorage），且 beforeEach 只 `useAppStore.setState` 重置内存而不清 localStorage，则 vitest 复用 worker 时 store 重新 hydration 会读到残留 tab → 跨 describe/文件污染（DEBUG 证据：断言里出现其他测试的 `title:'Q'` tab）。**必须同时清 localStorage keys**。

> **规则**：测试重置 store 时，若 store 有 localStorage 持久化，必须同步清空对应 storage keys；否则 worker 复用/重新 hydration 场景下出现偶发跨测试污染，且失败测试不固定（难排查）。

### 5. C1 push→replace 与 SPA history 库内部索引的已知权衡

C1 将「归一化后同 URL」的 pushState 转为 replaceState，与 React Router/history 库的内部栈索引可能产生分歧（库已按 push 推进索引，原生栈却被 replace）。仅在同 key push 场景触发，属预期权衡。合法多条目 push（含 `history.state.key` 区分）不受影响。

### 6. 前端/注入脚本双实现必须防漂移

`historyDedupKey`（前端）与 `__adlNormalizeHistoryUrl`（C1）是**两套独立实现**，参数列表、排序算法、radio 判定必须一致。防漂移手段：`__ADL_PURE` marker 提取真源 + 前端测试 eval 断言（`initScriptNavigation.test.ts`）；排序统一为 code-unit 比较（勿用 `localeCompare`，其 locale 依赖可能导致两端键不一致）。

## 相关文件

- 注入脚本：`crates/browser/src/init_script.js`
- 历史去重：`crates/browser/src/browser_events.rs`、`webview2_history.rs`
- 智能回退：`frontend/src/app/features/browser/useBrowserNavigation.ts`
- 标题门控：`frontend/src/app/features/browser/useBrowserPageMeta.ts`
- 去重键：`frontend/src/app/utils/browserDisplayUtils.ts`
- 原生 IPC：`src-tauri/src/tauri_webview_handle.rs`、`src-tauri/src/commands/browser.rs`
- SPA 兜底：`src-tauri/src/webview_event_bridge.rs`
- 进度归档：`docs/root-cause-resolution/2026-08/progress-2026-08-13-213811.md`
