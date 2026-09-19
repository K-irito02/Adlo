# Interaction Knowledge

Lessons learned from UI/UX interaction fixes and optimizations.

## Subdirectories

- [2026-06](./2026-06/) — June 2026 interaction fixes
- [2026-07](./2026-07/) — July 2026 interaction fixes
- [2026-08](./2026-08/) — August 2026 interaction fixes
  - [CSS transform 命中区与 pointer-events 下沉模式](./2026-08/css-transform-hit-area-pointer-events-2026-08-03.md) — 旋转元素命中区跟随 transform，交互属性须下沉到旋转元素本身
  - [相对时间范围预设须按当前日期重解析](./2026-08/relative-time-range-re-resolve-2026-08-03.md) — rolling 预设不得固化为绝对日期；fetch/显示共用按 now 解析的快照
- [2026-09](./2026-09/) — September 2026 interaction fixes
  - [只读历史与实时终端的一致性四处同口径](./2026-09/terminal-history-live-parity-2026-09-15.md) — 空白格还原空格、Tango 调色板/粗体提亮/真彩色 mode、出生几何、关闭落盘窗口
  - [终端 Shell 选择器悬停菜单去抖](./2026-09/terminal-shell-menu-hover-lessons-2026-09-13.md)
  - [xterm v6 滚动条与复制粘贴](./2026-09/terminal-xterm-v6-scrollbar-copypaste-lessons-2026-09-13.md)
  - [检索加载态时序与悬浮层](./2026-09/search-loading-state-overlay-lessons-2026-09-19.md) — 提交与加载同 tick、取消同步复位；overlay 高度前提实证；范围切换防抖泄漏
