# 从零接入 @wdio/tauri-service（本仓配方）

目标验收：`pnpm --dir ai-digital-life/e2e test` → 全绿（基线 `5 passing`）、spec reporter `00:00:05`、0 条窗口警告、无 `adl-server.exe` 残留。

版本：`@wdio/tauri-service` / `tauri-plugin-wdio` / `tauri-plugin-wdio-webdriver` / `@wdio/tauri-plugin` = `1.5.1`；`@wdio/cli` = `9.x`（10.x 与其 webdriverio 9.x 冲突）。

## 0. 产物清单

| 路径 | 必须 | 作用 |
|------|------|------|
| `src-tauri/Cargo.toml` | 改 | 两个 optional 依赖 + `e2e` feature |
| `src-tauri/src/main.rs` | 改 | 环境变量门控注册插件 |
| `e2e/tauri.e2e.conf.json` | 新 | 独立 identifier / 全局 Tauri / capability / 前端构建 |
| `frontend/.env.e2e` | 新 | `VITE_ADL_E2E=1` |
| `frontend/src/main.tsx` | 改 | E2E 时动态加载 guest 插件 |
| `frontend/package.json` | 改 | 新增 `@wdio/tauri-plugin` devDep |
| `e2e/package.json` | 新 | runner 依赖与脚本 |
| `e2e/wdio.conf.ts` | 新 | service / provider / 窗口固定 |
| `e2e/run-e2e.mjs` | 新 | 运行包装器 + 孤儿清理 |
| `e2e/specs/smoke.spec.ts` | 新 | 首条冒烟 |
| `pnpm-workspace.yaml` | 改 | 加入 `e2e` 包、禁用外部驱动下载 |
| `ai-digital-life/package.json` / `.gitignore` | 改 | `e2e:build` / `e2e` 脚本与忽略项 |

前置：`pnpm install`；`cargo tauri` 可用。`pnpm run e2e:build` 内部会先 `pnpm run stage:sidecar`（首次检出、`src-tauri/binaries/` 为空或执行过 `cargo clean` 后都无需手动补），再按 e2e 配置构建；直接跑裸 `cargo tauri ...` 时仍需先 stage（`externalBin` 校验，见 `ai-digital-life/CONTRIBUTING.md`）。

## 1. Rust：可选依赖 + feature

`ai-digital-life/src-tauri/Cargo.toml`

```toml
# Desktop E2E only: embedded WebDriver server + WDIO bridge plugin
# (opt-in via `--features e2e`). Never enable this feature in shipped builds.
tauri-plugin-wdio-webdriver = { version = "1.5.1", optional = true }
tauri-plugin-wdio = { version = "1.5.1", optional = true }

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]
# Only starts when the test runner sets TAURI_WEBDRIVER_PORT.
e2e = ["dep:tauri-plugin-wdio-webdriver", "dep:tauri-plugin-wdio"]
```

## 2. Rust：环境变量门控注册

`ai-digital-life/src-tauri/src/main.rs`

```rust
let builder = tauri::Builder::default();
#[cfg(feature = "e2e")]
let builder = if std::env::var_os("TAURI_WEBDRIVER_PORT").is_some() {
    builder.plugin(tauri_plugin_wdio_webdriver::init()).plugin(tauri_plugin_wdio::init())
} else {
    builder
};
```

普通 `cargo run` / `tauri dev` 不设该环境变量，链路与生产完全一致；默认 feature 下这两个 crate 根本不参与编译。

## 3. E2E 专用 Tauri 配置

`ai-digital-life/e2e/tauri.e2e.conf.json`（用 `--config` 叠加在生产配置上）

```json
{
  "$schema": "../src-tauri/gen/schemas/desktop-schema.json",
  "identifier": "com.ai-digital-life.app.e2e",
  "productName": "AI Digital Life E2E",
  "build": { "beforeBuildCommand": "pnpm --dir frontend exec vite build --mode e2e" },
  "app": {
    "withGlobalTauri": true,
    "security": {
      "capabilities": [
        "default",
        "browser-remote",
        {
          "identifier": "e2e-wdio",
          "description": "E2E-only WDIO bridge permissions (test builds only)",
          "windows": ["main"],
          "permissions": ["wdio:default"]
        }
      ]
    },
    "windows": [{ "label": "main", "title": "AI Digital Life", "width": 1280, "height": 800,
      "minWidth": 640, "minHeight": 480, "decorations": false, "shadow": true,
      "resizable": true, "fullscreen": false, "visible": false }]
  }
}
```

