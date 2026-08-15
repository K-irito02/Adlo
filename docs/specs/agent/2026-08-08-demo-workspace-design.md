# 演示工作区（Demo Workspace）设计

日期：2026-08-08
状态：已获用户逐节批准

## 背景与目标

用户希望观察、查看「中间对话区域」的相关 UI/UX 效果（用户发送内容、Agent 思考过程、Agent 任务执行、Agent 网络搜索、Agent 终端命令执行、文件修改、Agent 回复内容等）。当前浏览器预览模式只 seed 了一个空会话，打开只能看到 WelcomeState。

目标：新增一个**独立演示工作区入口**，内含**完整覆盖所有类型的模拟对话**，让用户可以在真实渲染管线下观察 UI/UX；若相关 UI/UX 未实现则补齐。

## 需求决策（与用户确认）

| 决策点 | 结论 |
|--------|------|
| 呈现方式 | 新增独立演示工作区入口（左侧工作区列表） |
| 内容范围 | 完整覆盖所有类型（9 种 block + RunSummary 全组 + 全事件类型） |
| 交互行为 | 静态完整历史对话 + 可选模拟流式交互 |
| 运行模式 | Tauri + 浏览器双端可用，前端 mock 数据驱动，零 Rust 改动 |
| 模拟语言 | 对话内容（模拟 LLM 输出）用简体中文；产品 UI 文本走 i18n key |

## 总体架构

一个前端演示数据层 + 一个演示感知的 Bridge 包装器，双端注册。

```
frontend/src/mock/demo/
├── demo-workspace.ts        # 演示工作区 meta + 文档树 + git 快照
├── demo-conversation.ts     # 3 个演示会话 + 完整多轮历史（覆盖全部 9 种 block）
├── demo-run-activity.ts     # 每个 runId 的活动事件 + token 用量
├── demo-stream-simulator.ts # 时序驱动的流式模拟器（delta/run-activity 定时推送）
└── demo-mode.ts             # withDemoMode(baseBridge) 包装器
```

接线方式：

```
main.tsx
├─ Tauri:   window.digitalLife = withDemoMode(createTauriBridge())
└─ Browser: setupPreviewBridge() 内部包 withDemoMode(previewBridge)
```

## 演示工作区

- `RecentWorkspaceEntry`：id=`workspace-demo`，name=演示工作区（i18n key），path=虚拟路径，置顶、不可移除
- 文档树：与消息内容呼应的虚拟文件（`frontend/src/main.tsx`、`README.md`、`Resume/index.html` 等），`readFile`/`listTree`/`getChangePreview`/`getGitStatus` 返回演示数据
- 点击入口 → `actions.openWorkspace(demoPath)` → `withDemoMode` 检测演示路径，返回演示工作区 meta 并激活 `demoState`

## 三个演示会话

### ① 综合演示（demo-session-complete，code-edit）

最完整的单 Agent 代码修改流程：

用户消息 → markdown 分析 → **plan block**（analyze/search/read/edit/command/verify 6 种步骤 + medium/high 风险标签）→ **tool-call block**（webSearch/webFetch/readFile）→ **execution-step block**（pending/running/completed/failed 4 态 + 子 toolCalls）→ **command-output block**（多行 stdout/stderr + exitCode）→ **patch-summary block** → **validation-result block**（passed/failed/skipped 各一）→ **execution-summary block**（succeeded 态）→ **final-summary block** → RunSummaryBlock 全部 9 组活动日志 + TokenUsage。

### ② 计划与审批（demo-session-plan，plan）

Plan Mode + 审批流：

用户输入计划类指令 → **plan block**（全 pending/逐条 completed）→ **approval block**（low/medium/high 三种风险级别各一条）→ **validation-result block**（failed，附诊断列表）→ **execution-summary block**（rolled-back 态 + rollbackReason）→ run 活动含 approval requested/decided + error 事件。

### ③ 搜索与工具（demo-session-tools，chat）

网络搜索 + 工具链：

用户提问 → 流式回复（markdown block + streaming 效果）→ **tool-call block**（webSearch 多条搜索结果）→ **command-output block**（git 命令输出）→ 空/最小场景（验证 failed）→ run 活动含 search/context-added/model 事件。

### 数据要求

