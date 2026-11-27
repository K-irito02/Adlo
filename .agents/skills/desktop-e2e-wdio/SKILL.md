---
name: desktop-e2e-wdio
description: 当需要验证 Tauri 桌面端真实交互（原生点击、窗口/面板、窗口几何、真实 IPC）、运行桌面冒烟、排查 WDIO 的 5s 超时或窗口焦点警告、处理 adl-server 残留，或维护 adlo/e2e/ 时使用。用 @wdio/tauri-service 的 embedded WebDriver 驱动真实 Tauri 窗口，不需要 tauri-driver / msedgedriver；桌面-only 改动即使只是确认「没改坏」也优先跑这套冒烟。
agent_created: true
---

# 桌面端 E2E（@wdio/tauri-service）

> 脚手架：`adlo/e2e/`
> 实测数据与成本评估：[wdio-tauri-desktop-e2e-eval-2026-10-28.md](../../../docs/knowledge-base/toolchain/wdio-tauri-desktop-e2e-eval-2026-10-28.md)
> 从零重建脚手架：[references/wdio-tauri-setup.md](references/wdio-tauri-setup.md)

本套件启动**真实 Tauri 桌面窗口**，通过 embedded WebDriver 做原生点击、读窗口几何、走真实 Rust IPC。它补的是浏览器模式与 jsdom 测不到的那一层。

## 1. 先判断该不该用

| 你在做什么 | 用什么 |
|------------|--------|
| 桌面-only 行为回归（原生窗口/面板、真实 IPC、Tauri 插件） | **本技能** |
| 纯前端逻辑、Store、工具函数 | vitest（`pnpm --dir frontend run test`） |
| 浏览器模式 / 网页交互 | playwright-cli |
| 双端一致性验收 | 本技能拿桌面证据 + 手动跑浏览器模式（技能 `run-project-surfaces`） |

**不要**把它当默认门禁：每轮会真实启动壳 + `adl-server`、占用 4445（embedded WebDriver 端口；`adl-server` 自己用临时端口）。热态单轮约 15s；冷工作树首次还要先 `stage:sidecar` 与 `e2e:build`，另计几分钟。它**不进** `check:all`，也不替代人工视觉验收（视觉仍按 `desktop-ui-verification.md`）。

## 2. 快速开始

在 `adlo/` 下执行。先过一遍前置检查——这些条件缺失时，报错通常长得像无关的构建/链接失败：

```powershell
cd adlo
pnpm install                 # e2e 是独立 workspace 包，不装就没有 wdio bin
cargo tauri --version        # e2e:build 走 tauri CLI，不是纯 cargo
Get-NetTCPConnection -LocalPort 4445 -ErrorAction SilentlyContinue   # 有输出 = WebDriver 端口被占，会连到别的实例
Get-Process adlo -ErrorAction SilentlyContinue            # 有输出 = 桌面实例在跑，可能锁住 target/debug 的 exe
```

两条探测命令只看**有没有输出行**（PowerShell cmdlet 不设 `$LASTEXITCODE`）。停实例时确认它属于本工作树；不要按 `adl-server` 进程名全杀，会误伤其它工作树。`cargo` / `cargo tauri` 不可用时，先按 `.agents/rules/commands.md` 设置 Rust PATH。若上次异常退出导致状态错乱，先删 `%APPDATA%\com.adlo.app.e2e`（见 §7 第 5 步）。

然后：

```powershell
pnpm run e2e:build   # 内部先 stage:sidecar；debug + --features e2e，不要换 release
pnpm run e2e         # 全量（= pnpm --dir e2e run test = node e2e/run-e2e.mjs）
```

只跑冒烟：`pnpm --dir e2e run test:smoke`

`e2e:build` 会先 `stage:sidecar`，再按 `e2e/tauri.e2e.conf.json` 用 `--mode e2e` 重建 `frontend/dist`；不要手工先 build 前端或 sidecar。

**成功判定**（四项都满足才算通过）：

1. 退出码 0，spec reporter 的 stdout 里有 `N passing` 且**没有** `failing` 行（基线 `5 passing`；加了用例后数量会变，别把 5 写死）。测试结果只在 stdout，`e2e/logs/wdio-*.log` 里只有后端日志。
2. 没有 `Could not find window with title containing` 警告。
3. 跑完没有 `adl-server.exe` 残留：

   ```powershell
   Get-CimInstance Win32_Process -Filter "Name='adl-server.exe'" |
     Where-Object { $_.CommandLine -like '*com.adlo.app.e2e*' } |
     Measure-Object
   ```

