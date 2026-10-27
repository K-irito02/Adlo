# 桌面端 E2E：@wdio/tauri-service 评估（暂缓）

日期：2026-10-28。来源：retro 会话——桌面壳点击仍需用户当“手”，浏览器侧已有 playwright-cli 自驱。

## 官方路径（2026 现状，WebdriverIO + Tauri 官方互认）

- `@wdio/tauri-service`：跨 Windows / Linux / macOS，默认 embedded 驱动（无需外部 driver），自动管理 tauri-driver 与 Windows Edge WebDriver，提供 `browser.tauri.execute()`、IPC mock、前后端日志捕获。
- 另有轻量 browser mode（前端跑在纯 Chrome 里对 Vite dev server），但等价于已有的 playwright-cli preview 覆盖，无增益。

## 本仓现状

- 零 e2e 基建：只有 vitest；无 wdio/playwright 依赖。
- 引入成本：新增 devDeps（`@wdio/cli` + service）、release 构建前置（慢）、原生窗口 CI 易 flaky。

## 结论：暂缓

- 现行 P3 B 通道（用户当手 + 编号步骤）可用，且桌面 UI 变更低频。
- 触发引入的条件：桌面回归复发，或批了专项 e2e 预算。届时直接按官方 quick-start 落 `wdio.conf.ts`，首个用例即本仓设置面板开关/下拉交互。
