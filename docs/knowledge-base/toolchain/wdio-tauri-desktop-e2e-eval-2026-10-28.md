# 桌面端 E2E：@wdio/tauri-service 实测评估（可行，按需启用）

日期：2026-10-28（初评为同日；本版为真机实测后改写）。来源：retro 会话——桌面壳点击仍需用户当“手”，浏览器侧已有 playwright-cli 自驱。

## 结论先行

| 维度 | 结论 |
|------|------|
| 可行性 | **可行**：本机完整跑通「调试构建 → embedded WebDriver 启动 → 真实 IPC → 点击 → 截图」 |
| 体感 | **好**：5 条用例 3 连跑全绿；用例体 215–224ms，整轮约 15s（含应用启动与 WDIO 引导） |
| 成本 | **中等**：9 个既有文件改动 + 1 个 `e2e/` workspace；`pnpm-lock.yaml` 约 +3.4k 行、`Cargo.lock` 约 +450 行 |
| 必要性 | **条件性**：不进默认门禁；桌面交互回归复发或有专项预算时启用 |
| 建议 | 保留为 **opt-in 桌面冒烟**（`pnpm e2e`）；不用时整体删除即可，生产构建零残留 |

## 实测环境与命令

- Windows / WebView2 156（service 把 session 报告为 `msedge 156.0.0.0`，不代表真实 Edge）；Node 24.15.0、pnpm 11.5.2、rustc 1.97.1、tauri-cli 2.10.1。
- 版本组合：`@wdio/tauri-service@1.5.1`、`tauri-plugin-wdio@1.5.1`、`tauri-plugin-wdio-webdriver@1.5.1`、`@wdio/tauri-plugin@1.5.1`、`@wdio/cli@9.32.0`。
  **`@wdio/cli` 必须是 9.x**：10.x 与 service 依赖的 webdriverio 9.x 不兼容。
- 构建（debug，非 release——release 只为跑测试要多花几十分钟）：

  ```powershell
  pnpm --dir adlo/e2e run build:app
  # = pnpm run stage:sidecar && cargo tauri build --debug --no-bundle --features e2e --config e2e/tauri.e2e.conf.json
  ```

- 运行：

  ```powershell
  pnpm --dir adlo/e2e test   # 或仓库内 pnpm --dir adlo run e2e
  ```

- embedded provider 不需要 `tauri-driver` / `msedgedriver`（`pnpm-workspace.yaml` 里显式 `edgedriver: false`、`geckodriver: false`，不触发浏览器驱动下载）。

## 实测数据

最终配置（含窗口固定：见“踩坑 3”）：

| 轮次 | 结果 | 用例体耗时 | 整轮（spec reporter） | 进程总墙钟 | focus 警告 | 孤儿进程 |
|------|------|-----------|----------------------|-----------|-----------|---------|
| run4 | 5 passing | 210ms | 5s | 17.2s | 0 | 0 |
| run5-1 | 5 passing | 224ms | 5s | 15.4s | 0 | 0 |
| run5-2 | 5 passing | 220ms | 5s | 15.1s | 0 | 0 |
| run5-3 | 5 passing | 215ms | 5s | 15.5s | 0 | 0 |

修复窗口焦点前的对照：5 passing 但用例体 **655ms**，每条命令前都刷 `Could not find window with title containing ...` 警告（单轮 36 条）。即该问题让用例体慢了约 3 倍。

另跑一轮（202ms、15.9s）确认：删掉“在 `afterSession` 里调 `window.close()` 让应用优雅退出”的尝试后仍全绿、无孤儿——该尝试实测清不掉侧车，清理只能靠包装器。

首轮 5 条用例覆盖：壳启动（`dataset.shell=tauri`）、真实 Tauri 命令往返（`app_get_info`）、原生点击 + 窗口几何 + 截图（`e2e/artifacts/shell.png`，真实桌面 UI，已目视确认）、`browser.tauri.execute` 调命令、`browser.tauri.mock` 走 execute 通道。UI 侧断言用 `data-testid` / class / `aria-*`，没有依赖本地化文案。

## 集成清单（成本明细）

| 层 | 改动 | 说明 |
|----|------|------|
| Rust 依赖 | `src-tauri/Cargo.toml`：2 个 optional 插件 + `e2e` feature | 默认 feature 不编译、不链接 |
| Rust 注册 | `src-tauri/src/main.rs`：`#[cfg(feature = "e2e")]` 且仅当 `TAURI_WEBDRIVER_PORT` 存在时注册 | 普通 `cargo run` / `tauri dev` 行为完全不变 |
| E2E 配置 | `e2e/tauri.e2e.conf.json`：独立 identifier `com.adlo.app.e2e`、`withGlobalTauri: true`、`e2e-wdio` capability、`vite build --mode e2e` | 生产 `tauri.conf.json` 未改（仍是 `withGlobalTauri: false`）；数据目录隔离在 `%APPDATA%\com.adlo.app.e2e` |
| 前端 guest 插件 | `frontend/src/main.tsx` 按 `VITE_ADL_E2E=1` 动态 `import('@wdio/tauri-plugin')`；`frontend/.env.e2e` | 不是“只为 mock/日志”，缺了它每条命令超时 5s（见踩坑 1）；生产构建被 tree-shake |
| E2E workspace | `e2e/`：`wdio.conf.ts`、`tsconfig.json`、`specs/smoke.spec.ts`、`run-e2e.mjs`（清理 + 摘要包装器） | 独立 pnpm workspace 包 `adlo-e2e`；`typecheck` 进 pre-push |
| 脚本 / 忽略 | `adlo/package.json` 增 `e2e:build`（内置 `stage:sidecar`）、`e2e`、`e2e:typecheck`；`.gitignore` 增 `/e2e/{node_modules,artifacts,logs}/` | |

