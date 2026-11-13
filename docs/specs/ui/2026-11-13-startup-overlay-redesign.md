# StartupOverlay 改版 — 字标掠光 + 网格背景

> 2026-11-13。取代 [2026-07-13-startup-overlay-design.md](./2026-07-13-startup-overlay-design.md)
> 的视觉与实现部分（旧文档保留为历史记录，其"两层遮罩 + 时序"结论仍有效）。

## 背景

旧开屏由 `FlowFieldBackground`（OffscreenCanvas + Web Worker 的流场粒子）叠加品牌文字构成。
2026-11-13 用户要求移除粒子动效并重新设计开屏。四套原型（字标掠光 / 几何构成 / 面板开合 /
打字光标）中选定 **字标掠光（A）的时序 + 几何构成（B）的网格背景**，明确不要 B 的品牌动效；
最短停留仍为 3.5s。

## 画面与时序

三层，全部纯 CSS 动画（无 canvas、无 Worker、无逐帧 JS）：

| 层 | 内容 | 动效 |
| --- | --- | --- |
| 背景 | `--splash-bg` 纯色 | 静态 |
| 网格 | 32px 方格（1px 线），径向遮罩居中可见、边缘淡出 | 0–900ms 自 scale 0.62 生长淡入；之后 9s 周期极慢漂移（贴图在 `::before`，`translate3d` 走合成器） |
| 品牌 | 88px 图标 → 96px 细线 → 「Adlo · 安洛」 | 图标 620ms 落定（scale / blur）；560–1460ms 柔光扫过图标；1420–1940ms 细线居中展开；1700–2320ms 名称收字距淡入；2600ms 起每 2.6s 弱掠光 |

`App.tsx` 的 3.5s 最短 / 8s 最长停留未改；2320ms 后由网格漂移与弱掠光填充停留段。

## Token

- 颜色（`themes.css`，亮暗各一套）：`--splash-bg` / `--splash-fg` / `--splash-grid` / `--splash-sweep`。
  `--splash-bg` 与 `index.html` 的 `#preload-overlay` 同值，React 接管瞬间不闪色。
- 运动（`tokens.css` 的 `Motion: Splash`）：12 个 `--splash-*-duration` / `--splash-*-delay`，
  组件 CSS 零硬编码时长。

## 主题与减少动效

- 不再读取 `data-theme`：颜色由 CSS 变量驱动，主题切换自动跟随（也去掉了旧的跟随延迟）。
- `prefers-reduced-motion: reduce` 下逐个列名 `animation: none`，基础样式即终态，直接呈现静态成品。
  这里不用"时长塌缩到 1ms"：1ms 不会取消 `animation-delay`，名称/细线仍会在 1.4s / 1.7s 突然蹦出。
- 动画元素共 7 个（含 `.adl-splash__sweep--idle` 与 `::before` 漂移层），由
  `__tests__/StartupOverlay.css.test.ts` 从 CSS 反推对账，新增动画不登记即红。

## 与仓库规范的一处显式偏离

`css-architecture.md` 要求动画只用 `transform` / `opacity`。名称的"收字距"有意逐帧改
`letter-spacing` + 配对 `padding-left`（620ms、单行短文本）；图标落定另有 88px 局部的
`filter: blur(6px)`。两者已在 `StartupOverlay.css` 文件头登记，其余动画只动 transform/opacity。

## 关键文件

| 文件 | 职责 |
| --- | --- |
| `frontend/index.html` | 静态 `#preload-overlay` 底色层（React 挂载后移除） |
| `frontend/src/app/components/StartupOverlay.tsx` | 覆盖层结构 + 品牌锁定串 |
| `frontend/src/app/components/StartupOverlay.css` | 三层样式、7 条 keyframes、reduced-motion 块 |
| `frontend/src/app/components/StartupOverlayWrapper.tsx` | lazy `motion.div` + 500ms 退出淡出 |
| `frontend/src/app/App.tsx` | 3.5s 最短 / 8s 最长；`startupOverlayHidden` 同步给 BrowserPanel（WebView2 离屏） |
| `frontend/src/styles/themes.css` / `tokens.css` | `--splash-*` 颜色与运动变量 |

删除：`flow-field-background.tsx`、`flow-field-worker.ts`（唯一调用方即本覆盖层）。

## 验证方式

- 组件测试：preload 移除、结构/品牌串、无 canvas。
- 样式测试（node 读 CSS）：reduced-motion 覆盖全部动画层、时长/延迟零字面量、`z-index: var(--z-max)`、
  网格漂移必须是 `translate3d` 而非 `background-position`。
- 真机 computed style（亮/暗各一次）：底色、名称颜色、网格线色、遮罩存在。
