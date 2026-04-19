# Tech Stack Alignment

## Summary

当前实现**已采用 Phase 0 基座和 Phase 2 单 Agent 薄切片所需的主栈**，其余仅保留为明确的后续项。

已采用的主栈：

- `TypeScript 5.x`
- `Electron`
- `Vite`
- `React 19`
- `Zustand`
- `SQLite + better-sqlite3`
- `Node.js`
- `Vitest`

尚未完全落地的栈项：

- `electron-builder`
- `pnpm` 作为实际执行入口

## Why The Current Subset Is Acceptable

当前实现的目标已经扩展为：

- 桌面壳层安全边界
- SQLite 状态真相源
- 工作区恢复
- Retrieval Worker
- React + Zustand 工作区主界面
- DeepSeek / MiniMax 模型路由与健康检查
- Patch 预览、应用、验证与回滚
- 命令审批与恢复审计
- 终端包 `executeStream` 与桌面 `digitalLife:terminalStream` 事件（与模型流式相同的安全模式：Main 执行、Renderer 只读订阅）

因此当前实现保留了 `stageOne` 核心主线的技术方向，但没有为了“名义对齐”提前引入未被当前 slice 使用的依赖。这样做的优点是：

- 降低 Phase 0 首批切片的依赖复杂度
- 避免提前引入未使用的运行时和打包层负担
- 让安全边界、恢复链路、SQLite 和 Worker 先稳定
- 把 `electron-builder` 和 `pnpm` 作为仍待收口的明确后续项，而不是隐性债务

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

已采用。

原因：

- Phase 2 工作区主界面已经进入多面板、会话、补丁、文件预览共享状态
- 引入 `Zustand` 后，Renderer 不再继续扩张手写 DOM 状态机

### pino

已采用。

原因：

- Main 和基础设施日志现在统一走 `pino`
- 结构化日志与上层 `Logger` 调用面保持解耦

### chokidar

已采用。

原因：

- 工作区文件变更检测已经切到事件驱动
- 当前阶段已需要外部修改冲突提示与上下文失效触发

### electron-builder

未采用。

原因：

- 当前重点是运行时链路验证，不是安装包和发布产物

### Playwright

已采用。

原因：

- 已补入阶段二工作区壳的浏览器级验收流
- 当前自动化覆盖 `会话 -> 补丁预览 -> 应用 -> 验证` 主链路

### pnpm

规范上仍以 `pnpm workspace` 为目标布局，但当前实际命令使用 `npm workspace` 兼容执行。

原因：

- 当前环境没有稳定可用的本地 `pnpm` 入口
- 为避免工具不可用阻塞实现，先使用 `npm` 承接执行命令，同时保留 `pnpm-workspace.yaml`

## Next Alignment Steps

当以下条件出现时，应回到 `stageOne` 的完整推荐栈：

- Renderer 出现跨页面共享状态：引入 `Zustand`
- 需要正式打包和安装：引入 `electron-builder`
- 本地工具链稳定后：切换到 `pnpm` 作为实际执行入口