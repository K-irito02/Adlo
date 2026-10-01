# Tooltip 躲 WebView2：DOM 盖不住 OS 表面时让 tooltip 自己让路

> 来源：2026-10 通用 Tooltip 改版（3D 按钮感 + 过渡动画 + title→Tooltip 回改 8 处）
> 相关代码：`frontend/src/app/utils/tooltipPosition.ts`（`avoidRects` + 横轴滑移）、
> `frontend/src/app/utils/webviewAvoidRects.ts`、`frontend/src/app/hooks/useTooltip.ts`、
> `frontend/src/app/components/Tooltip.tsx`、`frontend/src/styles/components/tooltip.css`

## 背景

WebView2 是 OS 级渲染表面，任何 DOM（含 `z-index: 9999` 的 tooltip）都盖不住它。
此前为让按钮提示显示在 WebView2 之上，曾把浏览器面板多处按钮从自定义 Tooltip
改成系统原生 `title`（原生提示由 OS 绘制，不受 WebView 遮挡）。

## 方案（tooltip 自己让路，不动 WebView）

- `computePosition` 新增可选 `avoidRects`：按"首选边 → 对侧 → 其余边"试算，
  第一个"视口内 + 不重叠"胜出；主轴放下但横向压住时先沿横轴滑移到最近空位
  （贴边不算重叠）；四边全堵才回退老逻辑（可能被盖，属已接受的降级，非硬保证）。
- 矩形来源 `getWebViewAvoidRects()`：仅 Tauri（浏览器模式是 iframe，无需避让），
  采集 `#dsh-host-region[data-shell="tauri"]` 与 `.adl-tool-primary--browser`
  （与 `setTabBounds` 容器同源；重命名容器必须同步选择器——已用
  `TOOLTIP_AVOID_SELECTORS` 导出 + 注释锁定）。
- 曾考虑的反方案（tooltip 出现时把 WebView 移出画面）被否决：
  tooltip 是 300ms 延时的瞬态浮层，每次 hover 都 IPC 移 WebView 会导致页面闪烁
  （`.tooltip` 因此被排除在 `overlayManager` 隐藏名单之外）。

## 过渡动画两处真 bug（根因均已定位，非"太快"）

1. 出现动画被跳过：元素挂载时直接就是 `data-state='open'`，CSS transition
   在初挂载时不播放。修法：先 closed 挂载，双 rAF 后翻 open（`entered` 状态）。
2. 消失动画在屏外空播：关闭时 `setPosition(null)` + `isOffscreen = !position || !isOpen`
   把元素瞬移 `-9999`，淡出在不可见处播完。修法：关闭保留定位、卸载时
   `resetPosition()` 清理（兼顾"原地退出"与"下次首帧不闪旧址"）。

## 附带发现

- `maxWidth` prop 自第一天起就是死的（接收但从不生效）；已接通到
  `TooltipContent` 的 `style.maxWidth`（默认仍 240）。
- `overflow-wrap: anywhere` 让英文长词/URL 无断点时也断行，CJK 不受影响。
- 动效时长进 token（新增 `--duration-350` 并同步 reduced-motion 压到 `1ms`），
  否则 reduced-motion 双轨（`transition: none` 兜底但时长失控）。
- reduced-motion 下 `transform: none` 必须写到与 state 选择器同等特异度，
  否则位移复位是死代码。
