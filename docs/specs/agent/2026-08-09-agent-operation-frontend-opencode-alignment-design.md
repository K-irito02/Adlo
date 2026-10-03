# Agent 操作展示：Server 收敛 + 前端 Part 渲染 + 桌面布局 —— OpenCode 对齐方案设计

> 日期：2026-08-09
> 状态：草稿（待评审）
> 前置：[2026-08-08-agent-operation-display-opencode-alignment-design.md](./2026-08-08-agent-operation-display-opencode-alignment-design.md)（后端 + 数据库，已完成并提交 26896959..117d2770）

## 1. 背景与目标

上一阶段仓库已完成后端对参考实现架构的对齐（Part 数据模型、多步工具循环、reasoning 流、
全套工具、SSE 事件流、旧格式清理），通过独立 axum HTTP 服务暴露：
- `GET /event` → SSE 事件流（`message.created/updated`、`message.part.updated/delta`、
  `session.status`、`question.asked/replied`），带 `after`/`Last-Event-ID` 断点重放
- `POST /question/{request_id}/reply` → 回答询问卡片

本阶段目标是打通前端到引擎的完整链路，并使**桌面端与浏览器端对 UI/交互全面对齐参考实现**：

1. **S1·Server 收敛**：把业务命令收敛进独立 Rust `adl-server` 二进制（axum HTTP）+ WebSocket PTY，
   前端 Bridge 统一走 HTTP/SSE，桌面 Tauri 仅保留系统能力 IPC
2. **S2·Part 渲染内核**：用 React 重写参考实现 `session-ui` 的消息/Part/工具/问询渲染，接入 SSE 流
3. **S3·桌面布局**：对标参考实现 `packages/app/src/pages/session` 的 timeline、文件 tab、Composer dock、窗口布局

## 2. 决策记录

| 决策点 | 结论 |
|--------|------|
| 前端渲染取向 | 完全对标参考实现（视觉 + 交互双高保真） |
| 迭代范围 | C 最大：完整桌面布局（S1 + S2 + S3） |
| 浏览器模式事件源 | 双端真实 SSE（浏览器 preview 由 dev 脚本拉起 Rust `adl-server`） |
| Rust 服务形态 | 新增独立 `crates/server` 二进制；桌面 Tauri 与浏览器都连它（与浏览器同协议） |
| 桌面桥接 | 业务统一走 HTTP（彻底收敛）；仅系统能力保留 Tauri invoke |
| PTY 归属 | WebSocket 全收敛（PTY 走 `adl-server` 的 `/pty` WebSocket，双端一致） |
| 视觉 Token | 仅会话区对齐（局部）：保留现有 tokens.css，Part/会话组件内部映射参考实现风格变量 |
| 旧前端格式 | `ConversationBlock` / `ConversationMessageRecord` 渲染路径逐步停用，由 Part 渲染替代 |
| 数据链路 | 复用后端已实现的 `SessionPartEvent` + SSE；不改后端工作区已有协议 |

## 3. 总体架构

```
┌──────────────────────────────────────────────┐
│  Rust Engine（crates/server => adl-server）  │
│  axum Router                                 │
│   GET  /event                     SSE 事件流   │
│   GET  /health                                │
│   POST /question/{id}/reply                   │
│   GET  /event                     SSE 事件流   │
│   GET  /health                                │
│   POST /question/{id}/reply                   │
│   REST：/session /message /agent /patch       │
│         /snapshot /provider /workspace ...    │
│   WS   /pty                       终端        │
└──────────────────────────────────────────────┘
            ▲ HTTP+SSE          ▲ HTTP+SSE          ▲ WS
     ┌──────┴──────┐      ┌───────┴───────┐
     │ Tauri 桌面  │      │ 浏览器 preview │
     │ httpBridge  │      │ httpBridge    │
     │ +SSE        │      │ +SSE          │
     │ 系统IPC:窗口/│      │ previewWorks-  │
     │ 对话框/WebView│     │ pace 系统能力  │
     └─────────────┘      └───────────────┘

前端桥接层（shared/ipc/digital-life.ts 契约不变）：
  Tauri:   httpBridge(adl-server) + createTauriWindowBridge/platformBridge
  Browser: httpBridge(adl-server) + previewWorkspaceService（系统能力）
  Mock:    内存演示（不变）
```

