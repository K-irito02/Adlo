# Tech Stack Alignment

## Summary

当前实现**部分采用并严格受限于** `stageOne/README.md` 定义的技术栈。

已采用的主栈：

- `TypeScript 5.x`
- `Electron`
- `Vite`
- `SQLite + better-sqlite3`
- `Node.js`
- `Vitest`

尚未在当前薄切片正式落地的栈项：

- `electron-builder`
- `Zustand`
- `pino`
- `chokidar`
- `Playwright`
- `pnpm` 作为实际执行入口

## Why The Current Subset Is Acceptable

当前薄切片的目标是验证：

- 桌面壳层安全边界
- SQLite 状态真相源
- 工作区恢复
- Retrieval Worker

因此当前实现保留了 `stageOne` 核心主线的技术方向，但没有为了“名义对齐”提前引入未被当前 slice 使用的依赖。这样做的优点是：

- 降低 Phase 0 首批切片的依赖复杂度
- 避免提前引入未使用的运行时和打包层负担
- 让安全边界、恢复链路、SQLite 和 Worker 先稳定
- 把后续 `Zustand / Playwright / chokidar / electron-builder / pino` 的接入保持为明确的下一步，而不是隐性债务

## Alignment Decision By Item

### TypeScript

已采用。

原因：

- 类型化 IPC、SQLite 状态结构、Worker 消息契约都直接受益

### Electron

已采用。

原因：

- 当前目标本身就是桌面壳层、Preload、Renderer、Worker 边界

### Vite

已采用。

原因：

- 当前 Renderer 很轻，Vite 足以支撑开发和打包

### SQLite + better-sqlite3

已采用。

原因：

- 当前切片已经需要可靠状态真相源和本地恢复链路

### Zustand

未采用。

原因：

- 当前 Renderer 只有轻量页面状态，没有达到引入全局状态库的复杂度门槛

### pino

未采用。

原因：

- 当前日志需求以启动链路、恢复链路和本地摘要为主，自定义轻量 logger 足够
- 等到日志结构、传输和审计要求进一步扩大时，再切换到 `pino`

### chokidar

未采用。

原因：

- 当前 retrieval worker 只做首次扫描和状态回传，尚未进入文件监听与增量更新阶段

### electron-builder

未采用。

原因：

- 当前重点是运行时链路验证，不是安装包和发布产物

### Playwright

未采用。

原因：

- 当前已建立单测、构建和启动烟测证据
- 等桌面交互路径再稳定一轮后，引入 Playwright 覆盖 E2E 更合适

### pnpm

规范上仍以 `pnpm workspace` 为目标布局，但当前实际命令使用 `npm workspace` 兼容执行。

原因：

- 当前环境没有稳定可用的本地 `pnpm` 入口
- 为避免工具不可用阻塞实现，先使用 `npm` 承接执行命令，同时保留 `pnpm-workspace.yaml`

## Next Alignment Steps

当以下条件出现时，应回到 `stageOne` 的完整推荐栈：

- Renderer 出现跨页面共享状态：引入 `Zustand`
- Retrieval 进入文件监听和增量更新：引入 `chokidar`
- 日志进入结构化、传输、脱敏和审计强化：切换 `pino`
- 需要正式打包和安装：引入 `electron-builder`
- 需要可重复桌面回归验证：引入 `Playwright`
- 本地工具链稳定后：切换到 `pnpm` 作为实际执行入口