- 每个 assistant 消息带独立 `runId`
- `demo-run-activity.ts` 为每个 run 预生成覆盖全部事件类型的活动日志：run-start / context-added / file-read / search / command / patch / approval / model / error / run-done
- 每条消息的 `blocks` 组合各不相同，确保 MessageBlocks 的 9 个分支 + 各 block 内部状态组合全部被渲染到

## 模拟流式交互

`demo-stream-simulator.ts` 提供 `simulateSend(activeSessionId, userContent)`，被演示模式的 `conversation.sendMessage` 调用。

- 发送后立即 append 用户消息，创建新演示 run（`run-demo-<ts>`），返回结果
- 按时间线逐步 push 事件到已注册订阅者（复用现有 `createModelStreamSubscriber` / `createRunActivitySubscriber` 管道）：

```
t+0s     model/route（设 streamingActiveRunId，UI 出现「生成中」+ streaming-run-summary）
t+0.3s   run-start + context-added×2 + file-read
t+0.8s   search（webSearch 命中 3 条）+ model/route
t+1.2s   command（start）+ command（done, exitCode 0）
t+1.6s   model/delta「我在分析...」→ 逐字流式（每 ~80ms 一个 delta，持续 ~2s）
t+3.5s   patch（proposed）+ approval（requested）→ 若需要批准
t+4.2s   model/delta 继续 → 输出 markdown 回复
t+5.5s   model/done → append 最终 assistant 消息（带完整 blocks）
```

- 用 `window.setTimeout` 链驱动，支持 `cancelActiveStream`（清空定时器 + 发 run-done）
- 流式完成后把最终 assistant 消息写入演示会话，`refreshAfterSend` 重新拉取 → UI 从 streaming 平滑过渡到静态消息 + RunSummaryBlock

## withDemoMode 包装器

- 维护模块级 `demoState`（是否处于演示工作区、活动会话 id、模拟器实例）
- **未激活** → 全部透传 `baseBridge`
- **已激活** → `conversation`/`workspace`/`runActivity`/`patch`/`webTools` 相应方法改写为演示数据；`subscribeModelStream`/`subscribeRunActivity` 由模拟器接管
- 演示数据保存在**独立内存模块**（`demoState`），不复用 `mock-shared-*` 全局会话，避免污染普通会话
- 离开演示工作区 → `demoState.active = false`，恢复透传

## i18n 策略

- **模拟对话内容**（用户消息、Agent 思考/回复、block 摘要、工具输出）→ 简体中文 mock 数据，不走 i18n（模拟 LLM 输出，随用户消息语言变化）
- **产品 UI 文本**（工作区名「演示工作区」、会话标题、入口标签）→ i18n key（zh-CN + en-US），遵守「UI 展示文本禁止硬编码」规则

## 测试与质量门禁

| 层 | 测试 | 覆盖 |
|----|------|------|
| 演示数据 | `demo-conversation.test.ts` | 3 个演示会话的消息/blocks 结构完整；9 种 block 全覆盖；每个 assistant 消息 runId 有对应活动日志 |
| 模拟器 | `demo-stream-simulator.test.ts` | vitest fake timers：事件按时间线推送；model/done 后 append 最终消息；cancel 清空定时器；订阅者收到 route/delta/done |
| Bridge 包装 | `demo-mode.test.ts` | 未激活透传；激活时返回演示数据；退出后恢复透传 |
| UI 集成 | `MessageStream.test.tsx` 扩展或新增 | 用演示会话数据渲染，断言 plan/execution-step/patch-summary/RunSummaryBlock 等元素出现 |
| 工作区入口 | `WorkspaceList.test.tsx` 扩展 | 演示工作区条目出现、置顶、带演示图标、点击触发 openWorkspace |

质量门禁：`pnpm --dir frontend run lint`（0 errors）、`pnpm --dir frontend run test`、`npx tsc --noEmit`、双端手动验证。

## 约束遵守

- 对话内容用中文 mock，UI 文本走 i18n key
- 不引入新的第三方依赖（模拟器用原生 setTimeout）
- 不污染 `mock-shared-*` 全局状态，演示数据独立模块化
- 双端一致性：浏览器 + Tauri 都能进演示工作区
- 零 Rust 改动，无新 IPC，无新增 capability
