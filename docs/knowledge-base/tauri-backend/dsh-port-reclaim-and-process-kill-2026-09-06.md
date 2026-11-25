# dsh 子进程端口占用释放与进程管理 — 2026-09-06

## 背景

"打开 DeepSeek Harness"按钮无反应，根因是 npx 拉起的 dsh 固定监听 `127.0.0.1:3080`（忽略 `--port`），而残留的旧 dsh 进程仍占着 3080，新进程 `EADDRINUSE` 退出，健康检查在 60s 后超时报 `Timeout: npx not ready within 60s`。

## 结论

### 1. 托管的 Web 应用可能忽略 `--port`，固定端口更可靠
`@deepseek-ai/dsh` 的 web 配置把监听端口写死为 3080。宿主 `pick_free_port` 选的端口根本没被用上。因此"宿主选空闲端口→传 `--port`"的模式对这类应用无效。改用：**探测固定默认端口，就绪即复用**。

### 2. 端口占用探测 → 精确解析，勿用子串
- `netstat -ano` 行内 `contains(":3080")` 会误匹配 `:30800` 等相似端口。应取本地地址 token，按最后一个 `:` 后的段与端口精确相等，且状态为 `LISTENING`。
- 解析抽成纯函数（输入为命令 stdout 文本）便于单测。

### 3. 杀进程的健壮性
- **PID 去重**：netstat 对同一监听（`0.0.0.0:3080` 与 `[::]:3080`）可能输出两行同 PID。去重后只 taskkill 一次，否则第二次打已死 PID 报非零退出。
- **kill 失败不 `?` 中断**：单个 PID 在 netstat 与 kill 之间已退出的情形很常见；失败应 `tracing::warn` 后继续尝试其余 PID。
- **以"端口最终是否空闲"为判定**：kill 后轮询 `TcpListener::bind` 直到确认端口可绑（有界重试），而非 kill 成功即认为完成。
- **kill 工具退出码要检查**：`taskkill`/`kill` 非零（权限不足、进程不存在）要转成结构化错误或日志。

### 4. 平台差异
- Windows：`netstat -ano` → PID；`powershell (Get-CimInstance Win32_Process …).CommandLine` 取命令行判断是否 dsh 残留；`taskkill /PID /F` 终止。
- 非 Windows：`lsof -ti tcp:<port>`（缺失应回退空结果而非硬失败）；命令行读 `/proc/<pid>/cmdline`（NUL 分隔；macOS/BSD 无 `/proc`，为已知限制）。
- 判断"是否残留 dsh"用命令行含 `@deepseek-ai/dsh`（正/反斜杠两种写法）或 `\dsh\lib\bin.js` 作标记，避免误杀无关服务。

### 5. 并发 open 需独立 start-lock
`spawn_and_wait_ready` 可能阻塞数十秒，不能用状态互斥锁包住（会挡住 close/revert/uninstall）。应加**独立的 `Arc<AsyncMutex<()>>` 启动锁**只串行化端口处置 + 来源探测 + spawn；拿锁后二次检查状态（等待期间可能已被并发方启动），锁序严格 `start_lock → dsh_state`，无 ABBA 死锁。

### 6. IPC 结构变更要同步三桥与前端类型
`/dsh/open` 现返回 `{status:'opened', url}`（就绪）或 `{status:'port_occupied', occupant}`（端口被占用，交前端确认）；只有 `force=true` 才结束占用者。需同步：`shared/ipc/dsh.ts` 类型、`httpBridge.ts`、`tauri-bridge/tauri-dsh.ts`（消费 `.url`）、`mock/mock-dsh.ts` 与 store action 返回值。旧的 `{url, freedPort}` / `DSH_FREED_PORT` 提示已删除。

## 关联
- 根因进度：`docs/root-cause-resolution/2026-09/progress-2026-09-06-034300.md`
- 收尾记录：`docs/closing-workflow/2026-09/progress-2026-09-06-220000.md`
