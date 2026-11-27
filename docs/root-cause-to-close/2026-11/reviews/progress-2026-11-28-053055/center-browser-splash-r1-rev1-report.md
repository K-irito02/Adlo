## 范围

- scope：center-browser-splash
- phase：r1
- rev：1
- base：`b3aa37ec45316dba2dd8b677419a6a216c2020d8`（只读 rev1 快照）
- 文件（4，均本 scope owner）：
  - adlo/frontend/src/app/App.tsx（仅注释）
  - adlo/frontend/src/app/features/center/CenterBrowserView.tsx
  - adlo/frontend/src/app/features/center/centerOverlay.ts
  - adlo/frontend/src/app/features/center/__tests__/CenterBrowserView.test.tsx
- 未运行测试套件（未跑 check:changed / vitest / cargo test），未启动任何服务或端口，未运行 git diff/log/show。
- 只读上下文：useBrowserViewHost.ts、useWebViewBounds.ts、useWebViewVisibility.ts、useWebViewLifecycle.ts、browserPoolSingleton.ts、BrowserPanel.tsx、useCenterObscured.ts、CenterPane.tsx、uiSlice.ts、dividerStripLogic.ts、src-tauri/src/commands/browser.rs、src-tauri/src/tauri_webview_handle.rs、crates/browser/src/browser_webview.rs。

## 上轮问题关闭情况（逐条：已关闭 / 未关闭 + 理由）

- 无上一轮 finding（rev1 首轮）。

## 新增发现

本轮无 finding。以下为核对结论（用于证明修复与回归保护成立，不构成 finding）：

- **根因路径已覆盖**：原生 WebView2 创建时本就屏外（`src-tauri/src/commands/browser.rs:187` 以 -10000 放置；`activate_tab` 只 `show()`，不改 bounds），回到屏内的唯一通道是前端 `setTabBounds` 应用容器矩形。本轮把开屏纳入 `computeCenterOverlayActive`（centerOverlay.ts:22）后：
  - `useWebViewBounds.updateWebViewBounds` 开头即按 `overlayActiveRef` 早退（useWebViewBounds.ts:59），ResizeObserver / window resize 入口（:124、:133）与首帧 RAF（:116）都汇流到该函数。
  - `useWebViewVisibility` 的 overlay 效应（:118-146）与 DOM 重叠解除回调（:101）都在 `overlayActiveRef` 为真时跳过恢复。
  - `useWebViewLifecycle` 激活后揭示（:421-433）与 `revealNow` → `updateWebViewBounds`（:130-143）同一门控。
  - 结果：开屏期间 `overlayActive=true`，即使 page-ready / 12s 兜底先到也只清加载态、不落 bounds；开屏结束后 overlay 转 false，再由 visibility 效应恢复定位（该效应依赖 `overlayActive` 变化，能触发；创建在途时由 lifecycle :421 依据 `overlayActiveRef` 自行补齐）。
- **与右侧面板口径一致**：`BrowserPanel.tsx:374-382` 的 `hasOverlayActive = !startupOverlayHidden || …` 与本函数新项同构；另一处既有消费者 `dividerStripLogic.ts:82` 也用 `startupOverlayHidden` 判定，说明该字段即「开屏期间原生子窗口应离屏」的既有约定，本轮只是把中心补齐，未引入新语义。
- **语义区分正确**：开屏只并入 `overlayActive`，未动 `isVisible` / `webViewDisabled`（CenterBrowserView.tsx:180-186 仍为 `visible=!centerObscured`、`disabled=centerObscured`）。这与面板 `webViewDisabled:false` 的既有分工一致：开屏不应阻止创建（提前在屏外加载），只应阻止落位。
- **回退方向安全**：`uiSlice.ts:78` 默认 `startupOverlayHidden:false`，即 App 的同步 effect 尚未运行时已按「开屏可见」处理，重启首帧不会出现「未开屏→已落位」的窗口期。
- **删除性推演（回归保护有效）**：
  - 删 `centerOverlay.ts:22` 的 `!flags.startupOverlayHidden`：`CenterBrowserView.test.tsx:159` `expect(hostProbe.overlayActive).toBe(true)` 变红（其余 flag 均 false）。
  - 删 `CenterBrowserView.tsx:172` 传入项：typecheck 因必填字段报错；即使绕过类型，运行时 `!undefined` 恒真使 `:165` 的 `.toBe(false)` 变红。
  - 删 `CenterBrowserView.tsx:77` 的 store 订阅：变量未定义直接编译/运行失败。
  - 组件接线由「真跑 CenterBrowserView（公共入口）+ 记录传给宿主 hook 的 overlayActive」观测，`hostProbe` 注释（test:39-40）已声明 jsdom 无原生子窗口，属合理观测点，非 `as unknown as` 私有偷看。
- **注释与实现逐句一致**：App.tsx:191-192、CenterBrowserView.tsx:75-76、centerOverlay.ts:6-10 的「与右侧面板同口径 / DOM 盖不住原生子窗口 / 开屏期间离屏」均与代码及现有约定相符；新增字段为必填，杜绝静默漏传。

## 记录不修

- （可选优化，不修）`!startupOverlayHidden` 在 `BrowserPanel.tsx:375` 与 `centerOverlay.ts:22` 各出现一次。抽取共享 helper 会把中心耦合到面板的浮层清单，收益低于耦合成本；按用户「与右侧面板同口径」的指定保留两处直写。
- （设计取舍，记录）`overlayHidden` 置真即放开 bounds，而 `StartupOverlayWrapper` 的 `exit` 淡出为 0.5s（`StartupOverlayWrapper.tsx:23`），原生面在淡出起始瞬间就会浮于仍半透明的 DOM 开屏之上。这是右侧面板既有口径、且用户已在桌面确认「没问题了」；若后续观感成为问题，改由 `onExitComplete` 驱动揭示，属独立改进。
- （既有边界，未实测，不属本轮）同一进程内的前端整页重载（Vite 全量 reload）会让上一会话的原生子 WebView 停在旧 bounds，而新会话池为空，本轮 overlay 门控触及不到未入池实例。本轮缺陷复现路径为进程重启（无残留实例），故不列为需修复；若日后 dev reload 复现同症状，单独收口。
- （测试补强，可选）`useBrowserViewHost.test.ts` 现有用例都用 `overlayActive:false`，没有「overlayActive=true 时不得 setTabBounds」的宿主级断言；本轮新用例锁定的是 flag 接线。该门控为既有实现（菜单/对话框已在用），属存量覆盖缺口，非本轮回归风险。
- （P5）`docs/root-cause-to-close/2026-11/progress-2026-11-28-053055.md` 的事实与表述同步留给 P5，不属 R1 范围。

## 结论

- 需修复项：0
- severity：critical/high/medium/low 各 0。
- 本轮零问题：根因修复到位，中心与面板口径一致，未发现其它会在开屏期间把中心 WebView 摆回屏内的路径；回归用例经删除性推演可有效变红。
