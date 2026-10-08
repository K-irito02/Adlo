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

## 教训 5：单槽位异步槽位在并发下互相覆盖（2026-10-09 跟进 5/11）

`pty-ws.ts` 的 `pendingCreate` 单槽位：重启恢复时 4 窗格并发 `create()`，后一次覆盖前一次 resolver——只有最后一格拿到会话（且拿错成第 1 个会话），其余 promise 永久挂起（连 30s 超时都因槽位被清空而失效），页面呈现"多窗格仅一格有提示符"。生产日志实证：仅 1 个 `pty-created`，其余 3 格永远 `attempted`。
**修法**：改为 FIFO 队列（独立超时、close 全结算）；正确性依赖服务端单读循环串行保序——这是当前服务端实现的属性，不是协议保证，注释必须如实收窄；根治需协议加请求 ID（跟踪项，未做）。

## 教训 6：inset outline 会被全覆盖不透明子元素画盖住（2026-10-09 跟进 20）

活动高亮最初用 `.adl-terminal-pane` 的 `outline + outline-offset: -1px`（画在内边缘 1px），但 `.adl-terminal-canvas` 是全覆盖不透明绝对定位子元素，按绘制顺序盖住父级内嵌描边——结果是**完全不可见**，且与"颜色太淡"无法区分，极易误诊为样式未加载。
**修法**：高亮改独立覆盖层（`position:absolute; inset:0`，画布上层、手柄下层，`pointer-events:none`）。凡"容器描边 + 全覆盖不透明子元素"组合，一律用覆盖层而不用 inset outline。

## 教训 7：`z-index:auto` 的窗格拦不住高 z-index 子元素越界（2026-10-09 跟进 25）

自由窗格 `position:relative + z-index:auto` 不产生层叠上下文，其子元素手柄/按钮（z 3/4）直接参与根层叠，与顶层窗格整体（z 2）比较——4 > 2，被遮挡窗格的按钮会画在顶层画布之上**且可交互**（截图实证；且 `:hover` 非排他，两套按钮可同现）。隐藏态 `pointer-events:none` 的透明孔更会穿透。
**修法**：自由窗格统一 `z-index: 0` 自成层叠上下文（活动 z 2、拖拽内联 z 10，层叠表写进 CSS 注释双向引用）；隐藏手柄/按钮区保持可命中（穿透只到自家，不串改下层）。层叠语义必须"改一处核对余下"。

## 教训 8：jsdom 的 PointerEvent 构造丢弃坐标 init（2026-10-09 跟进 12）

`fireEvent.pointerDown(el, { clientX, clientY })` 在本仓库 jsdom 下读到的坐标全是 `undefined`（阈值比较 `NaN <= 6` 恒假，旧测试靠该旁路"碰巧"通过）。凡涉坐标的指针测试，必须用携带坐标的 `MouseEvent` 按指针类型名派发，并在 helper 注释写明局限（右键门控/多指分支此替身测不到，以代码审查覆盖）。

## 相关

- [terminal-history-live-parity-2026-09-15.md](./terminal-history-live-parity-2026-09-15.md)（已废弃）
- [terminal-xterm-v6-scrollbar-copypaste-lessons-2026-09-13.md](./terminal-xterm-v6-scrollbar-copypaste-lessons-2026-09-13.md)
- [terminal-shell-menu-hover-lessons-2026-09-13.md](./terminal-shell-menu-hover-lessons-2026-09-13.md)