要点：

- identifier 换成独立值 → 数据落 `%APPDATA%\com.ai-digital-life.app.e2e`；包装器的清孤儿过滤依赖这个字符串。
- `beforeBuildCommand` 覆盖生产配置里的 sidecar 构建，只跑 `vite --mode e2e`；前端必须先 `pnpm install`。
- **生产 `tauri.conf.json` 保持 `withGlobalTauri: false` 不动。**

## 4. 前端 guest 插件（缺了每条命令 +5s）

`ai-digital-life/frontend/.env.e2e`

```
VITE_ADL_E2E=1
```

`ai-digital-life/frontend/src/main.tsx`（`boot()` 开头）

```ts
const isE2E = import.meta.env.VITE_ADL_E2E === '1';
async function boot(): Promise<void> {
  if (isE2E) {
    // 必须早于测试；依赖 withGlobalTauri（仅 e2e 配置开启）
    await import('@wdio/tauri-plugin');
  }
  // …原有启动流程
}
```

生产构建里 `isE2E` 是常量 `false`，动态 import 会被 tree-shake（实测 `dist` 检索 `wdio` 零命中）。

## 5. workspace / 脚本 / 忽略

`ai-digital-life/pnpm-workspace.yaml`（节选；真源以仓库文件为准，下面两行原有项不能丢）

```yaml
packages:
  - "frontend"
  - "e2e"
allowBuilds:
  edgedriver: false   # embedded provider 不需要外部驱动下载
  esbuild: true
  geckodriver: false
  node-pty: true
```

`ai-digital-life/package.json`

```json
"e2e:build": "pnpm run stage:sidecar && cargo tauri build --debug --no-bundle --features e2e --config e2e/tauri.e2e.conf.json",
"e2e": "pnpm --dir e2e run test",
"e2e:typecheck": "pnpm --dir e2e run typecheck"
```

`ai-digital-life/.gitignore`：`/e2e/node_modules/`、`/e2e/artifacts/`、`/e2e/logs/`

## 6. e2e 包

`e2e/package.json`：`type: module`，脚本 `build:app: pnpm --dir .. run e2e:build`、`typecheck: tsc --noEmit`、`test: node ./run-e2e.mjs`、`test:smoke: node ./run-e2e.mjs --spec specs/smoke.spec.ts`（真源：`ai-digital-life/e2e/package.json`）。

```json
"devDependencies": {
  "@types/mocha": "^10.0.10",
  "@types/node": "^24.0.0",
  "@wdio/cli": "^9.32.0",
  "@wdio/globals": "^9.31.3",
  "@wdio/local-runner": "^9.32.0",
  "@wdio/mocha-framework": "^9.32.0",
  "@wdio/spec-reporter": "^9.32.0",
  "@wdio/tauri-service": "^1.5.1",
  "expect-webdriverio": "^6.0.9",
  "typescript": "^5.9.0"
}
```

`wdio.conf.ts` 关键段（节选，真源：`ai-digital-life/e2e/wdio.conf.ts`）：

```ts
import type { TauriCapabilities } from '@wdio/tauri-service';

const appBinary = path.resolve(appRoot, 'target/debug',
  process.platform === 'win32' ? 'ai-digital-life.exe' : 'ai-digital-life');
// WDIO 的 Config['capabilities'] 类型不含 tauri:*；先按服务类型建数组再断言。
const capabilities: TauriCapabilities[] = [
  { browserName: 'tauri', 'tauri:options': { application: appBinary } },
];

export const config: WebdriverIO.Config = {
  runner: 'local', specs: ['./specs/**/*.spec.ts'], maxInstances: 1,
  services: [['@wdio/tauri-service', {
    appBinaryPath: appBinary, driverProvider: 'embedded', embeddedPort: 4445,
    startTimeout: 120_000, commandTimeout: 60_000,
    captureBackendLogs: true, backendLogLevel: 'info',
  }]],
  capabilities: capabilities as unknown as WebdriverIO.Config['capabilities'],
  logLevel: 'warn',
  bail: 0,
  waitforTimeout: 15_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 1,
  framework: 'mocha', reporters: ['spec'],
  mochaOpts: { ui: 'bdd', timeout: 120_000 },
  before: async () => {
    // service 在自己的 worker before 里才挂 browser.tauri，这里可能先跑
    for (let i = 0; i < 50 && !browser.tauri; i += 1) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!browser.tauri) {
      throw new Error('@wdio/tauri-service did not install browser.tauri in time');
    }
    // 固定窗口也会关闭「按标题恢复焦点」这条每命令路径
    await browser.tauri.switchWindow('main');
  },
};
```

