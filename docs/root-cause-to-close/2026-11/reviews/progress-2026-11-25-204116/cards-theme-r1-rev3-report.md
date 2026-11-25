# cards-theme · R1 rev3 审查报告

## 范围

- 审查文件（rev3 快照）：`adlo/frontend/src/app/features/browser/browser-landing/` 下 `ShortcutGrid.css`、`LocalPortSection.css`、`PortConfigDialog.css`、`LandingVolumeControl.css`、`VerticalVolumeSlider.css`、`HorizontalVolumeSlider.css`、`VolumePercent.css`；`adlo/frontend/src/styles/` 下 `themes.css`、`tokens.css`、`components/input.css`、`regions/rightpanel/file-tree-core.css`；`adlo/frontend/src/tauri-csp-config.test.ts`；原型 `adlo/frontend/prototype/**`（只核对与实现矛盾）。
- rev3 快照与 rev2 快照逐文件 SHA256 比对：**本 scope 全部 16 个快照（含 4 个原型）与 rev2 完全一致**；rev3 实际变动文件为 `backgroundAssets.test.ts`、`BackgroundSettingsDialog.{test.tsx,tsx}`、`backgroundVideoStage.test.ts`、`fileDropRouter.ts`、`useDragDropWorkspace.{ts,test.tsx}`、`browserTypes.ts`、`drop_target.rs`，均不在本 scope → 本 scope 无新代码变更。
- 只读上下文：`styles/index.css`（导入顺序）、`styles/themes.css`（`--text-secondary` 亮 `#767676` / 暗 `#9a9a9a`）、`--landing-*` 全部定义与消费点（`grep` 70 处，16 个 token 均有消费方）。
- 未运行 `git diff/log/show`，未改源码，未跑 `check:review` / vitest / cargo test，未启动 dev server / 浏览器（本次 0 端口）。渲染证据采用主代理提供的浏览器预览读数，本报告逐条与 token 定义/选择器声明交叉核对（本文件不重复启动浏览器）。
- 已核对通过（不计数）：
  - **级联顺序未变**：`styles/index.css:16-17` 仍为 `tokens.css` → `themes.css`，`[data-theme]` 块（0,1,0）在后覆盖 `:root` 兜底，暗色不会被兜底锁亮。
  - **无死 token**：16 个 `--landing-*` 在 `tokens.css:231-246`、`themes.css:201-216`（亮）、`themes.css:545-560`（暗）三处定义齐全；消费点集中在 `ShortcutGrid.css:16,81-82,112`、`LocalPortSection.css:16,98,108`、`LandingVolumeControl.css:33,36,63,89-90,111,117`、`VerticalVolumeSlider.css:24,34,44-45`、`HorizontalVolumeSlider.css:25,34,44-45`，逐个有读取方。
  - **组件侧无新增字面量**：本 scope 5 个组件 CSS 仍只用 `var(--landing-*)` / `var(--bg-hover)` / `var(--border-subtle)`，无 `rgba()/hex`、无 `[data-theme]` 分叉、无 `--accent` 系提示色。

## 上轮问题关闭情况