### 3.1 业务/系统能力二分

| 类别 | 命令（src-tauri/src/commands） | 去向 |
|------|-------------------------------|------|
| 业务 | conversation / agent(_loop/pipeline) / provider / patch / permission / snapshot / compaction / workspace(+sidebar/git/git_vis) / retrieval / search / command / commands_config / task / audit / subagent / lsp / mcp / reference / session_fork / durable / web_tools / custom_agent | 收敛进 `adl-server`（前端 HTTP 访问） |
| 系统 | browser（WebView2 是 OS 级表面）、pty（ConPTY） | 留在原生侧。PTY 经 `adl-server` `/pty` WebSocket 供前端；browser 仍走 Tauri invoke |
| 系统 | platform（reveal/对话框）、app 部分（窗口事件/写入日志） | 留 Tauri invoke（tauri-bridge 注入） |

`pty` 的 `SessionManager` 使用 `portable-pty`，不依赖 Tauri，可从 server 进程运行并桥接 WebSocket
（对应参考实现 `packages/server/src/handlers/pty.ts`）。

## 4. S1：Server 收敛

### 4.1 新增 `crates/server`（workspace 成员）

- `bin/main.rs`：解析 `--port` / `--data-dir`；`init_app_state` 等价物 → axum Router →
  绑定 `127.0.0.1:0`（随机）或指定端口。Tauri 断 pipe 退出时子进程退出。
- 路由表覆盖 §3.1 业务类，统一 `Result<IpcResult<T>, AppError>`（复用 `adl_errors`）
- SSE 复用现有 `SseEventBus` + `spawn_sse_server` 实现（从 `src-tauri` 抽到 `crates/server`）

### 4.2 前端 HTTP 桥

- 新增 `frontend/src/httpBridge.ts`：implements `DigitalLifeBridge`（fetch 封装 + EventSource）
- `tauri-bridge.ts` 重构：业务方法委托 `httpBridge(serverBaseUrl)`；系统能力保留
  `createTauriWindowBridge` / `platformBridge`（invoke）
- `preview-bridge`：`httpBridge` 指向 dev 脚本 spawn 的 `adl-server`；系统能力继续用
  `previewWorkspaceService`
- mock 不变
- **Server 地址发现**：桌面端由 `app.getInfo` 扩展/新命令返回本地端口；浏览器 preview 由 dev 脚本
  注入（`import.meta.env.VITE_ADL_SERVER_URL` / 运行时传入）

### 4.3 WebSocket PTY

- `adl-server` 提供 `/pty` WebSocket（opening handshake + terminal input/output、resize）
- 前端 `pty-bridge` 改为 WebSocket 客户端；`tauri-pty.ts` / `previewTerminalService` 收敛到同协议
- Tauri 侧不再走 `pty_commands` invoke（保留向后兼容骨架，后续清理）

### 4.4 验收（S1）✅ 完成（2026-08-10，Task 10）
- `cargo build`+`cargo clippy --workspace --all-targets -- -D warnings` 0 警告 ✅
- Browser `pnpm preview` 通过 dev 脚本拉起 `adl-server`，SSE 事件可送达前端 ✅
- 桌面端与浏览器端业务均通过同一 HTTP 桥 → 行为一致（双端一致验收脚本）✅
- Task 10 补充：桌面 Tauri 壳启动时 spawn `ad-server` 子进程（`--data-dir <app data dir> --port 0`），
  读取 `AD_SERVER_PORT=` 后经 `app_get_server_info` 暴露 baseUrl 给前端 `httpBridge`；子进程随
  Tauri 退出被 kill（Windows `taskkill /T /F`）。桌面 PTY 走 `/pty` WebSocket，流式订阅走
  `/event` SSE，与浏览器同协议。Tauri 侧仅保留系统能力 invoke（app/browser/platform/provider
  read-back/reserved/workspace-picker/log），迁移业务命令已删除。

## 5. S2：Part 渲染内核

定位：新建 `frontend/src/app/features/part-stream/`

### 5.1 数据层

