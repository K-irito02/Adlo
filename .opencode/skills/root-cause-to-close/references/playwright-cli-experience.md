# playwright-cli 使用注意事项与经验教训

> 来源：真机实测（TodoMVC demo + 本地 `dev:preview` 实战），非文档复述。
> 对应技能正文：`SKILL.md` → 调试埋点触发与自动化验证。

## 1. 安装（一次即可）

- `npm i -g @playwright/cli@latest`；`playwright-cli install-browser chromium`（约 120 MB，落 `ms-playwright/`）。
- `playwright-cli install --skills=agents` 落到 `.agents/skills/playwright-cli/`，并自动给 `.gitignore` 追加 `.playwright-cli/`（快照/trace 可能含敏感信息，**保留这条忽略**）。
- 本仓库规范以 `.agents/skills` 为真源：`playwright-cli install --skills=agents` 落点即真源，复制同步到 `.opencode/skills/playwright-cli/`、`.trae/skills/playwright-cli/`。

## 2. 保命规则（违反必翻车）

| # | 规则 | 教训 |
|---|------|------|
| 1 | 会话命令**禁止 pipe 给 `Select-Object -First`** | pipe 提前关闭会导致会话进程被杀（实测 `open` 报 `ChildProcess.kill` 两次）。输出截断由工具自动处理，或重定向到文件再读 |
| 2 | 在 **Temp 目录**跑测试，不在仓库根跑 | 快照（`.playwright-cli/`）、截图、trace 默认落当前目录；在 Temp 跑则仓库零污染，用完整体删除 |
| 3 | route mock 验证完必须 `unroute` | 否则后续 reload 仍被拦截，排障结论失真 |
| 4 | 结束必须 `close`（多会话再 `close-all`） | 否则 chromium 残留吃内存 |
| 5 | Windows URL 含 `&` 时用 `playwright-cli --% goto "…&…"` | PowerShell 会把 `&` 当命令分隔符截断 URL（技能自带说明，照做） |

## 3. 与本仓库联动的实测经验

- 按 `docs/development/log-system-manual.md` §1 启动：`pnpm dev:preview -- --log-level trace --terminal-log-mode multi`。**端口可能漂移**（实测 5173 被占 → 实际 5174），不要硬编码，以启动日志 `[adl-run]` / vite 输出的实际地址为准。
- 后台启动：`Start-Process` 直接调 `pnpm.ps1` 会报 Win32 错误，包一层 `powershell.exe -NoProfile -Command` 再起；启动命令返回后**进程可能被工具链回收**，把 PID 写文件，下一轮先确认进程存活再等就绪。
- 停止 preview 用 `taskkill /PID <pid> /T /F`，之后确认端口已释放。但**先看清进程归属**：本机常驻的 codegraph node 进程（`@colbymchenry\codegraph`）绝不能杀，先查命令行再动手。
- 健康基线：console 应出现 `[adl-bridge] using ad-server at http://127.0.0.1:<port>`（手册 §9 标记）；favicon 404 是常态噪音，忽略。
- **"UI 动了" ≠ "日志写了"，两者都要断言**：实测点击"打开浏览器"后快照 diff 证明新标签页已建，但 `debug-logs-browser` 行数未增（该路径本就不写埋点）。只看其一会得出错误结论。

## 4. 能力边界

- 能：快照 refs 定位、fill/click/check、eval 断言、console/requests 排障、route mock、tracing、screenshot。
- 不能：触达 Tauri 桌面壳（只到浏览器，桌面点击仍需 WebdriverIO 方案）；`run-project-surfaces` 只启动不代开页面，需与本技能组合。
