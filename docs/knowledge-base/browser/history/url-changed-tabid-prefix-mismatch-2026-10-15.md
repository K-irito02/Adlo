# url-changed 事件 tabId 口径 mismatches — 2026-10-15

## 问题现象

Tauri 下地址栏粘贴网址回车打开后，"历史目录"始终不出现该条目；提交链路、Rust 侧事件均正常。

## 根因分析

事件链逐层核对（提交日志 → Rust `HistoryChanged RECEIVED` → 前端缺席）：

| 层 | 实际发出/期望的 tabId |
|----|----------------------|
| Rust `browser_create_for_tab(tab_id)` → handler 绑定 | 前端 browser tab id（`browser-xxx`，`createUiId('browser')`） |
| WebView label（`webview_label()`） | `adl-browser-view-{tab_id}`（仅 label 带前缀） |
| 前端 `useBrowserUrlChange.ts` 过滤器（9c9199dc 引入） | 要求 `tabId.startsWith('adl-browser-view')` |

前缀只存在于 WebView **label**，从未作为事件 **tabId** 发出 → 过滤器恒不命中 → 全部池导航事件被吞。附带伤害：跨域重定向处理、音频关联、SPA 历史补写等整条 `onUrlChanged` 下游全断流，而提交链路本身对直接 URL（非搜索词）又不写历史（`browserSlice` 注释声称 `handlePageMeta` 建条目，经核查从未调用 `browserAddToHistory`），故必现。

## 修复

前缀判断改为已知标签归属判定（`isPoolTabEvent`，下沉 `browserUrlUtils.ts` + 单测）：
未知 tabId（DSH 独立子窗口等非池 WebView）仍丢弃——保留 9c9199dc 防幻影标签原意；
无 tabId 走既有分支；显式导航新建 tab 凭 `expectedNavigationUrlRef` 豁免竞态窗口。

## 经验

1. **事件 id 口径以后端发出为准**：label ≠ id。加过滤器前先到发出端确认实际载荷（本例看一眼 `emit_url_changed` 调用点即破）。
2. **防御性过滤器必须有正向用例**：9c9199dc 的过滤器若配一个"池事件放行"的单测，恒杀问题当天即暴露。
3. **注释声称的写入点要 grep 验证**：`browserSlice` 注释写 `handlePageMeta 建条目`，实际零调用——注释即代码审查项。