- `PartStore`：session → messages → parts 嵌套映射，SSE one-way 更新
  - `message.created` → 插入消息；`message.part.updated` → upsert part
  - `message.part.delta` → 追加到 part 的 `text` / `reasoning` 字段
  - `session.status` → 会话 busy/idle 状态；`question.asked` → 待决询问
- 初始加载：进入会话页 `GET /session/{id}/message`（S1 新增历史拉取端点）拉历史 → 再开
  EventSource（`Last-Event-ID` 续接）
- `usePartStream(sessionId)` hook：打开/关闭 EventSource、自动重连、卸载清理

### 5.2 组件（对标参考实现 → React）

| 参考实现 `packages/session-ui` | React 组件（新建） |
|---|---|
| `message-part.tsx`（PART_MAPPING 注册表） | `PartRenderer`（`PART_MAPPING` + `registerPart`） |
| `basic-tool.tsx`（折叠工具卡 + 状态机） | `BasicToolCard`（collapsible，pending/running/completed/error） |
| `tool-error-card.tsx` | `ToolErrorCard`（错误展开） |
| `markdown.tsx`+worker（流式渲染） | `StreamingMarkdown`（文本增量 + worker 异步高亮，接入现有代码高亮） |
| `session-diff.ts`（diff 渲染） | `PartDiffPanel`（接入现有 diff-viewer） |
| `context`（groupParts + ContextToolGroup） | `ContextToolGroup`（read/glob/grep/list 聚合成一行） |
| `question-dock.tsx` | `AskCard`（`question.asked` → 选项；选择后 POST `/question/{id}/reply`） |
| `session-review.tsx` | `TurnSummary`（完成/错误摘要） |

### 5.3 视觉（局部对齐）

- 保留 `frontend/src/styles/tokens.css`；在现有 token 基础上新增一个**会话区副作用作用域**的
  局部变量映射（例如 `.adl-part-scope` 下定义近似参考实现的 `--color-quoted`、间距/圆角/状态色），
  使会话渲染贴近参考实现，但不波及全局 UI
- 会话区组件（工具卡、折叠面板、文本框、问询卡、错误卡）统一在该作用域内使用

### 5.4 测试

- `PartStore` reducer 单测：事件→状态 映射、漏序暂存、重连合并
- `StreamingMarkdown`：增量文本正确累积/替换、worker 高亮
- `BasicToolCard`：状态机转正确的渲染（进行/完成/失败）
- `AskCard`：question.asked → 提交 → question.replied
- 红绿先行（vitest），符合 mandatory-testing

### 5.5 验收（S2）✅ 完成（2026-08-10，Task 10）

- `pnpm --dir frontend test` 全绿（1464 tests，含新增 CenterPane.part 集成 4 + httpBridge replyToQuestion 2）✅
- `pnpm --dir frontend run lint` 0 errors、`pnpm --dir frontend run typecheck` 0 errors ✅
- `cargo clippy --workspace --all-targets -- -D warnings` 0 警告；`cargo test --workspace` 绿（Rust 侧未改动）✅
- 会话页以 Part 渲染为主路径（CenterPane → `PartConversation`）：浏览器与桌面共用同一
  `usePartStream` / `PartRenderer`，渲染无表面分支（双端一致）✅
- AskCard 回答接通 `POST /question/{id}/reply`（新增 `conversation.replyToQuestion`，
  contract + httpBridge + mock + preview 委托齐备，handle 空 body 200）✅
- 旧 `MessageStream`（ConversationMessageRecord）仅在无 Part 数据时兜底，未新增兼容层 ✅
- 用户消息文本缺口已定位并解决：Part wire 不含用户文本（MessageRecord 无 content 字段、
  loop 不给用户消息挂文本 part），从旧 ConversationMessageRecord 按「直接 id / assistant
  父跳（parentID→runId）」双路关联取回 ✅
- `message.created` 信息仅 `{ id, finish: null }` 的角色推断启发式已文档化
  （`resolvePartMessageRole`，见 PartConversation.tsx）✅

## 6. S3：桌面布局

对标参考实现 `packages/app/src/pages/session/`：

