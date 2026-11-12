# R1 终审报告 — 事项 1（点击“复制链接”隐藏 WebView2 / 地址栏展开不计入 overlay）rev3

## 范围

- 只读快照（rev3，base `3f7a4a8ecb71656a38aee09acd878c9dbfb0901b`，commits 3），仅看 `.review-diffs/*-rev3.diff`：
  - `adlo/frontend/src/app/components/CopyButton.tsx`
  - `adlo/frontend/src/app/components/__tests__/CopyButton.test.tsx`
  - `adlo/frontend/src/app/features/center/CenterBrowserView.tsx`
  - `adlo/frontend/src/app/features/center/centerOverlay.ts`（新增）
  - `adlo/frontend/src/app/features/center/__tests__/CenterBrowserView.test.tsx`（centerOverlay 的回归用例所在处）
  - `adlo/frontend/src/app/features/browser/useWebViewLifecycle.ts`
  - `adlo/frontend/src/app/features/browser/useBrowserViewHost.test.ts`
  - `adlo/frontend/src/app/features/browser/useBrowserUrlState.ts`
  - `adlo/frontend/src/app/features/browser/browserPoolSingleton.ts`
- 需求真源：`docs/root-cause-to-close/2026-11/progress-2026-11-12-145706.md` 事项 1；上轮报告 `.review-diffs/r1-item1-rev2-report.md`。
- 规约：共享简报（§5.1 测试有效性、§5.8 注释逐句相符）、根 `AGENTS.md`、`adlo/AGENTS.md`、`.agents/rules/mandatory-testing.md`、`review-judgements.md`。
- 未运行任何 git 命令，未修改源码/配置。实跑测试（只读）：
  - `pnpm --dir adlo/frontend run test -- CopyButton.test.tsx CenterBrowserView.test.tsx useBrowserViewHost.test.ts`
  - 汇总行（原样）：`Test Files  3 passed (3)` / `Tests  24 passed (24)`（CopyButton 7 / useBrowserViewHost 4 / CenterBrowserView 13）
  - 另跑 `CopyButton.test.tsx --reporter=verbose`：7 passed，无 act/console.error 噪声。

### 修复机制复核（先确认结论，再列问题）

1. **CopyButton `preventDefault`（CopyButton.tsx:65）**：机制成立。点击目标 span 的 `stopPropagation()` 只阻断 React 合成事件回溯，管不到 label 的**默认动作**；`preventDefault()` 置 cancel 标志后，label 激活不再向被标注的 input 转发 click，地址栏不会被二次展开。复制语义（clipboard / fallback / `markCopied`）在 `preventDefault()` 之后照常执行（CopyButton.tsx:67-107）。`TooltipSimple` → `TooltipTrigger` 合并的 `onClick`（Tooltip.tsx:139-142）不调用 `preventDefault`（useTooltip.ts:229-237），故用例中的 `defaultPrevented` 只可能由 CopyButton 置位。
2. **`addressExpanded` 移出 `centerOverlayActive`（CenterBrowserView.tsx:159-165 + centerOverlay.ts:20-26）**：几何上正确。地址栏在 `.adl-tool-context` 工具栏内（CenterBrowserView.tsx:394-446），展开态只改 `padding/gap/background` 与 `input{display}`（`browser-toolbar.css:25-31,61-73`），`.adl-tool-search` 无 `position:absolute`；内容区 `.adl-center-browser__content` 是同级兄弟（:476-530）。展开不覆盖内容区，因此不存在“WebView2 反过来盖住展开态地址栏”的反向问题；与面板宿主一致（`BrowserPanel.tsx:305-313` 的 `hasOverlayActive` 本就不含地址展开态）。
3. **`isLocalViewableFileUrl` 豁免（useWebViewLifecycle.ts:231）**：判据与地址栏提交口径一致；`file:///…/a.pdf` 命中 `DOWNLOAD_EXTENSIONS`（downloadUrl.ts:43）同时命中 `VIEWABLE_EXTENSIONS`（localFileInput.ts:28），豁免后不再被重启抑制分支跳过；非可渲染的 `file://…/setup.exe` 仍被抑制（localFileInput.ts:54-58）。
4. **`browserPoolSingleton` 第 7/8 实参（:95-104）**：与 `BrowserBridge.createForTab`（shared/ipc/browser.ts:35-49）、`tauri-browser.ts:9-28`、Rust `browser_create_for_tab`（browser.rs:25-35）逐位对齐；第 7 项为 `agentSiteRules: AgentSiteRule[]`，第 8 项为 `agentSiteOverrides: AgentSiteOverride[]`，与 `generalActions.ts:234-239` 的 `setAgentIntercept` 传参口径一致。

## 上轮问题关闭情况（逐条）

| 上轮项 | 结论 | 理由 |
| --- | --- | --- |
| rev2 N1（F1：CopyButton 用例假绿，删 `preventDefault` 仍全绿） | **已关闭** | 新用例 `CopyButton.test.tsx:60-76` 用 `new MouseEvent('click', { bubbles: true, cancelable: true })` 手工派发，断言 `event.defaultPrevented === true`，并保留 `navigator.clipboard.writeText` 调用与 label `onClick` 未触发的断言。删掉 `CopyButton.tsx:65` 后 `defaultPrevented` 必为 false → 用例必红；`TooltipTrigger`/`useTooltip` 均不 `preventDefault`，不存在其他置位来源。实跑 7 passed。 |
| rev2 N2（F2：收藏按钮无意义的 `preventDefault` + 断言不存在的转发机制） | **已关闭** | `CenterBrowserView.tsx:429-445` 收藏按钮只保留 `e.stopPropagation()`，无 `preventDefault`、无相关注释；rev3 快照相对 base 也没有该按钮的 hunk（净回退）。`<button type="button">` 属 interactive content，`stopPropagation` 足以阻断 label 的 React `onClick`，与面板同构位置一致。 |
| rev2 F5.2（记录不修：`createForTab` 第 7/8 实参顺序强断言） | **维持记录不修（理由成立）** | `AgentSiteRule`（ipc-types.generated.ts:63-73）与 `AgentSiteOverride`（:75-79）结构不相容，传反顺序是 `tsc` 错误，而 `tsc --noEmit` 在 `check:changed` 内；`useBrowserViewHost.test.ts:107-116` 已用 8 个实参（末两位 `undefined`）锁住 arity。仍缺“配置值真的透传”的断言（见记录不修）。 |