4. 截图已产出：`e2e/artifacts/shell.png`（真实桌面 UI）；本轮摘要写入 `e2e/artifacts/last-run.json`（passing/failing、耗时、窗口警告数）。

## 3. 它是怎么跑起来的（改之前先懂这层）

| 层 | 位置 | 作用与约束 |
|----|------|-----------|
| Rust feature | `src-tauri/Cargo.toml` 的 `e2e` + `src-tauri/src/main.rs` | 只有 `--features e2e` 才编译两个 WDIO 插件，且仅当 `TAURI_WEBDRIVER_PORT` 存在时注册。普通 `tauri dev` 与生产构建完全不受影响 |
| E2E 外壳配置 | `e2e/tauri.e2e.conf.json` | 独立 identifier `com.adlo.app.e2e`（数据/DB 隔离）、`withGlobalTauri: true`、`e2e-wdio` capability、`vite build --mode e2e` |
| 前端 guest 插件 | `frontend/src/main.tsx` + `frontend/.env.e2e` | `VITE_ADL_E2E=1` 时动态 `import('@wdio/tauri-plugin')`。生产构建是常量 false，会被 tree-shake |
| Runner | `e2e/wdio.conf.ts` | embedded provider（端口 4445）、会话开始固定窗口、`logLevel: warn` |
| 清理包装器 | `e2e/run-e2e.mjs` | 跑前/跑后按 `--data-dir ...app.e2e` 杀孤儿 `adl-server.exe` |

两个容易踩的因果：

- **guest 插件不是可选项**：缺了它，service 每条命令都要等 `core.invoke` 5s 超时（3 条用例曾跑到 3 分 6 秒）。
- **必须经包装器**：Windows 上 WDIO 硬杀应用，Rust `Drop` 不执行，`adl-server.exe` 会残留并锁住二进制，下一次构建报 `PermissionDenied`。

## 4. 常用变体

```powershell
cd adlo

# 只跑一个 spec（路径相对 e2e/）
node e2e/run-e2e.mjs --spec specs/smoke.spec.ts

# 临时看命令级日志（排查后改回 warn）
node e2e/run-e2e.mjs --spec specs/smoke.spec.ts --logLevel debug

# 连续跑 3 次查 flaky
1..3 | ForEach-Object { pnpm run e2e }
```

额外参数会原样转给 `wdio run`。

## 5. 新增用例

选择器与等待方式是这类用例最容易坏的地方，按下面做：

- 只用 `data-testid` / class / `aria-*`，**不要用本地化文案**（切语言就全挂）。不确定时先在组件源码里搜真实 `data-testid`，不要猜。
- 不写 `sleep`：用 `browser.waitUntil` 等条件（元素可点、`aria-*` 变化、遮罩退场）。
- 启动前置：依次关环境向导（`[data-testid="env-wizard"]`）和随后串行出现的 harness 向导（`[data-testid="harness-wizard"]`）；两者都是全屏 overlay，只关一个会让原生点击等不到标题栏。再用 `elementFromPoint` 等启动遮罩退场（遮罩至少 3.5s）。
- 各用例共享同一个应用实例：不依赖执行顺序，自己准备前置状态。
- 截图写 `e2e/artifacts/`（已 gitignore），不要写进 `specs/`。
- 截图只能看静态结果：**首帧/闪烁类问题抓不到**（WebDriver 截图取的是合成完的某一帧）。视觉闪烁用浏览器 rAF 帧采样定位（见 `root-cause-to-close/references/playwright-cli-experience.md` §6），最终交给用户桌面实测；不要为抓闪烁去跑 `e2e:build`。
- mock 只对 `browser.tauri.execute` 通道有效（见 §6）；不要为测试改生产代码。

**前置**：`smoke.spec.ts` 里的 `dismissSetupWizards` / `waitForTitlebarClickable` 目前是文件内私有函数。第二个 spec 要用时，先把这两个函数移到 `e2e/specs/helpers.ts` 并 export，再让两个 spec 都从 `./helpers` import（e2e 是独立包，别跨包引前端源码）。下面的示例假定已完成这一步。