| 参考实现 | ADL |
|----------|-----|
| `timeline/message-timeline.tsx`（虚拟滚） | `SessionMessageList`（虚拟化，仅渲染视口内消息+占位） |
| `file-tabs.tsx`（会话文件 tab） | 复用现有编辑器 tabs 体系，与会话绑定 |
| `composer/session-question-dock.tsx`、`session-todo-dock.tsx`、`session-permission-dock.tsx`、`prompt-input` | `Composer`（复用现有输入框，补齐问询/待办/权限 dock） |
| `session-panel-layout.tsx`（左右面板约束） | 适配现有 `regions/` 布局（left-sidebar/center/right-panel）尺寸状态 |
| `session-side-panel.tsx` | 现有右侧面板适配会话上下文 |

> 与现有 ADL 侧边栏/面板区域映射，不必改动全局布局；仅会话页内部对齐。

### 6.1 验收（S3）✅ 完成（2026-08-11，Task 6）

- S3 会话布局组件落地：`PartTimeline`（虚拟化 timeline，对标
  `timeline/message-timeline.tsx`）、`SessionFileTabs`（会话文件 tab）、
  `SessionDocks`（Composer dock：AskCard + TurnSummary）、`SessionSidePanel`
  （会话文件 + patch 上下文侧栏）✅
- i18n：`partSessionFileTabs` / `partDocks` / `partSessionSidePanel` /
  `partSessionFiles` / `partSessionPatches` 五个 S3 key 在 en-US + zh-CN 均存在且
  `check:i18n` parity 全绿（1443 keys 完全一致），`CopyKey` 类型派生可解析 ✅
- CSS：S3 布局类全部落地于 `part-stream.css`（S3 区块，见 5.3 局部视觉作用域），
  仅消费全局 token（`var(--…)`），`--adl-part-*` scope-local 变量不泄漏到
  sibling 布局类（`part-stream-scope.test.ts` 新增 S3 类覆盖 + scope-var 审计）✅
- 滚动跟随对齐：`PartTimeline` 补齐与 `MessageStream` 相同的
  `onRowsRendered` + `scrollToRow` 底部跟随（新消息 / 流式 delta 到达时，
  若用户停留在底部则跟随；用户上滚时不强拉视口）✅
- 全量验收：`pnpm --dir frontend test` 全绿（1485 tests）、`lint` 0 errors、
  `typecheck` 0 errors、`check:i18n` 通过、`cargo test --workspace -- --skip google` 绿、
  `cargo clippy --workspace --all-targets -- -D warnings` 0 警告 ✅
- 双端一致：`PartTimeline` / `SessionFileTabs` / `SessionDocks` / `SessionSidePanel`
  共用同一 `usePartStream` / `PartRenderer` 渲染路径，Tauri 与浏览器模式无表面分支 ✅

## 7. 测试策略（全阶段）

1. **后端 S1**：axum handler 单元测试（现有全套 crates 测试保持绿）；新增 server 路由测试
2. **前端**：红绿测试（见 5.4）；`pnpm --dir frontend run lint`、`tsc --noEmit`
3. **双端一致**：Tauri 与浏览器演示同一会话渲染（事件驱动），行为一致
4. **端到端**：真实起 `ad-server` + 浏览器模式跑一轮（参考 `preview-workspace` Playwright 既有基建）

## 8. 非目标（本阶段不做）

- Http API / ACP / CodeMode 服务化（reserved 命令保持占位）
- 跨机型多窗口（继续单窗口）
- 与 `browser`/`github`/`git-vis` 等既有面板的重新排版（保留现有 region 结构）

## 9. 参考

- 参考实现（历史参考，本地副本已移除）：
  - 服务端：`packages/server/src/handlers/*.ts`、`packages/server/src/api.ts`、`packages/server/src/handlers/event.ts`（SSE 流）
  - Part 渲染：`packages/session-ui/src/components/message-part.tsx`、`basic-tool.tsx`、
    `tool-error-card.tsx`、`markdown.tsx`、`session-diff.ts`、`v2/*`
  - 桌面布局：`packages/app/src/pages/session/**`
  - PTY：`packages/server/src/handlers/pty.ts`
- ADL 现状：`crates/server` 尚未存在（待建）、`src-tauri/src/commands/**`、`frontend/src/{tauri-bridge,preview-bridge,mock-bridge}.ts`