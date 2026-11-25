# cards-theme · R2 rev4 定向复核报告

## 范围

- rev4 快照（base `be34f973`），本 scope 实际变更文件（rev3↔rev4 SHA256 逐文件比对确认）：
  - `adlo/frontend/src/app/features/browser/browser-landing/VerticalVolumeSlider.tsx`（context）
  - `adlo/frontend/src/app/features/browser/browser-landing/VerticalVolumeSlider.css`
  - `adlo/frontend/src/app/features/browser/browser-landing/LandingVolumeControl.tsx`（context）
  - `adlo/frontend/src/app/features/browser/browser-landing/LocalPortSection.css`
- 本 scope 其余文件（`ShortcutGrid.css`、`PortConfigDialog.css`、`LandingVolumeControl.css`、`HorizontalVolumeSlider.css`、`VolumePercent.css`、`styles/themes.css`、`styles/tokens.css`、`styles/components/input.css`、`styles/regions/rightpanel/file-tree-core.css`、`tauri-csp-config.test.ts`、`prototype/**`）rev3↔rev4 快照字节相同，未重新审。
- 只读源码；未运行 `git diff/log/show`，未改源码，未跑测试 / 门禁，未启动 dev server / 浏览器（0 端口、0 后台进程）。
- 快照外核对：`VerticalVolumeSliderStyle` / `data-style` 在 `adlo/frontend/src` 与 `adlo/`（含 `scripts/`）全仓 grep 零命中；仅 `adlo/frontend/prototype/audio-capsule-wrap/index.html` 保留原型选型器的 `data-style`。

## 上轮问题关闭情况

- **F1（low，死代码：`fill`/`liquid` 变体）——已关闭。**
  1. CSS：`VerticalVolumeSlider.css` 从 rev3 的 64 行缩到 46 行，rev3 的 4 条 `[data-style='fill'|'liquid']` 规则（rev3 diff `:54-70`）全部消失；现存 5 个选择器 `.adl-vslider`、`:active`、`__track`、`__fill`、`__thumb` 在现文件 `:1,12,16,28,37`，全部有 DOM 消费方（`VerticalVolumeSlider.tsx:72,103,104,105`）。`__fill` 是细轨变体内的高度填充条元素，与被删的 `fill` 变体无关，非残留。
  2. TSX：`export type VerticalVolumeSliderStyle`、`variant?: VerticalVolumeSliderStyle` 与默认值（rev3 diff `:10,17,33`）、根节点 `data-style={variant}`（rev3 diff `:83`）均已移除；现 props 仅 `value/onVolumeChange/label/className`（`VerticalVolumeSlider.tsx:4-10`），根节点无 `data-style`（`:69-79`）。
  3. 调用方：`LandingVolumeControl.tsx:43-48` 不再传 `variant`。
  4. 组件注释从「细轨 + 圆点、填充条、或整条液面（liquid）」（rev3 diff `:26`）改为「细轨 + 圆点。」（现 `:17`），与实际唯一形态相符。
  5. 无残留引用：`VerticalVolumeSliderStyle|data-style` 在 `src/` 零命中；`variant` 在 `browser-landing/` 仅剩 `font-variant-numeric`（`PortConfigDialog.css:68`、`VolumePercent.css:17,41`）；无测试引用该类型 / 属性。
  6. 无新增死代码：被删规则不含 token，`--landing-volume-{track,fill,thumb,thumb-shadow}` 仍由 `VerticalVolumeSlider.css:24,34,44-45` 与 `HorizontalVolumeSlider.css:25,34,44-45` 消费；`className` prop 仍有唯一实参 `adl-landing-volume__slider`（`LandingVolumeControl.tsx:47`，由 `LandingVolumeControl.css:40,47,49,51,71` 消费）。
- **F2（low，注释失实：LocalPortSection「图标悬浮」）——已关闭。**
  - 现注释 `LocalPortSection.css:71`：「端口条目 hover：与快捷站点一致，透明底 + 淡底反馈（条目本身无图标）。」
  - 「与快捷站点一致」可证：`:72-75` 的 `background: var(--bg-hover)` + `border-color: var(--border-subtle)` 与 `ShortcutGrid.css:56-59` 逐字同值。
  - 「条目本身无图标」可证：`LocalPortSection.tsx:204-210` 卡内只有 `__dot` / `__address` / `__label`；「+」图标属另一组件 `__add-placeholder`（`:217,228-229`）。
  - 「透明底 + 淡底反馈」可证：基态 `background: transparent`（`:61`），hover 才切 `--bg-hover`（`:73`）。

## 新增发现

无新增需修复项。本次修复未引入回归：未改动任何 DOM 结构、事件处理、aria 属性或 token 定义；竖滑杆的拖拽 / 键盘 / 滚轮逻辑与 rev3 逐行相同（仅删 props 与属性）。

## 记录不修

1. `adlo/frontend/prototype/audio-capsule-wrap/index.html` 仍保留 S1–S5 选型器的 `data-style` 规则（`:231-278,330,347-351`）。原型为一次性参考、按要求不清理（rev3 记录 8 仍成立）。
2. `fileDropRouter.ts` 的 rev4 快照与 rev3 不同（rev3 注释「覆盖层（如自定义背景弹窗的上传区）在挂载期注册处理器」→ rev4「覆盖层（如自定义背景弹窗）在打开期注册处理器、关闭即注销」）。该文件属 file-drop scope，不在本 scope ownership 内，本报告不计 finding；仅提示主代理：rev4 实际变更文件比「只改 3 处」多此 1 个。
3. rev3 已记录的 pre-existing 项（`input.css` 全文件死 CSS、`file-tree-core.css:232-241` 与 `tab-clip.css` 同形声明、`LandingVolumeControl.css:16-21` no-op 重置、`160ms/120ms` 未走 `--duration-*`、4 个图标 token 三处重复、`--landing-*` 未在 `tokens.ts` 注册、CSP 用例不钉 `asset:` scheme）状态未变，仍按原记录保留，不进入主表。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）；本轮零问题。rev3 的 F1、F2 均已关闭且无残留引用、无新增死代码。

需修复项：0
