# bklit-ui 装载骨架：CSS 变量未定义与骨架 y-domain 覆盖 — 2026-08-04

来源：Git 可视化装载效果对齐 bklit-ui 官方（多轮观察迭代，见 `docs/root-cause-resolution/2026-08/progress-2026-08-04-163500.md`、`progress-2026-08-04-182000.md`）。

## 1. bklit-ui 移植组件硬编码 `var(--foreground)`，若宿主项目未定义则静默失效

- 现象：装载骨架线条渲染为纯黑、Loading 文字无逐字符闪光、Grid shimmer 无效——三个症状都指向无效颜色。
- 根因：ADL 的图表 token 体系是 `--chart-foreground` / `--chart-foreground-muted`，但 bklit-ui 移植组件（`line-chart-loading.tsx`、`loading-sweep.tsx`、`chart-loading-label.tsx`、`grid.tsx`、`shimmering-text.tsx`、`bar-y-axis.tsx`）直接引用官方 `var(--foreground)` / `var(--muted-foreground)`。这两个变量在 ADL **未定义** → CSS 无效值 → SVG `stroke` 回退黑色、motion 动画在两个无效颜色间切换（视觉无变化）。
- 修复：所有装载组件改用 `var(--chart-foreground)` / `var(--chart-foreground-muted)`；通用组件 `shimmering-text` 用 fallback `var(--chart-foreground, var(--foreground))` 兼容官方语义。
- 教训：**移植第三方组件库的 CSS 变量引用前，先核对宿主项目的 token 命名体系**。无效 CSS 变量不会报错，只会在运行时静默退化，症状难定位。

## 2. `generateChartSkeletonFromTarget` 会覆盖 primaryKey 值 → 骨架 y-domain 不对称

- 现象：代码行演变装载时，负值 deleted 区域线条却越过了零分隔线（显示在分隔线之上）。
- 根因：`TimeSeriesChartInner` 的 `skeletonData = generateChartSkeletonFromTarget(data, lines[0].dataKey)`，它会用固定公式 `95 + sin(i*1.05)*28 + i*7` **覆盖 primaryKey**（这里 `lines[0]` 是第一个 Area = added，得到 ~95-133 正值），而 deletedNeg 保留调用方值（~-54）。y-domain 变成 `[min≈-61, max≈137]` → `y=0` 落到 ~67.5% 高度，而 deleted 的 sweep band 是 `[0.5, 0.98]` → 上半段越过分隔线。
- 修复：骨架数据里 `deletedNeg` 用与覆盖公式**完全相同的幅度**（`-(95 + sin(i*1.05)*28 + i*7)`），使 `min = -max` 对称 → `y=0` 精确落在 `innerHeight/2`。
- 教训：**装载骨架的正负幅度必须考虑 shell 的 primaryKey 覆盖**。测试断言应精确到 `y ≈ innerHeight/2`（而非"不在底部"），否则 `y < h*0.6` 这类弱断言放过了 ~67.5% 的缺陷。

## 3. 多线 sweep 同步：固定 seed + 零相位

- 用户要求三条骨架线"同一时刻开始扫视"（同步出现）。`LineLoadingSweep` 每条线有独立 `tick` state，扫视循环完成后各自 `setTick(tick+1)` 重随机轮廓 → 出现时机天然不同步。
- 修复：`LineLoadingSweep` 新增 `fixedSeed`——传入时禁用重随机（`getSkeletonHeights(pointCount, fixedSeed ?? tick)`），三条线共享 `loadingSweepFixedSeed={0}` + `loadingSweepPhaseOffset={0}` → 轮廓固定且相位一致 → 完全同步。
- 教训：**"多线同步动画"要在组件层提供共享 seed 机制，不能依赖调用方各自传参**（各实例独立 state 天然不同步）。

## 4. CSS `animation` 的 `background-position` 对 SVG 无效

- 现象：泳道链表骨架用了 `adl-git-vis-sweep`（`background-position` 移动），SVG 的 `<line>`/`<circle>` 完全没有扫视。
- 根因：`background-position` 动画只作用于 CSS 背景，对 SVG 元素的 `stroke`/`fill` 无效果。
- 修复：泳道线/边改用 `stroke-dasharray: 4 14` + `stroke-dashoffset` 动画（沿线条流动的亮点），节点圆用 `fill` 脉冲。
- 教训：**SVG 描边扫视用 `stroke-dashoffset`，不要用 `background-position`**。

## 5. HMR 热更新的 ErrorBoundary 报错是瞬时噪音

- 现象：`.adl-logs/debug-logs.txt` 里每次 vite `hot updated` 后紧跟一次 `ErrorBoundary caught`，componentStack 指向当前编辑的组件。
- 判断：只在 HMR 热更新后出现、初始页面加载干净、错误对象被日志收集器序列化为 `%o`/`%s` 占位符（message 丢失）→ 是 React Fast Refresh 热替换的瞬时错误，非功能 bug。应用重启后日志干净。
- 教训：**审查日志时区分 HMR 热更新瞬时报错与真实运行时错误**——HMR 报错以 `[vite] hot updated` 为前导，重启后消失即非 bug。另：日志收集器对 `console.error(error)` 的 Error 对象序列化会丢失 message，应记录 `error.message`。
