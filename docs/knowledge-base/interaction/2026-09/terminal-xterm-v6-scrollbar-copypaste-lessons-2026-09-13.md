# 终端 xterm v6 自绘滚动条与原生复制粘贴经验（2026-09-13）

> 来源：右侧终端面板 7 事项修复（内容间距、滚动条、键盘复制粘贴、拖拽裁剪、滚动条贴边、过渡打磨）+ token 治理；`@xterm/xterm ^6.0.0`。

## 1. xterm v6 不再是原生滚动条（`::-webkit-scrollbar` 覆盖无效）

- v6 把原生滚动条换成 VS Code 自绘部件：`.xterm-scrollable-element > .scrollbar.vertical > .slider`（容器 14px，见上游 `xterm.js#5159`、`Viewport.ts` 的 `SmoothScrollableElement`）。
- 覆盖自绘滑块：`width/left` 用 `!important`（xterm 内联写死 14px，运行时只更新 `height/top`，无冲突）；**勿对 `top/height` 加 transition**（拖慢滚动跟手）；`border-radius` 不进 transition（否则出现 14px 圆角中间态）。
- 残留原生 `.xterm-viewport` 仅视觉隐藏（`scrollbar-width:none` + `::-webkit-scrollbar{width:0;height:0}`），保留 `overflow-y:auto`（滚轮/键盘语义不受影响）；隐藏手法与 filetree（`leftbar.css`）统一。
- 升级 xterm 主版本必须回归此段（DOM 类名已重构过一次）。

## 2. 键盘复制粘贴走原生事件，禁用程序化剪贴板 API

- `navigator.clipboard.readText()` 会弹 `clipboard-read` 权限窗；`attachCustomKeyEventHandler` 返回 `false` 时 xterm 既不发数据也不 `preventDefault`，浏览器原生 `copy/paste` 事件照常触发，由 xterm 原生监听完成复制粘贴——全程无弹窗。
- 反模式：直接放行 Ctrl+V 不可行——xterm 默认把 Ctrl+V 当普通键发 PTY（显示 `^V`）并 `preventDefault` 掉原生 paste，必须拦截（返回 `false`）才放行原生粘贴。
- 复制语义：有选区返回 `false`（避免同时发 ETX 中断），无选区返回 `true`（保留中断）；Ctrl+Shift+C 一律 `false`；粘贴优先于复制判定（Shift+Insert 一律粘贴）；非拉丁布局补 `event.code`（KeyC/KeyV）。
- 只读实例（`disableStdin`）粘贴键同样返回 `false`：不污染 buffer 靠的是 `triggerDataEvent` 的 `disableStdin` 门控，而非返回值（`false` 恰为放行）。

## 3. flex 拖拽裁剪：`min-*:0` + 分界线按比例分摊

- `.adl-terminal-history` 缺 `min-width/min-height:0` 时，`flex:0 0 auto + min-*:auto` 使 xterm 内容最小尺寸阻止收缩（拖大后缩不回，被 `overflow:hidden` 裁掉）。
- 历史区尺寸用 `calc(ratio*(100%-1px))`，使 1px 分界线空间按比例分摊（`flex:1` 的 live 不再独吞 1px）。
