# 终端历史与实时终端分离 — 根因与可复用经验（2026-09-13）

> 来源：`docs/root-cause-resolution/2026-09/progress-2026-09-12-234500.md`（事项 1–12 完整取证与三轮审查记录）。
> 本文只提炼跨会话可复用的结论。

## 核心不变量：历史绝不注入实时终端缓冲区

**症状**：重启恢复后在新 PTY 中执行命令，输出跳回顶部、与历史混合甚至覆盖历史。

**根因**：把序列化历史写进新 ConPTY 渲染的同一个 xterm 缓冲区，并靠「启动窗口内过滤 `ESC[2J/3J/H`」保护历史。过滤 `ESC[H` 使 xterm 光标与 ConPTY 内部光标模型产生「等于历史高度」的**永久偏移**——此后 shell/ConPTY 的每条光标指令（相对移动、绝对 CUP）都落在历史区。

**教训**：ConPTY 只认自己的 N 行屏幕、从第 1 行算坐标。在它上面垫任何内容都会把坐标系顶偏。想「历史在上、新 shell 在下」只有两条正路：

1. **分离视图**（本项目采用）：历史做成独立只读 xterm 回放，实时终端零注入；
2. **历史进回滚区**：只拦 `ESC[3J`，历史留在 scrollback（会改变「同屏」观感）。

任何「过滤部分 ANSI 序列保历史」的方案都注定失败——过滤本身就是错位的来源。

## SerializeAddon 语义（回放正确性的根基）

- `serialize()` 输出是**相对流式**：行以 `\r\n` 衔接、无清屏（`2J/3J`）、无绝对 CUP（光标复位用相对 `ESC[nB/A`）；
- 内容 ≤ 一屏时尾部空行不输出，光标落在末内容行；
- 因此「逐段 append + 写段前 `\r` 回列首 + 扫描缓冲区找末内容行推进光标」的回放模型成立；该契约已由多段组合模拟测试锁死。
- `excludeAltBuffer: true` 必加：退出时停在 vim 等全屏程序里，否则 `ESC[?1049h` 会混进快照。

## xterm 的坑

1. **dispose 后 `write` 回调不再触发** → `await terminal.write(data, cb)` 会永久挂起。解法：挂起 resolver 收进 Set，cleanup 统一 resolve（见 `TerminalHistoryView` 的 `pendingWrites`）。
2. **对零尺寸/未挂载容器 `fit()` 会算出垃圾行列** → 后台标签的 hostEl 被 detach 后绝不能再 fit；尺寸观测必须放在实例自身容器（外层容器尺寸不变时 ResizeObserver 不触发）。
3. **`pty.resize` 每次 都会引发 ConPTY 整屏重绘** → 必须按 (cols,rows) 去重后才发送。

## 生命周期守卫

- **激活竞态**：`pty.create` 返回前 `tab.sessionId` 尚未写入 store，任何「读 store 判重」的守卫都会双通过 → 需按 tabId 的 in-flight promise 汇流 + 创建成功后二次校验「标签仍存在，否则 kill 新 PTY」。
- **关闭清理对称**：`handleCloseTab` 与 `handleCloseAllTabs` 的清理清单必须逐项对齐（历史索引、快照、cwd、OSC carry、pendingInput、pool entry），不依赖 `sessionId` 是否存在。
- xterm 的聚焦上报 `\x1b[I`/`\x1b[O` 会经 `onData` 冒充用户输入 → PTY 未就绪的缓冲路径需剔除；**实时路径不要剔除**（shell 开启 DECSET 1004 时那是合法交互）。

## 流程教训

多轮 ANSI 过滤补丁（≥3 轮）仍失败时，应质疑架构前提而非继续加规则——本轮最终由「DB 快照 + pyte 回放取证」定位到坐标系错位这一架构性根因。