`run-e2e.mjs`（Windows 孤儿清理 + 正确解析 wdio 入口；真源：`ai-digital-life/e2e/run-e2e.mjs`）

```js
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const E2E_IDENTIFIER = 'com.ai-digital-life.app.e2e';

function killSidecars() {
  if (process.platform !== 'win32') return;
  const script =
    `Get-CimInstance Win32_Process -Filter "Name='adl-server.exe'" | ` +
    `Where-Object { $_.CommandLine -like '*${E2E_IDENTIFIER}*' } | ` +
    `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore' });
}

function wdioBin() {
  const require = createRequire(path.join(here, 'noop.cjs'));
  return path.join(path.resolve(path.dirname(require.resolve('@wdio/cli')), '..'), 'bin', 'wdio.js');
}

killSidecars();
const child = spawn(process.execPath, [wdioBin(), 'run', 'wdio.conf.ts', ...process.argv.slice(2)],
  { stdio: 'inherit', cwd: here });
child.on('exit', (code, signal) => {
  killSidecars();
  if (signal) { process.kill(process.pid, signal); return; }
  process.exit(code ?? 1);
});
```

跑前也要清：上一次中断留下的侧车会锁住 `target/debug/adl-server.exe`，让 `cargo build` 报 `PermissionDenied`。

## 7. 首条用例（冒烟骨架）

`specs/smoke.spec.ts` 的断言顺序（对应现有 5 条）：

1. `getTitle() === 'AI Digital Life'` → `.adl-shell` 可见 → `document.documentElement.dataset.shell === 'tauri'`。
2. `browser.executeAsync` 调 `window.digitalLife.app.getInfo()`，校验 `appName` / `version`（真实 IPC）。
3. 等标题栏按钮可点（`elementFromPoint`）→ 原生 `click()` → 断言 `aria-pressed` 翻转 → `getWindowRect()` → `saveScreenshot('artifacts/shell.png')`。
4. `browser.tauri.execute(({ core }) => core.invoke('app_get_info'))`。
5. `browser.tauri.mock('app_get_info')` + `restoreAllMocks()`，只验证 execute 通道。

公共前置：`beforeEach` 关环境向导（`[data-testid="env-wizard"]` 的 `.adl-btn--secondary`），并 `waitUntil` 其消失。

## 8. 验收与常见偏差

从零复现基线（`ai-digital-life/` 下执行）：

```powershell
pnpm install
pnpm run e2e:typecheck
Get-NetTCPConnection -LocalPort 4445 -ErrorAction SilentlyContinue   # 有输出 = 端口被占
Get-Process ai-digital-life -ErrorAction SilentlyContinue            # 有输出 = 桌面实例在跑
pnpm run e2e:build                                                   # 内部先 stage:sidecar
pnpm run e2e
# 结果看 stdout 的 spec reporter（日志文件不含测试结果）
Get-CimInstance Win32_Process -Filter "Name='adl-server.exe'" |
  Where-Object { $_.CommandLine -like '*com.ai-digital-life.app.e2e*' } |
  Measure-Object
```

期望 `5 passing`、`00:00:05`、0 条 `Could not find window`、0 个 `adl-server.exe` 残留，且 `e2e/artifacts/last-run.json` 记录了本轮计数。状态异常时先删 `%APPDATA%\com.ai-digital-life.app.e2e` 再跑。

| 偏差 | 症状 | 修正 |
|------|------|------|
| 用了 release | 构建多花几十分钟 | 保持 `--debug` |
| 直接 `wdio run` | 跑完侧车残留、下次构建 `PermissionDenied` | 只经 `run-e2e.mjs` |
| 裸 `cargo tauri` 构建未 stage | tauri-build 报 `externalBin`/sidecar 缺失 | 用 `pnpm run e2e:build`（内置 stage），或先 `pnpm run stage:sidecar` |
| dev 实例还在跑 | 链接 `ai-digital-life.exe` 时 `PermissionDenied` | 先停掉 `pnpm dev` / `dev:tauri` |
| 只加 Rust 插件、没装 guest 插件 | 每条命令 5s 超时 | 补 `.env.e2e` + `main.tsx` 动态 import |
| 改了 e2e 配置但没重建 | 测试仍连旧 identifier/旧前端 | 重跑 `e2e:build`（它会重建 `dist`） |
| 并行工作树同时跑 | 4445 端口冲突 | 串行跑，或先确认端口空闲 |
