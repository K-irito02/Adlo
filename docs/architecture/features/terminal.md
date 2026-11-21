# 终端（Terminal）

> 术语以 [GLOSSARY.md](../../../GLOSSARY.md) 的「终端」分组为准：终端标签承载多个终端窗口，每个窗口对应一个终端会话（PTY shell）。
> 本文只做当前实现的文件地图与生命周期索引，历史设计见 `docs/superpowers/specs/2026-10-07-terminal-multipane-design.md`。

## 文件地图

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 运行时单例 | `frontend/src/app/features/terminal/terminalPtyRuntime.ts` | PTY 创建/输出订阅/kill/激活；kill→重建的 rekey 与输出缓冲 |
| xterm 池 | `frontend/src/app/features/terminal/terminalXtermPool.ts` | 按 sessionId 持有 xterm；离屏测量、rekey、待补写输出、fit/主题/字号 |
| 视图 Hook | `frontend/src/app/features/terminal/useTerminalPtyLifecycle.ts` | 启动单例、活动标签激活 effect、转发输入/缩放/kill |
| 窗格组件 | `components/terminal/TerminalPaneView.tsx` | 单窗口：xterm + 右上角动作 + 错误提示 |
| 网格/布局 | `components/terminal/TerminalPaneGrid.tsx`、`features/terminal/useTerminalPaneLayout.ts`、`terminalPaneLayout.ts` | 均分/自由布局、边界拖拽、按标签持久化 |
| 布局卡片 | `components/terminal/TerminalLayoutCard.tsx` | 自定义布局：排序、交换、标注 |
| 工具栏/菜单 | `features/terminal/TerminalPanel.tsx`（右侧）、`features/center/CenterTerminalView.tsx`（中心）、`TerminalShellSelector.tsx`、`useTerminalMenus.ts` | 布局模式、增加终端、Shell/工作区绑定、更多操作 |
| 状态 | `stores/slices/terminalSlice.ts`、`terminalSliceTypes.ts` | 标签/窗口/会话身份与持久化字段 |
| 后端 PTY | `crates/pty/src/*`、`crates/server/src/pty_ws.rs` | 壳层解析、ConPTY 会话、WS 输出通道 |
| 测试 | `features/terminal/__tests__/`、`components/terminal/__tests__/` | 运行时、池、布局、工具栏、动作按钮 |

## 生命周期

1. 新建标签/窗口 → `activatePane` 收口所有激活。
2. `attachSession` 等待容器可测 → `measureDimensions` 得到出生尺寸 → `pty.create`。
3. 成功后写 store `sessionId` → `XtermTerminal` 挂载时 `acquire` 池条目；池条目建立前的输出由 `pendingOutput` 缓冲。
4. kill 只清 PTY 与运行时账本、保留 xterm 池；重新激活时 `rekey` 复用实例并写 RIS（`\x1bc`）清屏。
5. 关闭窗口/标签时 `release` 池条目并丢弃缓冲；替换失败、创建期间窗口被关或抛异常同样释放。

## 布局持久化

- `terminalPaneLayoutStore` 按标签 id 保存 `mode`（equal/free）、列/行比例与自由模式矩形。
- `resetAuto` / 「恢复自动布局」回到 `defaultPaneLayout`（equal + 等分）。
- 自定义布局卡片只在 equal 模式提供，排序/标注同样按标签持久化。

## 调试入口

- dev 模式在 DevTools Performance 面板看 `adl:terminal:*` 标记（attach/pty-return/first-output）。
- 终端日志按进程落 `.adl-logs/`；前端调试日志写入同名目录（界面不再提供复制按钮，Agent / 控制台通过 `window.__exportDebugLogs` 读取）。