## 新增发现

### F1 [severity: low] [category: 文档]

- 位置：`adlo/frontend/src/app/features/browser/__tests__/useBrowserUrlState.test.ts:32`
- 描述：该用例标题仍写着「事项 8：避免 overlay 卡住 WebView 创建/揭示」，把“回车收起地址栏”的理由归因于 overlay；而 rev3 的源码注释（`useBrowserUrlState.ts:41-45`）已明确改为“地址展开是工具栏内联展开，不再计入 overlayActive，因此收起动作本身不再影响中心 WebView2 的可见性”。标题与它覆盖的实现现在互相矛盾：维护者读标题会以为地址展开仍在 overlay 里，存在把 `addressExpanded` 重新并回 `computeCenterOverlayActive` 的回归风险。
- 证据：
  - `useBrowserUrlState.ts:41-45`：新注释明确“不再计入 overlayActive”“不再影响中心 WebView2 的可见性”。
  - `useBrowserUrlState.test.ts:32-45`：用例只断言 `setAddressExpanded(false)` + `blur()` + `submitAddress()`，没有任何 overlay 断言；该行为现在只是“标准浏览器行为”，不再是 overlay 规避手段。
  - `CenterBrowserView.tsx:157-158` 与 `centerOverlay.ts:12-17` 同样声明地址展开不计入 overlay。
  - 该文件不在 rev3 快照清单内，但与 rev3 修改的源码注释直接冲突，属本轮改动遗留的失效理由。
- 建议修复：把标题改为不含 overlay 归因的表述，例如「Enter 提交时收起地址栏并 blur（标准浏览器行为）」，保留现有三条断言不变。

## 记录不修

- `browserPoolSingleton.ts:95-104` 的第 7/8 实参“配置值真的透传”无断言：现有用例在 `appInfo` 为空时只锁 arity（`undefined, undefined`），若把两行改成硬编码 `undefined` 不会变红。rev2 已按“可选增强”记录；类型不同已由 `tsc` 兜住顺序，规则解析链路由 `shared/agentSiteRules` 与 `settingsViewModel` 用例覆盖，本轮不升级为需修复。
- `centerOverlay.ts:6-10` 的 `addressExpanded?: boolean` 是“实现不读、只给回归测试表达语义”的字段（Speculative Generality 味道）；`CenterBrowserView.test.tsx:83-102` 只锁纯函数，若组件接线绕过纯函数仍绿。rev2 已接受“逻辑集中到唯一纯函数”的方案，本轮不要求补组件级 `setTabBounds` 断言。
- `useWebViewLifecycle.ts:223-226` 的“Restart suppression”注释未提及本地可查看文件豁免（:231 的 `!isLocalViewableFileUrl`）；该注释不是本轮新增/修改，行为与理由可由 `localFileInput.test.ts:48-54`、`downloadUrl.ts:43` 与 `useBrowserViewHost.test.ts:144-166` 推出，属可选补充，不列为需修复。
- `useBrowserViewHost.test.ts:144-166` 新用例未断言 `isTabInPool`/`activateTab`/边界，也未显式 unmount；与该文件既有用例风格一致（`beforeEach` 已 `browserPool.reset()`，testing-library 自动 cleanup），无泄漏。
- `useBrowserViewHost.test.ts:164-165` 用 `createForTab.mock.calls[0][1]` 取 URL，而非 `toHaveBeenCalledWith`；前者在未调用时会抛 TypeError 仍然变红，判别力等价，属风格。
- `CopyButton.test.tsx:72` 的注释「没有 preventDefault 时 label 的原生激活会执行（defaultPrevented=false）」在 jsdom 中对带 `tabIndex` 的目标并不成立（rev2 探针已证 label 激活被跳过）；但该断言本身（`defaultPrevented`）是唯一有判别力的观测量，注释描述的是真实 WebView2/Chromium 的后果，不影响回归保护。若追求逐句精确，可补“jsdom 不执行 label 激活，故以 defaultPrevented 判别”，属可选措辞。
- `CopyButton.test.tsx:60-76` 用裸 `dispatchEvent` 而非 `fireEvent`，理论上会绕开 testing-library 的 `act` 包裹；实跑无 act/console.error 噪声（`--reporter=verbose` 7 passed），且 `afterEach(cleanup)` 会清掉 600ms 计时器，无实际副作用。
- `browserPoolSingleton.ts:73-104` 的 8 个位置参数（Data Clumps）仍成立，上轮已记录，留待 options 对象重构。
- 双端一致：浏览器模式无原生 WebView2，`preventDefault` 与 overlay 判定均为纯 WebView 侧逻辑；`centerOverlay.ts` 不引入环境分支。本轮无 CSS 选择器/token 变更，不需要 `ui-probe.mjs` 证据。
- 进度文件与报告一致性：事项 1 记录的 `Tests 7 passed (7)` 与当前 `CopyButton.test.tsx` 的 7 个用例数一致；本轮只改了断言与用例，未增删用例数，无漂移。

## 结论

- 需修复项：1（critical 0 / high 0 / medium 0 / low 1）