- **F1 [low] 缺亮/暗两套 `getComputedStyle` 证据 —— 已关闭**（逐项核对读数与 token 定义，全部一致）：
  1. **标题投影**：亮 `0 1px 2px rgba(255,255,255,0.6)` ↔ `themes.css:201` / `tokens.css:231`；暗 `0 1px 3px rgba(0,0,0,0.55)` ↔ `themes.css:545`。消费端 `ShortcutGrid.css:16` 与 `LocalPortSection.css:16`（同 token，读一处覆盖两处）。
  2. **图标环 + 投影**：亮 `0 0 0 2px rgba(255,255,255,0.85), 0 6px 16px rgba(0,0,0,0.18)` ↔ `themes.css:202-203`；暗 `0.22` + `rgba(0,0,0,0.4)` ↔ `themes.css:546-547`。对应 `ShortcutGrid.css:80-82` 的双段 `box-shadow`（`0 0 0 2px var(...)` + 整段 shadow token），声明形状一致。
  3. **名称/地址/端口标签/分区标题投影**：亮 `rgba(255,255,255,0.9) 0 1px 2px, rgba(255,255,255,0.7) 0 0 10px` ↔ `themes.css:204`；暗 `rgba(0,0,0,0.85)` / `rgba(0,0,0,0.45)` ↔ `themes.css:548`；端口标签亮 `rgba(255,255,255,0.85) 0 1px 2px` / 暗 `rgba(0,0,0,0.8)` ↔ `themes.css:205,549`。三组消费端 `ShortcutGrid.css:112`、`LocalPortSection.css:98,108` 均无第二个 `text-shadow` 竞争声明。
  4. **端口标签文字色**：亮 `rgb(118,118,118)` = `--text-secondary: #767676`（`themes.css:76`）；暗 `rgb(154,154,154)` = `#9a9a9a`（`themes.css:425`），说明亮/暗确实各自命中 `[data-theme]` 覆盖值（不是兜底值）。
  5. **音量胶囊展开态**：读数 `44×170`、亮 `background rgba(255,255,255,0.62)` / 暗 `rgba(20,22,26,0.66)`、`blur(18px) saturate(1.1)`、投影亮 `rgba(0,0,0,0.18) 0 10px 28px` / 暗 `rgba(0,0,0,0.35)` ↔ `LandingVolumeControl.css:30-36` + `themes.css:206-207,550-551`，尺寸与三项属性逐项吻合。
  6. **图标 hover 圆底与图标色**：`22×22` + `rgba(255,255,255,0.16)` ↔ `LandingVolumeControl.css:94-102,115-117` + `--landing-volume-icon-hover-bg`（亮暗同值）；图标 hover `rgb(255,255,255)` = `#ffffff` ↔ `--landing-volume-icon-hover-color`。
  7. **百分比色（暗）**：`rgba(255,255,255,0.82)` ↔ `themes.css:556`（亮 `rgba(0,0,0,0.72)` ↔ `themes.css:212`，读数未列但不影响本条关闭条件）。
  8. **卡片底盘**：亮/暗均 transparent ↔ `ShortcutGrid.css:45` / `LocalPortSection.css:61` 的 `background: transparent`（悬停才 `--bg-hover`）。
- 结论：rev2 F1 的关闭条件（「读数与 token 定义值一致」）已满足，且亮/暗两套齐全，覆盖其要求的全部三组选择器（文字投影、图标 box-shadow、胶囊 hover 三属性）。零代码改动即可关闭。读数入进度文件属 P5 文档同步，不在 R1 判定范围。

## 新增发现

无。

## 记录不修（沿用 rev2，文件本轮未变）

1. `HorizontalVolumeSlider.css` token 化顺带改值（track 亮/暗、fill/thumb、亮色圆点白晕），属纯视觉位移，不改变行为/契约；视觉验收若要求弹窗独立投影再拆 token。
2. `VolumePercent.css:41` 把 `--focus-border` 当输入框常驻边框（`tokens.md` 定义为聚焦边线），语义欠精确，unexpanded。
3. `tauri-csp-config.test.ts:78-90` 只钉 `http://asset.localhost`，不钉 `asset:` scheme（macOS 路径无回归保护）。
4. `tauri-csp-config.test.ts:5-15` 文件头注释范围偏窄（只写样式注入契约，实际覆盖 6 类断言）。
5. `styles/components/input.css` 的 `.input/.textarea/.select/.field*` 全仓无 TSX 消费方，本轮 `--focus-border` 改动运行时是 no-op。
6. `--landing-*` / `--focus-border` 未在 `design-system/tokens.ts` 注册（既有系统性口径，建议整批处理）。
7. 亮色白玻璃胶囊上图标恒灰白（`browser-landing-surfaces.md` 已定为设计决定），按用户特殊设计不记缺陷。
8. `file-tree-core.css` 两按钮操作区与 `tab-clip.css` 的 `.adl-clip-tab__actions` 同形，可改共享类消重（纯优化）。
9. 文档漂移留 P5（本 scope 本轮未发现代码注释与实现矛盾）。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）；上轮 F1（low，亮/暗计算样式证据）已关闭，rev3 本 scope 无代码变更、无新增回归。

需修复项：0
