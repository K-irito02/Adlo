# 设置状态胶囊配色与环境 PATH 注入经验（2026-11-03）

## 1. CSS 特异性：不要用 `:not()` 修“tone 色被通用 span 覆盖”

现象：设置行标题里的状态胶囊（`.adl-settings-status--warning` 等）背景色生效，但文字始终是正文色。

根因：通用规则

```css
.adl-settings-row__label > .adl-settings-row__label-text span { color: var(--text-primary); }
```

特异性是 **0-2-1**，压过徽章 tone 规则的 **0-2-0**。

错误修法：给通用规则加 `:not(.adl-settings-status)`。特异性升到 **0-3-1**，会反过来压掉 DSH /
OpenCode 摘要行里“专门为压过 0-2-1 而写的” **0-3-0** 复合规则，造成另一处静默视觉回归；
`check:changed` 的 `vitest related` 因 CSS 用 `readFileSync` 读取、没有 import 边，不会选中这些守卫。

正确修法：

- 通用规则保持原选择器（0-2-1），把 `color` 改为 `var(--adl-row-label-color, var(--text-primary))`。
- 紧凑徽章的 tone 规则（0-2-0）只设 `background` 与
  `--adl-row-label-color: var(--status-badge-*-fg)`；自定义属性按普通声明级联，`color` 在计算值阶段解析。
- 不要用四类选择器提权，也不要给通用规则加 `:not()`；两者都会引入新的特异性耦合。
- 改 `src/styles` 后跑整个 `vitest run src/styles`，不要只跑新测试文件。

## 2. 紧凑胶囊与长文本状态块要分层

- 10px 胶囊需要更高的底/卡分离度：底 vs `--surface-raised` ≥1.25，文字对比 ≥4.5；亮色加深、暗色提亮。
- 句级长文本状态块（存储迁移失败、后端离线）继续用 `--pastel-*`，不加描边；高饱和色板会给长段落过度强调。
- 测试应同时锁：token 存在、文字对比、底/卡对比、暗底比亮底更暗、非 compact 仍走 pastel。

## 3. “状态显示可用” ≠ “实际可用”：环境依赖必须注入 PATH

现象：宿主 Node/Git 安装成功、设置组显示“就绪”，但终端/dsh/内部 git 仍用系统版本，系统没有时直接失败。

根因：检测只写 `selected.txt`；没有消费端读取宿主目录。dsh 宿主版用 `spawn_node_direct("node")`，
workspace 的 git 用 `Command::new("git")`，PTY 继承进程环境——它们都只认 PATH。

修复要点：

- 单一来源 `adl-env::path_env::path_dirs`：`host`=宿主选中版本；`system/custom`=已保存指定路径的父目录；
  `auto`=宿主优先、其次指定路径；bash 只接管指定路径（系统 bash 由 shell_resolver 固定路径解析）。
- `server::env_path` 写进程 PATH：`APPLIED` 记录上一轮目录，切换来源时先摘旧再加新；
  `join_paths` 失败保留原 PATH 并告警，**不要**记为已应用。
- 刷新时机：启动、install 成功、uninstall 成功、select-source、set-custom-path。
- 只影响新终端/新子进程；既有 PTY 不回溯。
- 空 PATH 条目等价于当前工作目录，合并时过滤。
- 测试：把 `plan(current, previous, next) -> (merged, next_applied)` 抽成纯函数，断言合并结果与
  APPLIED 簿记；避免单测直接 `set_var` 与同进程其它 `init_server_state` 测试互相污染。

## 4. 诊断复制：不要 JSON 套 JSON

旧载荷把单依赖状态再 `JSON.stringify` 成 `statusJson` 字符串，外部智能体读到的是转义噪声。
改为 Markdown 诊断单：任务说明 → 应用/系统上下文 → 未就绪项优先的状态明细 → 原始 JSON 代码块 →
去 frontmatter/标题降级的 runbook → 明确回复格式。模型凭据没有检测信号，只作引导，不参与就绪计数；
网络未连通要纳入 runbook，避免误报“所有可检测项均已就绪”。