## 踩坑与可复用经验

1. **guest 插件是硬需求。** 不装 `@wdio/tauri-plugin` 时，service 的每次 `$`/`getTitle`/点击都会等 `Tauri core.invoke not available after 5s timeout`：3 条用例跑了 3 分 6 秒。装上后同样用例 0.2s 级。
2. **mock 能力有边界。** `browser.tauri.mock` 只拦截 `window.__TAURI__.core.invoke`；本仓前端走的是打包进 bundle 的 `@tauri-apps/api`（`window.digitalLife` typed bridge），**mock 对应用真实调用链无效**，只对 `browser.tauri.execute(...)` 路径生效。想要 mock 业务命令，需要应用侧改走全局 `__TAURI__`（不建议为测试改生产代码），或接受“只测 execute 通道”。
3. **每条命令的焦点恢复会按窗口标题匹配。** service 发现 `document.title` 与原生窗口标题不一致时，会 `getTitle + getWindowHandles + switchToWindow + getTitle` 走一遍并告警。本仓主窗口标题随页面/语言变化，必然不一致。修法：会话开始后 `browser.tauri.switchWindow('main')` 一次，既固定目标窗口也关闭自动恢复；之后警告 0 条、用例体 655ms → 210ms。
   注意：service 在自己的 worker `before` 里才挂 `browser.tauri`，配置里的 `before` 可能先跑，需轮询等待再调用。
4. **Windows 上 teardown 是硬杀。** Rust 的 `Drop` 不执行 → `adl-server.exe` 变孤儿，既锁 `target/debug/adl-server.exe`（下次 `cargo build` 报 `PermissionDenied`）又锁 SQLite。`e2e/run-e2e.mjs` 在跑前/跑后按命令行里的 `--data-dir ...com.adlo.app.e2e` 精确清理，不会误杀 dev/其它工作树实例（同类问题参见 [tauri-dev-stale-exe-lock-2026-08-16.md](./tauri-dev-stale-exe-lock-2026-08-16.md)）。
5. **应用自身的启动时序要显式等待。** 全新实例会弹环境向导（用 `[data-testid="env-wizard"]` 关掉），启动遮罩至少 3.5s；用例用 `elementFromPoint` 判断标题栏按钮真正可点，而不是 `sleep`。
6. **日志默认太吵。** `logLevel: 'info'` 会把每条 WebDriver 命令连同注入脚本全文打出来；评估/日常用 `warn` 即可。
7. 构建产物只用于测试：`--debug --no-bundle` 不打包安装器，产物就是 `target/debug/adlo.exe`；e2e 与普通 debug 构建共用 `target/`，首次切换 feature 会重编两个插件（增量后回到常规耗时）。

## 生产一致性核验

- `cargo check -p adlo`（默认 features）：通过（增量 45.6s），日志中 **0 处** `wdio` crate 参与编译。
- `pnpm --dir frontend run build`（生产模式）：通过（`tsc -b` + vite，3.2s）；`frontend/dist` 全文检索 `wdio|__wdio_mocks__`：**0 命中**，动态 import 已被 tree-shake。
- 生产 `src-tauri/tauri.conf.json` 未改：`identifier = com.adlo.app`、`withGlobalTauri = false`；e2e 专属的全局 Tauri 与 capability 只存在于 `e2e/tauri.e2e.conf.json`。
- `cargo fmt --all --check`、`npx eslint src/main.tsx`：通过。

## 风险与未覆盖

- 仅 Windows 实测；embedded provider 的 Linux / macOS 行为未验证。
- 无 CI 验证：桌面 E2E 需要真实桌面会话，headless/CI 可行性未知（`@wdio/xvfb` 只在 Linux 有意义）。
- 每次跑会真实启动壳 + `adl-server`（数据目录隔离，但仍占端口/内存）；并行工作树同时跑需各自端口与数据目录。
- WDIO 报告的浏览器身份是 WebView2 UA（`msedge 156`），不要据此判断“跑在 Edge 里”。
- 首轮构建依赖 `target/` 缓存；冷启动构建时间 ≈ 常规 debug 构建 + 两个插件。

## 建议

- **定位**：opt-in 的桌面冒烟，不进 `check:all`（全量门禁仍需用户批准），也不替代浏览器侧 playwright-cli。执行入口见技能 `desktop-e2e-wdio`。
- **值得覆盖的 3–5 条**（桌面独有、浏览器模式测不到）：标题栏/面板开合、设置面板下拉、浏览器面板新建标签、dsh 宿主启动、存储设置组的保存/重启提示。
- **保留条件**：桌面交互仍在演进（当前满足），或已发生过桌面-only 回归。
- **删除条件**：连续两个版本未跑、或多次 flaky 且无预算修；删除时移除 `e2e/`、Rust `e2e` feature/两插件、`main.tsx` 的 E2E 分支与 `.env.e2e`、根脚本与 workspace 条目即可，生产路径无需回滚。

## 落地位置（本轮脚手架，未提交）

| 路径 | 作用 |
|------|------|
| `adlo/e2e/wdio.conf.ts` | service 配置、embedded provider、窗口固定 |
| `adlo/e2e/specs/smoke.spec.ts` | 5 条冒烟用例 |
| `adlo/e2e/run-e2e.mjs` | 运行包装器 + 孤儿 `adl-server` 清理 |
| `adlo/e2e/tauri.e2e.conf.json` | e2e 专用 Tauri 配置（隔离 identifier / 全局 Tauri / capability） |
| `adlo/src-tauri/{Cargo.toml,src/main.rs}` | `e2e` feature 与环境变量门控 |
| `adlo/frontend/src/main.tsx`、`frontend/.env.e2e` | guest 插件按构建模式动态加载 |