```ts
import { $, browser, expect } from '@wdio/globals';
import { dismissSetupWizards, waitForTitlebarClickable } from './helpers';

describe('标题栏面板开关', () => {
  beforeEach(dismissSetupWizards);

  it('点击后 aria-pressed 翻转', async () => {
    await waitForTitlebarClickable();
    const toggle = await $('.adl-iconstrip__button--paneltoggle');
    const before = await toggle.getAttribute('aria-pressed');
    await toggle.click();
    await browser.waitUntil(
      async () => (await toggle.getAttribute('aria-pressed')) !== before,
      { timeout: 10_000, timeoutMsg: '面板状态没有翻转' },
    );
    await expect(toggle).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
  });
});
```

设置面板的现状（写之前先确认，别照抄猜出来的 testid）：面板根是 `.adl-settings-panel`，存储卡片有 `[data-testid="storage-locator-card"]`；但**打开设置的入口（`ToolSwitcher`）只有本地化 `aria-label`**。要写设置相关用例，先给入口补一个稳定 `data-testid`，否则只能按文案点击，正好违反上面的选择器规则。

### 真实 WebView2 下载链接验证（补充证据，不进自动套件）

jsdom 只能证明「`target=_blank` 下载链接不发 `open-new-tab` 且创建隐藏 iframe」；真实 `DownloadStarting` 触发、30s 移除 iframe 对大下载的影响、可内联渲染类型是否顶掉当前页，必须在桌面壳里取证据：

1. 在 `adlo/` 下运行 `node e2e/fixtures/download-link-server.mjs`（默认 `http://127.0.0.1:4789/`，`PORT` 可改；用完 Ctrl+C）。
2. 在应用浏览器标签打开该地址，点页面里的 `download` 链接。
3. 预期：当前页保持不动、地址栏不被改成 `.bin` 下载地址、无新标签 / 新 WebView 出现。
4. 打开下载卡片确认新增 `package.bin` 且完成；用 `browser.tauri.execute` 调 `download_list` 复核记录。
5. 换成 pdf / 媒体扩展名的链接重复第 3 步，验证隐藏 iframe 不顶掉当前页；有 `X-Frame-Options` 的站点另测。

把结果（含日期与是否通过）写进对应进度文件；这是真机补充，不替代用户视觉 / 交互验收。

## 6. 已知坑（症状 → 根因 → 处理）

| 症状 | 根因 | 处理 |
|------|------|------|
| 每条命令都等 5s：`Tauri core.invoke not available after 5s timeout` | 缺 guest 插件，或 `withGlobalTauri` 没开 | 确认 `.env.e2e`、`--mode e2e`、`e2e/tauri.e2e.conf.json` 三处齐备，然后重新 `e2e:build` |
| 每条命令刷 `Could not find window with title containing ...`，用例体慢约 3 倍 | service 按标题恢复焦点，`document.title` 与原生标题不一致 | `wdio.conf.ts` 的 `before` 已用 `switchWindow('main')` 固定窗口；若仍出现，检查该 hook 是否在 service 挂载 `browser.tauri` 之前超时（现在会直接抛错） |
| `browser.tauri.mock` 不生效 | mock 只拦 `window.__TAURI__.core.invoke`，本仓走打包的 `@tauri-apps/api` | mock 只验证 execute 通道；要测业务命令就调真实命令 |
| 跑完 `adl-server.exe` 残留，下次 `cargo build` 报 `PermissionDenied` | Windows teardown 硬杀，Rust `Drop` 不执行 | 必须经 `run-e2e.mjs` 跑；已残留按 §7 第 2 步清 |
| `@wdio/cli` 10.x 依赖冲突 | service 依赖 webdriverio 9.x | 锁 `@wdio/cli@9.x`；五个包一起升级（cli / globals / local-runner / mocha-framework / spec-reporter） |
| 日志被注入脚本全文刷屏 | 默认 `logLevel: 'info'` | 保持 `warn`，排查时临时 `--logLevel debug` |
| session 显示 `msedge 156` | WebView2 的 UA | 忽略，不代表真在 Edge 里跑 |
| `--spec` 报找不到文件 | 路径相对 `e2e/`，不是仓库根 | 用 `specs/xxx.spec.ts` |
| `titlebar toggle never became clickable (startup overlay still on top?)` | 只关了环境向导；随后出现的 harness 向导也是全屏 `adl-confirm-overlay`，盖住标题栏 | 先点 `env-wizard-skip`，再点 `harness-wizard-skip`（`dismissSetupWizards` 已覆盖两者） |
| 创建 / 导航浏览器子 WebView 后报 `No window could be found`，随后反复等待 5s | WDIO 失去 `main` 窗口句柄，当前子 WebView 不属于原 host 会话 | **立即停止 WDIO 迭代**，不再重复构建 / 改计时；改用 dev Tauri 日志、原生窗口响应监控或用户手动触发取证据 |

