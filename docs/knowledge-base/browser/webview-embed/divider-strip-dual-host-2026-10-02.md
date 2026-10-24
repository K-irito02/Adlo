# 分隔线桥接条双宿主化：显隐判据、排序指纹与 Rust 全局互斥清除（2026-10-02）

## 背景

dsh 改为普通浏览器标签后，「中心-新建标签页」可承载任意网址，中心与右侧面板成为**两个对等宿主**，共享同一个浏览器 WebView 池。本轮（root-cause-resolution 事项 6/8/9 + closing-workflow 复审）完成三项机制改造，其中桥接条经历两次显隐判据返工，教训值得沉淀。

## 机制现状（final）

- **桥接条职责**：DOM 拖拽手柄命中带只有 3px 且位于**面板内部**（`::before { left: 8px }`，容器 `left: -8px`）。面板导航器收起时面板内容整体左移，面板自身 WebView 左缘与面板左缘重合，把命中带整条盖住 → 桥接条（6px 透明原生子 WebView，straddle 边界）抢回命中权。
- **显隐判据**（`shouldShowStrip`）：`panelWebViewAtBoundary` = 导航器收起 **且** 面板活动 tab 承载可见原生 WebView（`isLiveBrowserWebView`：有 URL、非 about:blank、已入池）。与中心状态、docked/overlay **无关**（overlay 态恰恰更需要它）。
- **排序指纹**（`stripGenerationKey`）：仅含 z-order 信号（中心 tabId / 面板活动 tabId / tab 数 / `siblingNonce`），**不含 URL**。
- **Rust 侧**：`activate_tab` 只 `show` 目标 tab；各宿主隐藏自己不再显示的 tab 由前端按 bounds 移出画面（`shouldHostHideTab` E1 守卫）。`WebViewHandle::hide()` 等死代码已删除。

## 教训

1. **显隐判据不能用单一几何代理**。「导航器收起 ⇒ WebView 压命中带」在生命周期页（about:blank/空 URL/未入池，WebView 已移出画面）是假阳性——透明原生子窗口会抢走本可命中的 DOM 手柄事件。正确做法：几何代理 **且** 「WebView 真实存活」复合判定（权威来源 = 浏览器池成员，与 `useWebViewLifecycle` 的移出画面口径同源）。
2. **收紧方向要选假阳性**：假阴性（该显示不显示）= 用户可感的「边界拖不动」故障；假阳性（多显示一条透明条）代价极小。面板侧 `hasBrowserTabs` 保持宽松、`panelWebViewAtBoundary` 只在两个条件都成立时才收紧，即按此不对称性设计。
3. **排序指纹只放 z-order 信号**。URL 参与指纹会让 SPA pushState/重定向链把指纹打穿，每次原地导航都触发条带销毁重建（无谓 show/hide IPC + 闪烁）。换标签已由 tabId 覆盖、视图重建已由 siblingNonce 覆盖。
4. **共享池后必须清除单宿主时代的全局互斥**。`activate_tab` 曾遍历整池隐藏除激活者外的全部 tab——第二宿主出现后，「面板激活自己的标签」会顺手隐藏中心 WebView 且无法自愈（宿主生命周期不重跑）。删除后经七个场景论证（同宿主切换/跨宿主移动/卸载/收起/overlay/池移除/重启水合）无「双可见覆盖」可达。
5. **tooltip 贴边容差**：紧贴标题栏的工具栏按钮（28px，顶部 44px）差 2px 就够不到 tooltip 需要的 46px，旧逻辑判「放不下」翻到 bottom 落进 WebView 避让矩形后被横轴滑移推到远缘。修复原则：**「不被裁切」是硬约束、「viewportPadding」是软约束**——软约束不足时钳进视口而非翻边；避让分支与 legacy 路径共用同一判据保证双端一致。
6. **收藏流程抽取**：宿主无关 hook 抽取时，已收藏分支的「取消收藏」必须**显式传本宿主**活动标签的 `(url,title)`——无参 `browserToggleBookmark()` 取的 `browserActiveTabId` 被 `clampPanelActiveTab` 恒夹到**面板**标签，中心侧会误删面板标签的书签。

## 关键文件

- `frontend/src/app/features/divider-strip/dividerStripLogic.ts`（纯逻辑：显隐/指纹/`isLiveBrowserWebView`）
- `frontend/src/app/features/divider-strip/useDividerStrip.ts`（编排：effect 顺序敏感——挂载清理必须先于 reconcile effect 声明）
- `frontend/src/app/features/center/useCenterObscured.ts`（浮层态 MutationObserver 过渡方案，已知残留竞态见 docstring）
- `crates/browser/src/browser_webview.rs`（`activate_tab` / `try_handle`）
- `frontend/src/app/utils/tooltipPosition.ts`（贴边容差）
