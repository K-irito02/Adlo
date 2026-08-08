# Mock Bridge 数据安全与流式模拟正确性经验（demo workspace 审查）

## 来源

2026-08-08 demo workspace 功能（`src/mock/demo/`）多轮代码审查与修复。功能通过 `withDemoMode(baseBridge)` 包装真实 `DigitalLifeBridge`，在演示工作区激活时以模拟数据接管读写。

## 经验

### 1. Bridge 包装器必须透传订阅通道（Critical）

`withDemoMode` 包装了 `subscribeModelStream` / `subscribeRunActivity`。若包装器只把监听器加入自己的 demo 监听集合，而 demo **未激活（默认状态）** 时不转发给 `baseBridge`，则 Tauri 真实流式事件全部静默丢失 —— 这是回归，测试无法捕获，因为测试桩的 base 订阅本身是 no-op。

**规则**：包装订阅方法时，同时注册到 `baseBridge` 并在返回的 unsubscribe 中同时解绑两处；`emit` 仍走自己的集合（demo 激活时驱动），base 通道负责非激活时的真实事件。双端各加一条注册，无重复泄漏。

### 2. 演示工作区的文件/git 写操作必须拦截（High）

demo 激活时 `open(DEMO_WORKSPACE_PATH)` 只改前端状态，**不会**设置 base 的 current workspace。若 `createFile` / `deleteFile` / `stageFile` / `switchGitBranch` 等透传到 base，会作用于**上一次打开的真实工作区** —— 右键删除演示 `README.md` 会真删真实文件的 README。

**规则**：包装器里所有文件/git 写操作在 demo 激活时返回 `{ok:false, error:{code, message}}` 只读错误（`IpcError.code` 接受 `ErrorCode | string`，用自定义字符串即可）。会话级写操作同理（`renameSession`/`archiveAllInWorkspace`/`createSession`/`reorderSessions`/`deleteSession`），不能落到 base 的 `sessions.find(...)!` 崩溃路径。

### 3. 事件时序：`done` 必须晚于最后一个 `delta`（High）

流式模拟器里若用固定魔法数计算完成时间（`1600 + 80*12 + 800`）而文本实际 25 字符（最后 delta 在 `1600+80*24`），`done` 会先于最后几个 `delta` 到达，消费方把 `done` 当终止标志会丢字。

**规则**：时间轴从数据派生：`total = start + interval*(text.length-1) + trailing`。注意嵌套定时器不要重复加基准偏移（内层用相对偏移，否则外层 1600ms 被叠加两次）。

### 4. `cancelMessage` 不得产生幻影运行或污染无关会话（High）

用 `buildDemoSendResult(DEMO_SESSION_IDS.tools, 'cancelled')` 构造取消结果会注册一个 `run-demo-<now>` 的幻影运行（且状态 `succeeded`），并改写 tools 会话的 `updatedAt` 等字段。取消应基于**传入的 runId** 直接构造 aborted detail，无任何副作用。

**规则**：取消/中止路径是纯函数式构造，不调用会写状态的构建器。

### 5. 单一消息源（Medium）

发送消息时若同时 `appendDemoUserMessage` 又让 `buildDemoSendResult` 返回一条用户消息，同一毫秒内 id 相同会重复。让 `buildDemoSendResult` 成为唯一生产者并负责追加到会话（或传入同一消息对象），且 runId 只生成一次并传入。

### 6. reset 必须覆盖全部可变状态（Medium）

`resetDemoModeForTest` 只清 demoState 时，会话变更与 live run activity 会跨测试泄漏。reset 需同时重置：demoState、模拟器（清 timers/集合）、demo 会话数据、live run activity。

### 7. 文件树必须满足嵌套契约（High）

`WorkspaceTreeNode` 递归渲染，目录必须把文件放进 `children`。返回扁平列表（每个文件都是顶层）会让演示文件树全部平铺、目录无法展开 —— 功能展示直接失效。对照复用 `buildWorkspaceTreeFromPaths` 的模式（ensureDir 递归建父链、按 kind 排序）。

### 8. 业务数据 id 与关联 id 要解耦（High）

patch set 的 `runId` 字段若写成 `'complete'` 而 run-activity 事件用 `DEMO_RUN_IDS.complete === 'run-demo-complete'`，`patchActions` 按 `patchSet.runId → getRun(runId)` 关联会落空。构造器签名区分「实体 id」与「关联 runId」，`getDemoPatchSet('patchset-demo-complete')` 返回 id 不变但 runId 用常量。

## 通用教训

- 包装器/装饰器类代码的测试桩（base 为 no-op）会系统性掩盖"未透传"类缺陷 —— 审查时重点核对非激活路径的真实转发。
- 只读演示/沙箱层必须枚举全部写方法逐一拦截，不可只拦读方法后依赖"反正 demo 不写"。
- mock 数据 id 用字符串常量（`DEMO_RUN_IDS`/`DEMO_SESSION_IDS`）集中定义并跨模块复用，避免魔法 id 漂移。
