# 一个终端标签内多终端窗口：窗格模型、布局引擎与自定义布局卡片

> 2026-10-08 — 「只读历史」功能整体移除，终端标签升级为可容纳 N 个独立 PTY 窗格的容器（均分/自由布局、卷帘门裁剪、自定义布局卡片）。设计见 [docs/superpowers/specs/2026-10-07-terminal-multipane-design.md](../../../superpowers/specs/2026-10-07-terminal-multipane-design.md)。

## 教训 1：React 拥有的内联几何，拖拽预览后不能靠 `clear` 恢复

自由模式窗格的 `left/top/width/height` 由 React 的 `style`（像素）拥有；拖拽期 Hook 直接写内联百分比做实时预览。若松手时用 `el.style.left = ''` 清除、再 `commit` 一个**未变化**的 rect，React 的 style diff 看到新旧 props 相同 → **不重写**，被清掉的内联几何无法恢复，窗格塌陷。
**修法**：不要清除 React 拥有的几何；只在 rect **真正变化**时才提交（与等分模式的 `numbersEqual` 守卫对齐），无位移的点击直接跳过 commit/persist。拖拽期预览在变化路径由 React 重渲染覆盖。回归测试要挂真实网格 + 布局 Hook，spy-only 的组件测试复现不出该路径。

## 教训 2：窗格会话被替换时必须释放旧 xterm 池条目

「杀死进程」后保留缓冲区（Ruling C-7）会让窗格的 `sessionId` 仍是已死会话；再次点击激活会创建新会话并**覆盖** `pane.sessionId`，但旧 `PooledXterm`（xterm 实例 + scrollback）从未 `release`，每轮泄漏一个。
**修法**：`attachSession` 在创建新会话前，若 `pane.sessionId` 存在且不存活，走统一 `teardownPane` 释放旧池条目与运行时账本；替换前清空 store 的 `sessionId`，使新会话创建失败时仍能显示「shell 未找到」。

## 教训 3：布局与结构分离持久化、按标签独立

窗格结构（顺序 / profile / 标注 / colorIndex）随 `adl:terminal.tabs`；排布（`mode` + `colFractions/rowFractions` + 归一化 `rects`）存独立键 `adl:terminal.paneLayout`（按 tabId，关标签经 `pruneWiring` 剪枝）。拖拽预览用 CSS 变量（`--adl-term-*-fractions` / `--adl-term-*-divider-<i>`）避免逐帧 setState；像素↔比例换算的**分母必须是内层网格内容尺寸**（`measureGridContent`），否则卷帘门裁剪下拖拽会「跑得比光标快」。

## 教训 4（工具/流程）：AOCI 全量认知对大型前端仓库过重

本仓库 AOCI 索引达 1722 条 / 约 26 万 token，`aoci_maintain` 的前置全量 overview 超出单会话上下文；Volumes v1 又禁止 `aoci_remove_entry`，orphan/drift 只能经 overview 门控的 `maintain → update_entry` 处理。规模收敛（缩小 scope）代价是砍掉大半 `frontend/src`，认知价值受损。
**结论**：大型仓库宜在专门的大上下文会话/自动化中维护 AOCI，或在仓库规模较大时评估该工具的边际价值。

## 相关

- [terminal-history-live-parity-2026-09-15.md](./terminal-history-live-parity-2026-09-15.md)（已废弃）
- [terminal-xterm-v6-scrollbar-copypaste-lessons-2026-09-13.md](./terminal-xterm-v6-scrollbar-copypaste-lessons-2026-09-13.md)
- [terminal-shell-menu-hover-lessons-2026-09-13.md](./terminal-shell-menu-hover-lessons-2026-09-13.md)