### 子 WebView 句柄丢失的硬停止条件

用例一旦创建或导航浏览器子 WebView，随后 WDIO 找不到 `main` 窗口或报 `No window could be found`，即判定当前自动化通道失效。允许保留一次失败输出作为证据，然后停止该用例的 WDIO 重试；不要通过延长超时、循环重建应用或叠加诊断 spec 继续消耗时间。改用以下至少一种证据源，并在进度文件记录切换原因：

- dev Tauri 日志：确认子 WebView 创建 / 导航及前端响应；
- 原生窗口响应监控：确认主窗口未冻结；
- 用户手动触发：按编号步骤操作并以用户回复为准。

该停止条件不否定 WDIO 对主窗口常规交互的适用性；它只阻止在已知句柄丢失场景里重复无效尝试。

## 7. 排障顺序

1. **前置与占用**：`pnpm install`；4445 空闲；没有运行中的 `pnpm dev` / `dev:tauri`（它们锁 `target/debug` 下的 exe）。`e2e:build` 会自己 `stage:sidecar`。
2. **清孤儿**（只杀命令行含 `app.e2e` 的，勿按名字全杀）：

   ```powershell
   Get-CimInstance Win32_Process -Filter "Name='adl-server.exe'" |
     Where-Object { $_.CommandLine -like '*com.adlo.app.e2e*' } |
     ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
   ```

3. **二进制是否新鲜**：`target/debug/adlo.exe` 存在，且最近一次由 `pnpm run e2e:build` 产出。`e2e:build` 会自己用 `--mode e2e` 重建 `frontend/dist`，不要手工 build 前端后指望测试用上。
4. **缩小范围**：先 `test:smoke`。失败先看 stdout 的失败栈与 `e2e/artifacts/shell.png`；`e2e/logs/wdio-*.log` 只有后端/服务日志，不包含测试结果。
5. **状态异常**（旧 schema、向导状态卡住）：删掉 `%APPDATA%\com.adlo.app.e2e` 再跑，等价于首次启动（环境向导会被用例自动关掉）。
6. **仍失败**：对照 `references/wdio-tauri-setup.md` 的六处配置逐项核对。

## 8. 升级与停用

升级：把 `@wdio/tauri-service`、`@wdio/tauri-plugin`、`tauri-plugin-wdio`、`tauri-plugin-wdio-webdriver` 保持同一 `1.5.x`，`@wdio/cli` 保持 9.x；改完必须重跑 `e2e:build`（Rust 插件变了）与 `pnpm run e2e:typecheck`。

停用/移除（不影响生产）：

1. 删 `adlo/e2e/`、`frontend/.env.e2e`；
2. 去掉 `src-tauri/Cargo.toml` 的两个 optional 依赖与 `e2e` feature，以及 `main.rs` 的 `#[cfg(feature = "e2e")]` 块；
3. 去掉 `frontend/src/main.tsx` 的 E2E 分支；
4. 去掉 `adlo/package.json` 的 `e2e:build` / `e2e`、`pnpm-workspace.yaml` 的 `e2e` 包、`adlo/.gitignore` 的 e2e 条目。

验证生产无残留：`cargo check -p adlo` 输出无 `wdio`；`pnpm --dir frontend run build` 后 `dist` 检索 `wdio|__wdio_mocks__` 应为 0 命中。

## 9. 相关

- 实测数据、成本、风险：[eval 文档](../../../docs/knowledge-base/toolchain/wdio-tauri-desktop-e2e-eval-2026-10-28.md)
- 残留进程锁定 exe 的同类问题：[tauri-dev-stale-exe-lock-2026-08-16.md](../../../docs/knowledge-base/toolchain/tauri-dev-stale-exe-lock-2026-08-16.md)
- 启动/端口与双端一致性：技能 `run-project-surfaces`
