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
| 6 | **禁止裸跑 `requests`** | 一次实测输出 3719 条静态请求（JS/CSS/字体），既截断又烧上下文。先 `--raw requests` 落盘再过滤，或只看单条 `request <n>`；静态资源会淹没业务请求 |

## 3. 与本仓库联动的实测经验

- 按 `docs/development/log-system-manual.md` §1 启动：`pnpm dev:preview -- --log-level trace --terminal-log-mode multi`。**端口可能漂移**（实测 5173 被占 → 实际 5174），不要硬编码，以启动日志 `[adl-run]` / vite 输出的实际地址为准。
- 后台启动：`Start-Process` 直接调 `pnpm.ps1` 会报 Win32 错误，包一层 `powershell.exe -NoProfile -Command` 再起；把输出重定向到日志文件。工具报 `ChildProcess.kill` 时**子进程通常仍存活**（实测三次），不要重复启动：下一次调用轮询日志 `[adl-run]` / 端口即可确认。
- 停止 preview 用 `taskkill /PID <pid> /T /F`，之后确认端口已释放。但**先看清进程归属**：本机常驻的 codegraph node 进程（`@colbymchenry\codegraph`）绝不能杀，先查命令行再动手。
- 健康基线：console 应出现 `[adl-bridge] using adl-server at http://127.0.0.1:<port>`（手册 §9 标记）；favicon 404 是常态噪音，忽略。
- **"UI 动了" ≠ "日志写了"，两者都要断言**：实测点击"打开浏览器"后快照 diff 证明新标签页已建，但 `debug-logs-browser` 行数未增（该路径本就不写埋点）。只看其一会得出错误结论。

## 4. 能力边界

- 能：快照 refs 定位、fill/click/check、eval 断言、console/requests 排障、route mock、tracing、screenshot。
- 不能：触达 Tauri 桌面壳（只到浏览器，桌面点击仍需 WebdriverIO 方案）；`run-project-surfaces` 只启动不代开页面，需与本技能组合。

## 5. 截图成本（2026-10-31 实测）

- **先用 eval 断言，再决定要不要截图**：结构（`textContent`、`data-settings-row`、`children.length`）与几何（`getBoundingClientRect` 的中心/高度差）都能用 `--raw eval` 证明；一次 eval 的成本远低于一张图。
- **截图只用于人眼审美判断**（配色、间距观感、对齐是否"看着舒服"）；同一状态每轮 ≤2 张，取最终态，不拍中间态。
- 产物落 Temp 并在清理阶段整批删除；不要把截图放进仓库（`.playwright-cli/`、`test-artifacts/` 都不入库）。
- 原型流程里 4 个方案可以先各拍 1 张终态对比图；方案内部的布局 bug 用 eval 判断，不要靠反复截图找。

## 6. 首帧 / 闪烁定位（rAF 采样，2026-11-04 实测）

视觉闪烁 = **相邻帧之间几何跳变**，或**第一帧画了错的东西**。两者都能逐帧量出来，不用截图猜。

```js
// 1) 采样器：不设帧数上限（用 splice 控内存），只记状态位与几何
(() => {
  window.__fr = [];
  const tick = () => {
    const o = document.querySelector('[data-testid=target]');
    const d = o?.querySelector('.dialog')?.getBoundingClientRect();
    window.__fr.push({
      t: +performance.now().toFixed(1),
      has: !!o,
      foot: !!o?.querySelector('.foot'),
      h: d ? Math.round(d.height) : 0,
      top: d ? Math.round(d.top) : 0,
    });
    if (window.__fr.length > 6000) window.__fr.splice(0, 3000);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
// 2) 触发与确认放进同一个 eval：点按钮 → rAF 里等确认框出现再点确认
// 3) 读结果只打印状态跃迁（has/foot 变化点），不要 dump 全部帧
```

- **判据：第一帧几何 == 稳态几何**。出现 `h`/`top` 变化即跳变（本仓实测：完成页脚先画后收，313→248，整卡上下跳 32px）。
- 首帧正确性看状态位（`foot`/按钮是否存在），别只看高度；两者都会错时以状态位定性、以几何定量。
- 交叉验证用 `new PerformanceObserver(...).observe({ type: 'layout-shift', buffered: false })`：`value` 给幅度，`sources[].node.className` 直接点名元素。
- 断言「某节点曾经渲染过」用 MutationObserver 的 added/removed 记录，**不要赌回调投递时机**；`disconnect()` 会清空未投递队列——先 `takeRecords()` 再断开。
- **桌面 Tauri**：合成层闪烁（`backdrop-filter` 首帧等）WebDriver 截图抓不到。浏览器帧序列用来定位布局类根因，最终视觉结论交给用户桌面实测；不要为抓闪烁去跑 `e2e:build`。
- 成本：一次 `playwright-cli` 调用 2–5s，采样窗口只有几秒；**别把「点触发」和「点确认」拆成两次调用**（本仓实测因此白跑一整轮）。
