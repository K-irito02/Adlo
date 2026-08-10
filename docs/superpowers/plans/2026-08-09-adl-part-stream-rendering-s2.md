# S2 · Part 渲染内核（OpenCode 对齐前端 Part 渲染）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 React 实现 OpenCode `session-ui` 对齐的消息/Part/工具/问询渲染内核，接入 S1 的 SSE 事件流与 Part 历史数据，替换现有旧 `ConversationBlock` 渲染路径。

**Architecture:** 新建 `frontend/src/app/features/part-stream/` 数据层（PartStore：session→messages→parts 嵌套映射，SSE one-way 更新）+ 组件层（PartRenderer 注册表 + BasicToolCard/ToolErrorCard/StreamingMarkdown/PartDiffPanel/ContextToolGroup/AskCard/TurnSummary），消费 S1 已交付的 `GET /session/{id}/message` 历史端点 + `/event` SSE（`message.part.*` / `message.created/updated` / `session.status` / `question.*`）。数据源为 S1 的 `MessageRecord`/`PartRecord`（Part 数据模型），渲染对标 OpenCode `message-part.tsx`（PART_MAPPING + groupParts）。

**Tech Stack:** React 19 + TS、Zustand（Store 状态）、markdown-it + highlight.js（流式 Markdown）、CodeMirror lang 包（diff 渲染）、EventSource、vitest（红绿测试）。

## Global Constraints

- 双端一致（AGENTS.md 硬性）：Tauri 桌面与浏览器共用同一 httpBridge、同一 ad-server、同一 SSE 端点/协议；Part 渲染在双端表现一致
- 数据模型对齐：Part 类型（`PartRecord`/`MessageRecord`/`PartData`/`PartType`/`ToolState`/`SessionPartEvent`）以 `crates/types/src/types/part.rs` 的 serde camelCase/kebab-case wire 为准（Rust 侧已实现，S2 在 frontend 加对应的 TS 类型镜像）
- 历史数据源：`GET /session/{session_id}/message` 返回 `{ "messages": [ { "message": MessageRecord, "parts": [PartRecord] } ] }`（S1 已实现，`crates/server/src/handlers/conversation.rs::get_session_messages`）
- SSE 事件源：`/event`（`message.part.updated` / `message.part.delta` / `message.created` / `message.updated` / `session.status` / `question.asked` / `question.replied`），断点续传 `?after`/`Last-Event-ID`（S1 已实现）
- i18n 硬性（AGENTS.md）：所有 UI 展示文本（按钮/Tooltip/aria-label/占位符/相对时间/日期格式/面包屑标签映射）必须使用 i18n key，禁止硬编码
- 红绿测试先行（mandatory-testing）：Rust `cargo test --workspace -- --skip google`、前端 `pnpm --dir frontend run test`、`cargo clippy --workspace --all-targets -- -D warnings` 0、`pnpm --dir frontend run lint` 0 errors
- 视觉 Token：仅会话区局部对齐（保留现有 `tokens.css`）；会话区组件在 `.adl-part-scope` 作用域内使用局部变量映射
- 禁止向后兼容 shim：旧 `ConversationBlock` 渲染路径逐步停用（由 Part 渲染替代），本阶段不新增旧路径兼容层
- 未发布阶段禁止数据格式兼容/迁移代码

---

### Task 1: 前端 Part 类型 + `getSessionMessages` 桥方法

**Files:**
- Create: `frontend/src/kernel/types-part.ts`（`MessageRecord`/`PartRecord`/`PartData`/`PartType`/`ToolState`/`ToolTime`/`TextPartData`/`ReasoningPartData`/`ToolPartData`/`FilePartData`/`PatchPartData` 的 TS 镜像，wire 对齐 Rust `part.rs`）
- Modify: `frontend/src/shared/ipc/conversation.ts`（`ConversationBridge` 增加 `getSessionMessages(sessionId)`）
- Modify: `frontend/src/httpBridge.ts`（实现 `getSessionMessages` → `GET /session/{id}/message`）
- Modify: `frontend/src/mock-bridge.ts`（mock 实现）
- Modify: `frontend/src/preview-bridge/index.ts` + `frontend/src/tauri-bridge/index.ts`（三桥接线）
- Test: `frontend/src/kernel/__tests__/types-part.test.ts`

**Interfaces:**
- Consumes: S1 的 `GET /session/{session_id}/message` 端点（返回 `{messages:[{message,parts}]}`）；现有 `IpcResult<T>` 契约
- Produces: `types-part.ts` 导出的 `MessageRecord`/`PartRecord`/`PartData`/`PartType`/`ToolState`；`ConversationBridge.getSessionMessages(sessionId): Promise<IpcResult<SessionMessagesPayload | undefined>>`，其中 `SessionMessagesPayload = { messages: { message: MessageRecord; parts: PartRecord[] }[] }`

- [ ] **Step 1: 写失败测试（类型 roundtrip）**

`frontend/src/kernel/__tests__/types-part.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { PartRecord, PartType, ToolState, PartData } from '../types-part';

describe('types-part wire shapes', () => {
  it('PartType kebab-case values', () => {
    const types: PartType[] = ['text', 'reasoning', 'tool', 'file', 'step-start', 'step-finish', 'patch', 'snapshot'];
    expect(types).toContain('text');
    expect(types).toContain('step-start');
  });

  it('ToolState discriminated on status', () => {
    const state: ToolState = {
      status: 'completed',
      input: { path: 'a.txt' },
      output: 'ok',
      title: undefined,
      metadata: {},
      time: { start: 1700000000000, end: 1700000001000 },
    };
    expect(state.status).toBe('completed');
  });

  it('PartData tagged on type', () => {
    const part: PartData = { type: 'text', text: 'hello' };
    expect(part.type).toBe('text');
  });

  it('PartRecord camelCase wire', () => {
    const rec: PartRecord = {
      id: 'p1',
      messageID: 'm1',
      sessionID: 's1',
      type: 'tool',
      ordinal: 0,
      timeCreated: 1700000000000,
      data: { type: 'tool', tool: 'read', callID: 'c1', state: { status: 'pending', input: {} } },
    };
    expect(rec.messageID).toBe('m1');
    expect(rec.sessionID).toBe('s1');
    expect(rec.timeCreated).toBe(1700000000000);
  });
});
```
> 类型必须以 `as const`/literal 形式可用；测试验证 wire 命名（camelCase `messageID`/`sessionID`/`timeCreated`、kebab-case `step-start`）而非内部字段名。具体字段类型以 `crates/types/src/types/part.rs` 为准。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend test -- types-part`
Expected: FAIL（`types-part` 模块不存在，import 解析失败）。

- [ ] **Step 3: 实现 `types-part.ts`**

按 Rust `part.rs` 逐字段镜像（serde rename 一致）：
```ts
// frontend/src/kernel/types-part.ts
export type PartType =
  | 'text' | 'reasoning' | 'tool' | 'file'
  | 'step-start' | 'step-finish' | 'patch' | 'snapshot';

export interface MessageRecord {
  id: string;
  sessionID: string;
  role: string; // 'user' | 'assistant'
  parentID?: string;
  agent?: string;
  model?: unknown;
  summary?: unknown;
  timeCreated: number;
  timeCompleted?: number;
}

export interface ToolTime { start: number; end?: number }

export type ToolState =
  | { status: 'pending'; input: unknown }
  | { status: 'running'; input: unknown; title?: string; metadata?: unknown }
  | { status: 'completed'; input: unknown; output: string; title?: string; metadata?: unknown; time: ToolTime }
  | { status: 'error'; input: unknown; error: string; metadata?: unknown; time: ToolTime };

export interface TextPartData { text: string }
export interface ReasoningPartData { text: string }
export interface ToolPartData { tool: string; callID: string; state: ToolState }
export interface FilePartData { mime: string; filename?: string; url: string }
export interface PatchPartData { hash: string; files: string[] }

export type PartData =
  | ({ type: 'text' } & TextPartData)
  | ({ type: 'reasoning' } & ReasoningPartData)
  | ({ type: 'tool' } & ToolPartData)
  | ({ type: 'file' } & FilePartData)
  | { type: 'step-start' }
  | { type: 'step-finish' }
  | ({ type: 'patch' } & PatchPartData)
  | { type: 'snapshot'; snapshot: string };

export interface PartRecord {
  id: string;
  messageID: string;
  sessionID: string;
  type: PartType;
  ordinal: number;
  timeCreated: number;
  data: PartData;
}

export interface SessionMessagesEntry { message: MessageRecord; parts: PartRecord[] }
export interface SessionMessagesPayload { messages: SessionMessagesEntry[] }
```
> `PartData` 是带 `type` tag 的判别联合（Rust `#[serde(tag = "type")]`），`ToolState` 带 `status` tag。`PartRecord.data` 直接用 `PartData`（wire 上已带 `type`）。如某些字段 Rust 用 `serde_json::Value`（如 `model`），TS 用 `unknown`。

- [ ] **Step 4: 桥方法 + 三桥接线**

`frontend/src/shared/ipc/conversation.ts` 的 `ConversationBridge` 增加：
```ts
getSessionMessages: (
  sessionId: string,
) => Promise<IpcResult<SessionMessagesPayload | undefined>>;
```
（import `SessionMessagesPayload` from `../kernel/types-part`）

`frontend/src/httpBridge.ts` conversation 域增加（对齐现有 `call<T>` 模式）：
```ts
getSessionMessages: (sessionId) =>
  call<SessionMessagesPayload>(baseUrl, `/session/${sessionId}/message`, { method: 'GET' }),
```
`frontend/src/mock-bridge.ts` 增加 mock 实现（返回空 messages 或演示数据，与现有 mock 风格一致）。
`frontend/src/preview-bridge/index.ts` + `frontend/src/tauri-bridge/index.ts` 三桥同步（tauri-bridge 委托 httpBridge；preview-bridge 委托 httpBridge/preview 实现）。

- [ ] **Step 5: 绿**

Run: `pnpm --dir frontend test`（含新 types-part 测试）
Expected: PASS；`pnpm --dir frontend run typecheck`（tsc --noEmit）0 错误；`pnpm --dir frontend run lint` 0 errors。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/kernel/types-part.ts frontend/src/shared/ipc/conversation.ts frontend/src/httpBridge.ts frontend/src/mock-bridge.ts frontend/src/preview-bridge/index.ts frontend/src/tauri-bridge/index.ts
git commit -m "feat(frontend): add Part data types and getSessionMessages bridge method"
```

---

### Task 2: PartStore（session→messages→parts 嵌套映射 + SSE reducer）

**Files:**
- Create: `frontend/src/app/features/part-stream/PartStore.ts`（纯 reducer + selector，不依赖 React）
- Create: `frontend/src/app/features/part-stream/partStoreTypes.ts`（PartState/PartAction/selector 类型）
- Create: `frontend/src/app/features/part-stream/__tests__/PartStore.test.ts`
- Test: `frontend/src/app/features/part-stream/__tests__/PartStore.test.ts`

**Interfaces:**
- Consumes: `types-part.ts` 的 `MessageRecord`/`PartRecord`/`PartData`；SSE wire 事件（`message.part.updated`/`message.part.delta`/`message.created`/`message.updated`/`session.status`/`question.asked`/`question.replied`，字段 `sessionID`/`messageID`/`partID`/`field`/`delta`/`info`/`part`）；`getSessionMessages` 返回的 `SessionMessagesPayload`
- Produces: `PartStore` 纯函数——`createInitialPartState() -> PartState`、`reducePartEvent(state, event) -> PartState`（处理单个 SSE 事件）、`hydratePartHistory(state, payload) -> PartState`（历史加载）、selector——`selectSessionMessages(state, sessionId)`、`selectSessionStatus(state, sessionId)`、`selectSessionQuestions(state, sessionId)`；`PartState = Record<sessionId, SessionPartState>`，`SessionPartState = { messages: Map<messageId, MessageRecord>; partsByMessage: Map<messageId, PartRecord[]>; status: 'idle' | 'busy' | 'error' | 'cancelled'; questions: QuestionEntry[] }`

- [ ] **Step 1: 写失败测试（reducer：message.created → part.updated → part.delta → status）**

`frontend/src/app/features/part-stream/__tests__/PartStore.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  createInitialPartState,
  reducePartEvent,
  hydratePartHistory,
  selectSessionMessages,
  selectSessionStatus,
} from '../PartStore';

describe('PartStore reducer', () => {
  it('message.created inserts a message', () => {
    let s = createInitialPartState();
    s = reducePartEvent(s, {
      type: 'message.created',
      sessionID: 's1',
      info: { id: 'm1', role: 'assistant' },
    });
    expect(selectSessionMessages(s, 's1').messages.size).toBe(1);
  });

  it('message.part.updated upserts a part', () => {
    let s = createInitialPartState();
    s = reducePartEvent(s, { type: 'message.created', sessionID: 's1', info: { id: 'm1', role: 'assistant' } });
    s = reducePartEvent(s, {
      type: 'message.part.updated',
      sessionID: 's1',
      messageID: 'm1',
      partID: 'p1',
      part: { id: 'p1', type: 'text', text: 'hi', ...emptyPartRecord('s1', 'm1', 'p1') },
    });
    const msgs = selectSessionMessages(s, 's1');
    expect(msgs.partsByMessage.get('m1')?.length).toBe(1);
    expect(msgs.partsByMessage.get('m1')?.[0].data.text).toBe('hi');
  });

  it('message.part.delta appends to text part', () => {
    let s = createInitialPartState();
    s = reducePartEvent(s, { type: 'message.created', sessionID: 's1', info: { id: 'm1', role: 'assistant' } });
    s = reducePartEvent(s, {
      type: 'message.part.updated',
      sessionID: 's1', messageID: 'm1', partID: 'p1',
      part: { id: 'p1', type: 'text', text: '', ...emptyPartRecord('s1', 'm1', 'p1') },
    });
    s = reducePartEvent(s, { type: 'message.part.delta', sessionID: 's1', messageID: 'm1', partID: 'p1', field: 'text', delta: 'Hello' });
    s = reducePartEvent(s, { type: 'message.part.delta', sessionID: 's1', messageID: 'm1', partID: 'p1', field: 'text', delta: ' world' });
    const part = selectSessionMessages(s, 's1').partsByMessage.get('m1')?.[0];
    expect(part?.data.text).toBe('Hello world');
  });

  it('message.part.delta appends to reasoning field', () => {
    let s = createInitialPartState();
    s = reducePartEvent(s, { type: 'message.created', sessionID: 's1', info: { id: 'm1', role: 'assistant' } });
    s = reducePartEvent(s, {
      type: 'message.part.updated',
      sessionID: 's1', messageID: 'm1', partID: 'p1',
      part: { id: 'p1', type: 'reasoning', text: '', ...emptyPartRecord('s1', 'm1', 'p1'), data: { type: 'reasoning', text: '' } },
    });
    s = reducePartEvent(s, { type: 'message.part.delta', sessionID: 's1', messageID: 'm1', partID: 'p1', field: 'reasoning', delta: 'think' });
    const part = selectSessionMessages(s, 's1').partsByMessage.get('m1')?.[0];
    expect(part?.data.text).toBe('think');
  });

  it('session.status sets session status', () => {
    let s = createInitialPartState();
    s = reducePartEvent(s, { type: 'session.status', sessionID: 's1', status: 'busy' });
    expect(selectSessionStatus(s, 's1')).toBe('busy');
  });

  it('hydratePartHistory loads messages+parts', () => {
    let s = createInitialPartState();
    s = hydratePartHistory(s, 's1', {
      messages: [
        { message: { id: 'm1', sessionID: 's1', role: 'assistant', timeCreated: 0 }, parts: [
          { id: 'p1', messageID: 'm1', sessionID: 's1', type: 'text', ordinal: 0, timeCreated: 0, data: { type: 'text', text: 'history' } },
        ] },
      ],
    });
    const msgs = selectSessionMessages(s, 's1');
    expect(msgs.messages.size).toBe(1);
    expect(msgs.partsByMessage.get('m1')?.[0].data.text).toBe('history');
  });
});

function emptyPartRecord(sessionID: string, messageID: string, id: string) {
  return { id, messageID, sessionID, type: 'text', ordinal: 0, timeCreated: 0 };
}
```
> `emptyPartRecord` 只是测试辅助；PartRecord 的 `type` 字段（PartType）与 `data.type`（PartData）在 wire 上并存（`PartRecord.type` 是行级字段，`data` 内 `type` 是 payload tag）——reducer 以 `data` 为准渲染，`type` 用于快速过滤。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend test -- PartStore`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `PartStore.ts` + `partStoreTypes.ts`**

`partStoreTypes.ts`:
```ts
import type { MessageRecord, PartRecord } from '../../../kernel/types-part';

export interface QuestionEntry {
  requestID: string;
  questions: unknown[];
  tool?: unknown;
}

export interface SessionPartState {
  messages: Map<string, MessageRecord>;
  partsByMessage: Map<string, PartRecord[]>;
  status: 'idle' | 'busy' | 'error' | 'cancelled';
  questions: QuestionEntry[];
}

export type PartState = Record<string, SessionPartState>;

export type SseWireEvent =
  | { type: 'message.created'; sessionID: string; info: { id: string } & Record<string, unknown> }
  | { type: 'message.updated'; sessionID: string; info: { id: string } & Record<string, unknown> }
  | { type: 'message.part.updated'; sessionID: string; messageID: string; partID: string; part: Record<string, unknown> }
  | { type: 'message.part.delta'; sessionID: string; messageID: string; partID: string; field: string; delta: string }
  | { type: 'session.status'; sessionID: string; status: string }
  | { type: 'question.asked'; sessionID: string; requestID: string; questions: unknown[]; tool?: unknown }
  | { type: 'question.replied'; sessionID: string; requestID: string; answers: unknown[] };
```
> `SseWireEvent` 与 Rust `SessionPartEvent`（part.rs:143-200）wire 完全一致（camelCase tag + 字段）。

`PartStore.ts`（纯函数，不可变更新，返回新 state）:
```ts
import type { PartRecord, MessageRecord } from '../../../kernel/types-part';
import type { PartState, SessionPartState, SseWireEvent } from './partStoreTypes';

export function createInitialPartState(): PartState {
  return {};
}

function sessionState(state: PartState, sessionID: string): SessionPartState {
  return state[sessionID] ?? { messages: new Map(), partsByMessage: new Map(), status: 'idle', questions: [] };
}

function cloneSession(prev: SessionPartState): SessionPartState {
  return {
    messages: new Map(prev.messages),
    partsByMessage: new Map(Array.from(prev.partsByMessage, ([k, v]) => [k, [...v]])),
    status: prev.status,
    questions: [...prev.questions],
  };
}

function upsertPart(parts: PartRecord[], part: PartRecord): PartRecord[] {
  const idx = parts.findIndex((p) => p.id === part.id);
  if (idx < 0) return [...parts, part];
  const next = [...parts];
  next[idx] = part;
  return next;
}

export function reducePartEvent(state: PartState, event: SseWireEvent): PartState {
  const { sessionID } = event;
  const prev = sessionState(state, sessionID);
  const next: SessionPartState = cloneSession(prev);

  switch (event.type) {
    case 'message.created':
      next.messages.set(event.info.id, event.info as unknown as MessageRecord);
      break;
    case 'message.updated': {
      const existing = next.messages.get(event.info.id);
      if (existing) next.messages.set(event.info.id, { ...existing, ...(event.info as object) } as MessageRecord);
      break;
    }
    case 'message.part.updated': {
      const part = event.part as unknown as PartRecord;
      const list = next.partsByMessage.get(event.messageID) ?? [];
      next.partsByMessage.set(event.messageID, upsertPart(list, part));
      break;
    }
    case 'message.part.delta': {
      const list = next.partsByMessage.get(event.messageID) ?? [];
      const part = list.find((p) => p.id === event.partID);
      if (part && typeof part.data === 'object' && part.data !== null) {
        const data = part.data as Record<string, unknown>;
        // 支持 text 与 reasoning 两个增量字段（design §5.1：message.part.delta 追加到 text/reasoning）
        if ((event.field === 'text' || event.field === 'reasoning') && typeof data[event.field] === 'string') {
          data[event.field] = (data[event.field] as string) + event.delta;
        }
        const idx = list.findIndex((p) => p.id === event.partID);
        next.partsByMessage.set(event.messageID, [...list.slice(0, idx), { ...part, data: { ...(data as object) } } as PartRecord, ...list.slice(idx + 1)]);
      }
      break;
    }
    case 'session.status': {
      const status = event.status as SessionPartState['status'];
      next.status = status;
      break;
    }
    case 'question.asked':
      next.questions = [...next.questions, { requestID: event.requestID, questions: event.questions, tool: event.tool }];
      break;
    case 'question.replied':
      next.questions = next.questions.filter((q) => q.requestID !== event.requestID);
      break;
  }

  return { ...state, [sessionID]: next };
}

export function hydratePartHistory(state: PartState, sessionID: string, payload: { messages: { message: MessageRecord; parts: PartRecord[] }[] }): PartState {
  const prev = sessionState(state, sessionID);
  const next: SessionPartState = cloneSession(prev);
  for (const entry of payload.messages) {
    next.messages.set(entry.message.id, entry.message);
    next.partsByMessage.set(entry.message.id, [...(entry.parts ?? [])].sort((a, b) => a.ordinal - b.ordinal));
  }
  return { ...state, [sessionID]: next };
}

export function selectSessionMessages(state: PartState, sessionID: string) {
  return sessionState(state, sessionID);
}

export function selectSessionStatus(state: PartState, sessionID: string) {
  return sessionState(state, sessionID).status;
}

export function selectSessionQuestions(state: PartState, sessionID: string) {
  return sessionState(state, sessionID).questions;
}
```
> 关键：不可变更新（每次返回新 Map/数组）；`message.part.delta` 只在目标 text part 存在且 `data.text` 是 string 时追加；`question.replied` 移除对应询问。不要在这里处理 React/Zustand——Task 3 接入 Zustand slice。

- [ ] **Step 4: 绿**

Run: `pnpm --dir frontend test -- PartStore`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/part-stream/
git commit -m "feat(frontend): add PartStore SSE reducer (session->messages->parts)"
```

---

### Task 3: Zustand partStreamSlice + usePartStream hook（SSE 订阅接线）

**Files:**
- Create: `frontend/src/app/stores/slices/partStreamSlice.ts`
- Modify: `frontend/src/app/stores/slicedStore.ts`（注册 slice）
- Modify: `frontend/src/app/stores/StoreState.ts`（类型合并）
- Create: `frontend/src/app/features/part-stream/usePartStream.ts`（hook：进会话拉历史 + 开 EventSource，卸载清理）
- Test: `frontend/src/app/features/part-stream/__tests__/usePartStream.test.ts`

**Interfaces:**
- Consumes: `PartStore`（`reducePartEvent`/`hydratePartHistory`/`selectSession*`）；`bridge.conversation.getSessionMessages`；`bridge.subscribe*`（Task 8 已实现：`subscribeModelStream` 等；但 PartStore 需要**原始 SSE 事件**——见下）；`DigitalLifeBridge`
- Produces: `partStreamSlice`（Zustand slice：`partBySession: PartState`、`partHydrate(sessionId, payload)`、`partApplyEvent(event)`、`partSelect(sessionId)`、`partSetStatus(sessionId, status)`）；`usePartStream(sessionId)` hook（返回 `{ messages, status, questions }`，内部管理历史加载 + 订阅生命周期）

> **关键设计决定（原始 SSE vs v1 映射）**：Task 8 的 `subscribeModelStream` 已把 `/event` 映射成 v1 模型事件（丢弃了 `message.created`/`question.*` 等）。PartStore 需要完整 SSE 事件。因此 S2 **新增**一个原始 SSE 订阅方法 `subscribeSessionPartEvents`（在 httpBridge 里基于现有 `event-source.ts` 封装，直接转发 `/event` 解析后的 `SessionPartEvent` wire 事件），PartStore reducer 消费它。这避免复制 Task 8 的映射逻辑，同时保留 Task 8 的 v1 路径（双端一致：桌面与浏览器都用同一个原始订阅）。

- [ ] **Step 1: 写失败测试（slice reducer + hook 生命周期）**

`frontend/src/app/features/part-stream/__tests__/usePartStream.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePartStream } from '../usePartStream';
import { partStreamReducer } from '../../../stores/slices/partStreamSlice';

describe('partStreamSlice', () => {
  it('reducer applies SSE events and hydration', () => {
    let s = partStreamReducer(undefined, { type: 'part/hydrate', sessionId: 's1', payload: { messages: [] } });
    s = partStreamReducer(s, { type: 'part/event', sessionId: 's1', event: { type: 'session.status', sessionID: 's1', status: 'busy' } });
    expect(s.partBySession.s1?.status).toBe('busy');
  });
});

describe('usePartStream', () => {
  it('hydrates history then subscribes, unsubscribes on unmount', async () => {
    const getSessionMessages = vi.fn().mockResolvedValue({ ok: true, data: { messages: [] } });
    const subscribe = vi.fn().mockReturnValue(() => {});
    const bridge = {
      conversation: { getSessionMessages },
      subscribeSessionPartEvents: subscribe,
    };
    vi.stubGlobal('window', { digitalLife: bridge } as unknown as Window & typeof globalThis);

    const { result, unmount } = renderHook(() => usePartStream('s1'));
    await waitFor(() => expect(getSessionMessages).toHaveBeenCalledWith('s1'));
    expect(subscribe).toHaveBeenCalled();
    const unsub = subscribe.mock.results[0].value;
    unmount();
    expect(unsub).toHaveBeenCalled();
  });
});
```
> `window.digitalLife` 是 bridge 挂载点（`main.tsx` 设置）。测试先验证 slice reducer，再验证 hook 生命周期（历史加载、订阅、卸载清理）。若 `renderHook` 需要 Provider，按现有 `useTCopy`/store 测试的 pattern 包一层。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend test -- usePartStream`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`partStreamSlice.ts`（Zustand slice 纯 reducer 风格，或按现有 slice 模式）:
```ts
import type { PartState, SseWireEvent } from '../../app/features/part-stream/partStoreTypes';
import { createInitialPartState, reducePartEvent, hydratePartHistory } from '../../app/features/part-stream/PartStore';
import type { SessionMessagesPayload } from '../../kernel/types-part';

export type PartStreamState = { partBySession: PartState };
export type PartStreamAction =
  | { type: 'part/hydrate'; sessionId: string; payload: SessionMessagesPayload }
  | { type: 'part/event'; sessionId: string; event: SseWireEvent };

export function partStreamReducer(state: PartStreamState | undefined, action: PartStreamAction): PartStreamState {
  const base = state ?? { partBySession: createInitialPartState() };
  switch (action.type) {
    case 'part/hydrate':
      return { partBySession: hydratePartHistory(base.partBySession, action.sessionId, action.payload) };
    case 'part/event':
      return { partBySession: reducePartEvent(base.partBySession, { ...action.event, sessionID: action.sessionId }) };
    default:
      return base;
  }
}
```
> 若现有 `slicedStore.ts` 用的是另一种 slice 约定（查看相邻 slice 如 `sessionSlice.ts`），按既有模式实现；`partStreamReducer` 的 action 形式可适配。核心是 `partBySession` 状态 + hydrate/event 两个 action。

`usePartStream.ts`（hook）:
```ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { selectSessionMessages } from './PartStore';
import type { SseWireEvent } from './partStoreTypes';

export function usePartStream(sessionId: string | undefined) {
  const partBySession = useAppStore((s) => s.partBySession);
  const partHydrate = useAppStore((s) => s.partHydrate);
  const partApplyEvent = useAppStore((s) => s.partApplyEvent);

  const bridge = (typeof window !== 'undefined' ? window.digitalLife : undefined);

  useEffect(() => {
    if (!sessionId || !bridge) return;
    let cancelled = false;
    void bridge.conversation.getSessionMessages(sessionId).then((res) => {
      if (!cancelled && res.ok && res.data) partHydrate(sessionId, res.data);
    });
    const unsubscribe = bridge.subscribeSessionPartEvents?.((event: SseWireEvent) => {
      if (event.sessionID === sessionId) partApplyEvent(sessionId, event);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [sessionId, bridge, partHydrate, partApplyEvent]);

  const view = useMemo(
    () => (sessionId ? selectSessionMessages(partBySession ?? {}, sessionId) : undefined),
    [partBySession, sessionId],
  );
  return view;
}
```
> 若 slice action 命名不同（如 `partHydrate`/`partApplyEvent` 是 store action），按实际 slice 导出调整。`useAppStore` 从 `slicedStore.ts` 导入（现有模式）。

httpBridge 增加原始 SSE 订阅（Task 8 的 `event-source.ts` 复用）：
```ts
// httpBridge.ts 内新增
subscribeSessionPartEvents: (listener: (event: SseWireEvent) => void) => {
  return subscribeSse({ baseUrl, path: '/event', onEvent: (rec) => {
    const evt = parseSessionPartEvent(rec.data);
    if (evt) listener(evt);
  } });
},
```
（`parseSessionPartEvent` 解析 `/event` 的 JSON data 为 `SseWireEvent`；三桥同步：tauri-bridge 委托 httpBridge，preview-bridge 委托 httpBridge，mock-bridge 提供演示事件。`SseWireEvent` import 自 partStoreTypes。）

- [ ] **Step 4: 绿**

Run: `pnpm --dir frontend test`、`pnpm --dir frontend run typecheck`、`pnpm --dir frontend run lint`
Expected: PASS / 0 errors。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/stores/slices/partStreamSlice.ts frontend/src/app/stores/slicedStore.ts frontend/src/app/stores/StoreState.ts frontend/src/app/features/part-stream/usePartStream.ts frontend/src/httpBridge.ts frontend/src/tauri-bridge/index.ts frontend/src/preview-bridge/index.ts frontend/src/mock-bridge.ts
git commit -m "feat(frontend): PartStore Zustand slice + usePartStream SSE hook"
```

---

### Task 4: PartRenderer 注册表（PART_MAPPING + registerPart + groupParts）

**Files:**
- Create: `frontend/src/app/features/part-stream/PartRenderer.tsx`（`PART_MAPPING` 注册表 + `registerPart` + `PartRenderer` 组件）
- Create: `frontend/src/app/features/part-stream/groupParts.ts`（`groupParts` + `PartGroup` + `PartRef` + `isContextGroupTool`）
- Create: `frontend/src/app/features/part-stream/__tests__/groupParts.test.ts`
- Create: `frontend/src/app/features/part-stream/__tests__/PartRenderer.test.tsx`

**Interfaces:**
- Consumes: `types-part.ts`（`PartRecord`/`PartData`）；Task 2 的 `PartStore` selectors（`SessionPartState`）
- Produces: `PartComponent = Component<PartRendererProps>`；`PART_MAPPING: Record<string, PartComponent | undefined>`；`registerPart(type, component)`；`PartRenderer({ session, message, part })`；`groupParts(parts: { messageID: string; part: PartRecord }[]): PartGroup[]`（`PartGroup = { key, type: 'part', ref } | { key, type: 'context', refs }`）

- [ ] **Step 1: 写失败测试（groupParts 分组）**

`frontend/src/app/features/part-stream/__tests__/groupParts.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { groupParts } from '../groupParts';

const mk = (id: string, tool?: string) => ({
  messageID: 'm1',
  part: {
    id,
    messageID: 'm1',
    sessionID: 's1',
    type: 'tool' as const,
    ordinal: 0,
    timeCreated: 0,
    data: tool ? { type: 'tool', tool, callID: id, state: { status: 'completed' as const, input: {}, output: '', time: { start: 0 } } } : { type: 'text', text: '' },
  },
});

describe('groupParts', () => {
  it('groups consecutive context tools (read/glob/grep/list) into one context group', () => {
    const groups = groupParts([mk('p1', 'read'), mk('p2', 'glob'), mk('p3', 'grep'), mk('p4', 'text')]);
    expect(groups[0].type).toBe('context');
    if (groups[0].type === 'context') {
      expect(groups[0].refs).toHaveLength(3);
    }
    expect(groups[1].type).toBe('part');
  });

  it('single text part is a part group', () => {
    const groups = groupParts([mk('p1', undefined)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('part');
  });
});
```
> 对标 OpenCode `message-part.tsx` groupParts（:663-705）。`CONTEXT_GROUP_TOOLS = { read, glob, grep, list }`。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend test -- groupParts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`groupParts.ts`（对标 OpenCode :607-705，适配 ADL PartRecord）:
```ts
import type { PartRecord } from '../../../kernel/types-part';

export const CONTEXT_GROUP_TOOLS = new Set(['read', 'glob', 'grep', 'list']);
export const HIDDEN_TOOLS = new Set(['todowrite']);

export type PartRef = { messageID: string; partID: string };
export type PartGroup =
  | { key: string; type: 'part'; ref: PartRef }
  | { key: string; type: 'context'; refs: PartRef[] };

export function isContextGroupTool(part: PartRecord): boolean {
  if (part.type !== 'tool') return false;
  const data = part.data as { tool?: string };
  return CONTEXT_GROUP_TOOLS.has(data.tool ?? '');
}

export function groupParts(parts: { messageID: string; part: PartRecord }[]): PartGroup[] {
  const result: PartGroup[] = [];
  let start = -1;
  const flush = (end: number) => {
    if (start < 0) return;
    const first = parts[start];
    if (!first) { start = -1; return; }
    result.push({
      key: `context:${first.part.id}`,
      type: 'context',
      refs: parts.slice(start, end + 1).map((item) => ({ messageID: item.messageID, partID: item.part.id })),
    });
    start = -1;
  };
  parts.forEach((item, index) => {
    if (isContextGroupTool(item.part)) {
      if (start < 0) start = index;
      return;
    }
    flush(index - 1);
    result.push({ key: `part:${item.messageID}:${item.part.id}`, type: 'part', ref: { messageID: item.messageID, partID: item.part.id } });
  });
  flush(parts.length - 1);
  return result;
}
```

`PartRenderer.tsx`（注册表 + 渲染器）:
```tsx
import type { Component, ReactNode } from 'react';
import type { MessageRecord, PartData, PartRecord } from '../../../kernel/types-part';

export interface PartRendererProps {
  message: MessageRecord;
  part: PartRecord;
  defaultOpen?: boolean;
}

export type PartComponent = Component<PartRendererProps>;

export const PART_MAPPING: Record<string, PartComponent | undefined> = {};

export function registerPart(type: string, component: PartComponent): void {
  PART_MAPPING[type] = component;
}

const DEFAULT_PART: PartComponent = () => null;

export function PartRenderer({ message, part, defaultOpen }: PartRendererProps) {
  const data = part.data as PartData;
  const Comp = PART_MAPPING[data.type] ?? DEFAULT_PART;
  return <Comp message={message} part={part} defaultOpen={defaultOpen} />;
}
```
> `PART_MAPPING` 按 `data.type`（text/reasoning/tool/file/step-start/step-finish/patch/snapshot）查找。后续 Task 5-8 的组件（StreamingMarkdown/BasicToolCard/ToolErrorCard/PartDiffPanel/ContextToolGroup/AskCard）通过 `registerPart` 注册。

- [ ] **Step 4: 绿**

Run: `pnpm --dir frontend test -- groupParts PartRenderer`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/part-stream/PartRenderer.tsx frontend/src/app/features/part-stream/groupParts.ts
git commit -m "feat(frontend): PartRenderer registry (PART_MAPPING + registerPart) and groupParts"
```

---

### Task 5: StreamingMarkdown（流式 Markdown + 代码高亮）

**Files:**
- Create: `frontend/src/app/features/part-stream/StreamingMarkdown.tsx`
- Create: `frontend/src/app/features/part-stream/markdown-utils.ts`（增量渲染纯函数：`splitMarkdownIncrements(prevText, newText)`）
- Create: `frontend/src/app/features/part-stream/__tests__/StreamingMarkdown.test.tsx`
- Create: `frontend/src/app/features/part-stream/__tests__/markdown-utils.test.ts`
- Register in `PartRenderer.tsx`（`registerPart('text', ...)`）

**Interfaces:**
- Consumes: `markdown-it` + `highlight.js`（已在 package.json）；`PartRendererProps`；`useTCopy`（i18n）
- Produces: `StreamingMarkdown({ text, isStreaming })`；`registerPart('text', StreamingMarkdownPart)`（PartRenderer 里 `PART_MAPPING['text']`）

- [ ] **Step 1: 写失败测试（增量纯函数 + 渲染）**

`frontend/src/app/features/part-stream/__tests__/markdown-utils.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { splitMarkdownIncrements } from '../markdown-utils';

describe('splitMarkdownIncrements', () => {
  it('returns full text when no prior', () => {
    expect(splitMarkdownIncrements('', 'hello')).toBe('hello');
  });
  it('returns only the delta when text grows', () => {
    expect(splitMarkdownIncrements('Hello', 'Hello world')).toBe(' world');
  });
});
```

`frontend/src/app/features/part-stream/__tests__/StreamingMarkdown.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { StreamingMarkdown } from '../StreamingMarkdown';

describe('StreamingMarkdown', () => {
  it('renders markdown text', () => {
    const { container } = render(<StreamingMarkdown text="**bold** and `code`" isStreaming={false} />);
    expect(container.querySelector('strong')).toBeTruthy();
    expect(container.querySelector('code')).toBeTruthy();
  });
  it('appends streaming text', () => {
    const { rerender, container } = render(<StreamingMarkdown text="Hello" isStreaming />);
    rerender(<StreamingMarkdown text="Hello world" isStreaming />);
    expect(container.textContent).toContain('Hello world');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend test -- StreamingMarkdown markdown-utils`
Expected: FAIL。

- [ ] **Step 3: 实现**

`markdown-utils.ts`:
```ts
export function splitMarkdownIncrements(prevText: string, nextText: string): string {
  if (nextText.startsWith(prevText)) return nextText.slice(prevText.length);
  return nextText;
}
```
> 简单增量：前缀匹配则返回增量，否则返回全文（重连/乱序兜底）。

`StreamingMarkdown.tsx`（markdown-it + highlight.js 渲染，增量文本在流式时追加到当前渲染文本）:
```tsx
import { useMemo } from 'react';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import { splitMarkdownIncrements } from './markdown-utils';

const md = new MarkdownIt({
  highlight: (code, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="adl-part-code"><code class="hljs language-${lang}">${hljs.highlight(code, { language: lang }).value}</code></pre>`;
      } catch { /* fallthrough */ }
    }
    return `<pre class="adl-part-code"><code>${md.utils.escapeHtml(code)}</code></pre>`;
  },
});

export function StreamingMarkdown({ text, isStreaming }: { text: string; isStreaming?: boolean }) {
  const html = useMemo(() => md.render(text), [text]);
  const dataStreaming = isStreaming ? 'true' : 'false';
  // 流式增量：文本已在父层累积，这里只需渲染最新全文；增量拆分用于性能（后续可做局部追加）
  return (
    <div className="adl-part-scope adl-part-markdown" data-streaming={dataStreaming} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

export function StreamingMarkdownPart(props: { message: unknown; part: { data: { text?: string } }; defaultOpen?: boolean }) {
  return <StreamingMarkdown text={props.part.data.text ?? ''} isStreaming />;
}
```
> 注意 XSS：`markdown-it` 默认不渲染原始 HTML（`html: false`），`highlight.js` 输出已转义。如未来需要 raw HTML，参考现有 `DOMPurify.sanitize` 用法。注册：`registerPart('text', StreamingMarkdownPart)`（在 PartRenderer.tsx 底部 import 并注册）。

- [ ] **Step 4: 绿**

Run: `pnpm --dir frontend test -- StreamingMarkdown markdown-utils`、`pnpm --dir frontend run lint`
Expected: PASS / 0 errors。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/part-stream/StreamingMarkdown.tsx frontend/src/app/features/part-stream/markdown-utils.ts frontend/src/app/features/part-stream/PartRenderer.tsx
git commit -m "feat(frontend): StreamingMarkdown part renderer (markdown-it + highlight.js)"
```

---

### Task 6: BasicToolCard + ToolErrorCard + ContextToolGroup（工具渲染）

**Files:**
- Create: `frontend/src/app/features/part-stream/BasicToolCard.tsx`
- Create: `frontend/src/app/features/part-stream/ToolErrorCard.tsx`
- Create: `frontend/src/app/features/part-stream/ContextToolGroup.tsx`
- Create: `frontend/src/app/features/part-stream/__tests__/BasicToolCard.test.tsx`
- Create: `frontend/src/app/features/part-stream/__tests__/ContextToolGroup.test.tsx`
- Register in `PartRenderer.tsx`（`registerPart('tool', ...)`）

**Interfaces:**
- Consumes: `types-part.ts`（`ToolPartData`/`ToolState`）；`PartRendererProps`；`useTCopy`（i18n）
- Produces: `BasicToolCard({ message, part, defaultOpen })`——工具状态机渲染（pending/running/completed/error），collapsible；`ToolErrorCard({ error })`；`ContextToolGroup({ parts, busy })`——read/glob/grep/list 聚合一行

- [ ] **Step 1: 写失败测试**

`frontend/src/app/features/part-stream/__tests__/BasicToolCard.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BasicToolCard } from '../BasicToolCard';

const mkPart = (state: { status: string; input?: unknown; output?: string; error?: string }) => ({
  id: 'p1', messageID: 'm1', sessionID: 's1', type: 'tool' as const, ordinal: 0, timeCreated: 0,
  data: { type: 'tool' as const, tool: 'read', callID: 'c1', state },
});

describe('BasicToolCard', () => {
  it('renders pending tool collapsed with title', () => {
    render(<BasicToolCard message={{ id: 'm1' } as never} part={mkPart({ status: 'pending', input: { path: 'a.txt' } }) as never} />);
    expect(screen.getByText(/read/i)).toBeTruthy();
  });
  it('renders error state with ToolErrorCard', () => {
    render(<BasicToolCard message={{ id: 'm1' } as never} part={mkPart({ status: 'error', input: {}, error: 'boom' }) as never} />);
    expect(screen.getByText(/boom/i)).toBeTruthy();
  });
});
```

`frontend/src/app/features/part-stream/__tests__/ContextToolGroup.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ContextToolGroup } from '../ContextToolGroup';

const mk = (tool: string) => ({
  id: tool, messageID: 'm1', sessionID: 's1', type: 'tool' as const, ordinal: 0, timeCreated: 0,
  data: { type: 'tool' as const, tool, callID: tool, state: { status: 'completed' as const, input: {}, output: '', time: { start: 0 } } },
});

describe('ContextToolGroup', () => {
  it('aggregates read/glob/grep/list into one row', () => {
    const { container } = render(<ContextToolGroup parts={[mk('read'), mk('glob')] as never} busy={false} />);
    expect(container.textContent).toContain('read');
    expect(container.textContent).toContain('glob');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend test -- BasicToolCard ContextToolGroup`
Expected: FAIL。

- [ ] **Step 3: 实现**

`BasicToolCard.tsx`（对标 OpenCode basic-tool.tsx，状态机 + collapsible + i18n）:
```tsx
import { useMemo, useState } from 'react';
import type { PartRecord } from '../../../kernel/types-part';
import { useTCopy } from '../../i18n/useTCopy';
import { ToolErrorCard } from './ToolErrorCard';

export function BasicToolCard({ message: _message, part, defaultOpen = false }: {
  message: unknown; part: PartRecord; defaultOpen?: boolean;
}) {
  const { t } = useTCopy();
  const [open, setOpen] = useState(defaultOpen);
  const data = part.data as { tool?: string; state?: { status?: string; error?: string; title?: string; output?: string; input?: unknown } };
  const status = data.state?.status ?? 'pending';
  const title = data.state?.title ?? data.tool ?? '';
  const input = data.state?.input;

  const label = useMemo(() => {
    if (status === 'running') return t.partToolRunning;      // i18n key
    if (status === 'completed') return t.partToolCompleted;  // i18n key
    if (status === 'error') return t.partToolError;          // i18n key
    return t.partToolPending;                                // i18n key
  }, [status, t]);

  return (
    <details className={`adl-part-tool adl-part-tool--${status}`} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="adl-part-tool__summary">
        <span className="adl-part-tool__title">{title || label}</span>
        <span className="adl-part-tool__status">{label}</span>
      </summary>
      <div className="adl-part-tool__body">
        {status === 'error' ? <ToolErrorCard error={data.state?.error ?? ''} /> : null}
        {input !== undefined && status !== 'completed' ? (
          <pre className="adl-part-tool__input">{typeof input === 'string' ? input : JSON.stringify(input, null, 2)}</pre>
        ) : null}
        {status === 'completed' && data.state?.output ? (
          <pre className="adl-part-tool__output">{data.state.output}</pre>
        ) : null}
      </div>
    </details>
  );
}
```
> 所有展示文本用 i18n key（`t.partToolRunning` 等需在 en-US/zh-CN 字典添加，见 Task 9 i18n）。`<details>/<summary>` 实现 collapsible（无额外依赖）。

`ToolErrorCard.tsx`:
```tsx
export function ToolErrorCard({ error }: { error: string }) {
  return (
    <div className="adl-part-tool-error" role="alert">
      <pre className="adl-part-tool-error__text">{error}</pre>
    </div>
  );
}
```

`ContextToolGroup.tsx`（对标 OpenCode context 组件，聚合一行）:
```tsx
import type { PartRecord } from '../../../kernel/types-part';
import { useTCopy } from '../../i18n/useTCopy';

export function ContextToolGroup({ parts, busy }: { parts: PartRecord[]; busy?: boolean }) {
  const { t } = useTCopy();
  const tools = parts
    .map((p) => (p.data as { tool?: string }).tool)
    .filter((x): x is string => !!x);
  return (
    <div className={`adl-part-context${busy ? ' adl-part-context--busy' : ''}`} aria-label={t.partContextGroup}>
      <span className="adl-part-context__label">{t.partContextGroup}</span>
      <span className="adl-part-context__tools">{tools.join(', ')}</span>
    </div>
  );
}
```

注册（PartRenderer.tsx 底部）：
```ts
import { BasicToolCard } from './BasicToolCard';
registerPart('tool', BasicToolCard);
```

- [ ] **Step 4: 绿**

Run: `pnpm --dir frontend test -- BasicToolCard ContextToolGroup`、`pnpm --dir frontend run lint`
Expected: PASS / 0 errors。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/part-stream/BasicToolCard.tsx frontend/src/app/features/part-stream/ToolErrorCard.tsx frontend/src/app/features/part-stream/ContextToolGroup.tsx frontend/src/app/features/part-stream/PartRenderer.tsx
git commit -m "feat(frontend): BasicToolCard/ToolErrorCard/ContextToolGroup tool renderers"
```

---

### Task 7: PartDiffPanel（diff 渲染）

**Files:**
- Create: `frontend/src/app/features/part-stream/PartDiffPanel.tsx`
- Create: `frontend/src/app/features/part-stream/__tests__/PartDiffPanel.test.tsx`
- Register in `PartRenderer.tsx`（`registerPart('patch', ...)`）

**Interfaces:**
- Consumes: 现有 `diff-viewer`（`InlineDiffViewer`/`SideBySideDiffViewer`，CodeMirror 基础）；`PatchPartData`（`{ hash, files }`）；`useTCopy`
- Produces: `PartDiffPanel({ part })`——patch part 展开渲染 diff

- [ ] **Step 1: 写失败测试**

`frontend/src/app/features/part-stream/__tests__/PartDiffPanel.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PartDiffPanel } from '../PartDiffPanel';

describe('PartDiffPanel', () => {
  it('renders patch file list', () => {
    const { container } = render(<PartDiffPanel part={{ id: 'p1', messageID: 'm1', sessionID: 's1', type: 'patch', ordinal: 0, timeCreated: 0, data: { type: 'patch', hash: 'abc', files: ['a.txt', 'b.ts'] } } as never} />);
    expect(container.textContent).toContain('a.txt');
    expect(container.textContent).toContain('b.ts');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend test -- PartDiffPanel`
Expected: FAIL。

- [ ] **Step 3: 实现**

`PartDiffPanel.tsx`:
```tsx
import type { PartRecord } from '../../../kernel/types-part';
import { useTCopy } from '../../i18n/useTCopy';

export function PartDiffPanel({ part }: { part: PartRecord }) {
  const { t } = useTCopy();
  const data = part.data as { files?: string[]; hash?: string };
  const files = data.files ?? [];
  return (
    <div className="adl-part-diff" aria-label={t.partDiffPanel}>
      <div className="adl-part-diff__files">
        {files.map((file) => (
          <span key={file} className="adl-part-diff__file">{file}</span>
        ))}
      </div>
    </div>
  );
}
```
> 真实 diff 内容来自 patch hash 的加载（S2 范围：展示文件列表 + 占位；如需按 hash 拉 diff 内容，接入现有 patch preview 端点，在报告中注明范围）。渲染层复用现有 diff-viewer 组件的模式（若需要内联 diff 视图，接入 `InlineDiffViewer`——但 patch 内容加载是跨域任务，先展示文件列表）。

注册（PartRenderer.tsx 底部）：`registerPart('patch', PartDiffPanel)`。

- [ ] **Step 4: 绿**

Run: `pnpm --dir frontend test -- PartDiffPanel`、`pnpm --dir frontend run lint`
Expected: PASS / 0 errors。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/part-stream/PartDiffPanel.tsx frontend/src/app/features/part-stream/PartRenderer.tsx
git commit -m "feat(frontend): PartDiffPanel patch renderer"
```

---

### Task 8: AskCard + TurnSummary（问询卡 + 回合摘要）

**Files:**
- Create: `frontend/src/app/features/part-stream/AskCard.tsx`
- Create: `frontend/src/app/features/part-stream/TurnSummary.tsx`
- Create: `frontend/src/app/features/part-stream/__tests__/AskCard.test.tsx`
- Create: `frontend/src/app/features/part-stream/__tests__/TurnSummary.test.tsx`

**Interfaces:**
- Consumes: `bridge.conversation` 的 question reply 端点（`POST /question/{request_id}/reply`，S1 已实现）；`usePartStream` 的 `questions`（QuestionEntry）；`useTCopy`；`selectSessionStatus`
- Produces: `AskCard({ question, onReply })`——`question.asked` → 选项，选择后 POST reply；`TurnSummary({ status, usage })`——完成/错误摘要

- [ ] **Step 1: 写失败测试**

`frontend/src/app/features/part-stream/__tests__/AskCard.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AskCard } from '../AskCard';

describe('AskCard', () => {
  it('renders question options and replies on select', () => {
    const onReply = vi.fn();
    render(<AskCard requestID="r1" questions={[{ text: 'Option A' }, { text: 'Option B' }]} onReply={onReply} />);
    expect(screen.getByText(/Option A/i)).toBeTruthy();
    fireEvent.click(screen.getByText(/Option A/i));
    expect(onReply).toHaveBeenCalledWith('r1', ['Option A']);
  });
});
```

`frontend/src/app/features/part-stream/__tests__/TurnSummary.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { TurnSummary } from '../TurnSummary';

describe('TurnSummary', () => {
  it('renders error status', () => {
    const { container } = render(<TurnSummary status="error" />);
    expect(container.textContent).not.toBe('');
  });
  it('renders completed status', () => {
    const { container } = render(<TurnSummary status="completed" />);
    expect(container.textContent).not.toBe('');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend test -- AskCard TurnSummary`
Expected: FAIL。

- [ ] **Step 3: 实现**

`AskCard.tsx`:
```tsx
import { useTCopy } from '../../i18n/useTCopy';

export function AskCard({ requestID, questions, onReply }: {
  requestID: string;
  questions: { text?: string; [key: string]: unknown }[];
  onReply: (requestID: string, answers: string[]) => void;
}) {
  const { t } = useTCopy();
  return (
    <div className="adl-part-ask" role="group" aria-label={t.partAskCard}>
      <p className="adl-part-ask__prompt">{t.partAskPrompt}</p>
      <div className="adl-part-ask__options">
        {questions.map((q, i) => {
          const text = typeof q?.text === 'string' ? q.text : JSON.stringify(q);
          return (
            <button key={i} type="button" className="adl-part-ask__option" onClick={() => onReply(requestID, [text])}>
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```
> `onReply` 由上层（usePartStream 接入处）调用 bridge 的 `POST /question/{id}/reply`；AskCard 本身不直接依赖 bridge（可测性）。若 ADL 的 question wire 是数组内嵌对象，按实际结构取 `text`。

`TurnSummary.tsx`:
```tsx
import { useTCopy } from '../../i18n/useTCopy';

export function TurnSummary({ status }: { status: 'idle' | 'busy' | 'error' | 'cancelled' | 'completed' }) {
  const { t } = useTCopy();
  const label =
    status === 'completed' ? t.partTurnCompleted :
    status === 'error' ? t.partTurnError :
    status === 'cancelled' ? t.partTurnCancelled :
    t.partTurnRunning;
  return (
    <div className={`adl-part-turn-summary adl-part-turn-summary--${status}`} role="status">
      <span>{label}</span>
    </div>
  );
}
```
> 所有文本 i18n key。

- [ ] **Step 4: 绿**

Run: `pnpm --dir frontend test -- AskCard TurnSummary`、`pnpm --dir frontend run lint`
Expected: PASS / 0 errors。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/part-stream/AskCard.tsx frontend/src/app/features/part-stream/TurnSummary.tsx
git commit -m "feat(frontend): AskCard question card and TurnSummary"
```

---

### Task 9: i18n keys + 局部视觉作用域（.adl-part-scope）

**Files:**
- Modify: `frontend/src/app/i18n/en-US/*` + `frontend/src/app/i18n/zh-CN/*`（新增 part-stream 领域 keys）
- Modify: `frontend/src/app/i18n/types.ts`（CopyDict 类型扩展，`satisfies` 校验）
- Create: `frontend/src/styles/part-stream.css`（`.adl-part-scope` 作用域变量 + 组件样式）
- Modify: `frontend/src/styles/index.css` 或 `main.tsx`（import part-stream.css）

**Interfaces:**
- Consumes: 现有 i18n dict 结构（`frontend/src/app/i18n/en-US/`、`zh-CN/`、`types.ts`、`useTCopy`）
- Produces: 本计划 Task 5-8 组件用到的全部 i18n keys；`.adl-part-scope` 作用域样式

- [ ] **Step 1: 写失败测试（i18n key 存在性 + 双语言一致）**

按现有 i18n 测试约定（检查 `check:i18n` 脚本或现有 `__tests__`）：
```
pnpm --dir frontend run check:i18n   # 若存在该脚本
```
或在 `frontend/src/app/i18n/__tests__/` 加测试断言 en-US 与 zh-CN 的 part-stream keys 一一对应。
Expected: FAIL（keys 不存在）。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend run check:i18n`（或对应测试）
Expected: FAIL。

- [ ] **Step 3: 实现**

新增 keys（en-US 与 zh-CN 同步，`CopyDict` 类型用 `satisfies` 校验——参考现有 dict 文件结构）：
- `partToolPending` / `partToolRunning` / `partToolCompleted` / `partToolError`（工具状态标签）
- `partContextGroup`（上下文工具组 label）
- `partDiffPanel`（diff 面板 aria-label）
- `partAskCard` / `partAskPrompt`（问询卡 label/提示）
- `partTurnCompleted` / `partTurnError` / `partTurnCancelled` / `partTurnRunning`（回合摘要）
- （如有）`partStreamEmptyState` 等

`part-stream.css`（局部作用域，不波及全局 UI）:
```css
.adl-part-scope {
  /* 会话区局部变量映射（近似 OpenCode 风格，但不改全局 tokens） */
  --adl-part-text: var(--text-primary);
  --adl-part-muted: var(--text-secondary);
  --adl-part-border: var(--border-default);
  --adl-part-radius: 8px;
  --adl-part-tool-bg: var(--bg-card);
  --adl-part-error: var(--danger);
  --adl-part-success: var(--success);
  /* 组件样式：工具卡、上下文组、diff、问询卡、回合摘要 */
}
.adl-part-tool { border: 1px solid var(--adl-part-border); border-radius: var(--adl-part-radius); background: var(--adl-part-tool-bg); }
.adl-part-tool--error { border-color: var(--adl-part-error); }
.adl-part-context { display: inline-flex; gap: 8px; color: var(--adl-part-muted); }
.adl-part-diff__files { display: flex; flex-wrap: wrap; gap: 6px; }
.adl-part-ask__options { display: flex; flex-direction: column; gap: 6px; }
.adl-part-turn-summary--error { color: var(--adl-part-error); }
```
> 必须使用 CSS 自定义属性 `var(--…)`（设计系统约束），颜色取现有 tokens。

- [ ] **Step 4: 绿**

Run: i18n 检查 + `pnpm --dir frontend run lint`
Expected: PASS / 0 errors。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/i18n/ frontend/src/styles/part-stream.css frontend/src/styles/index.css
git commit -m "feat(frontend): part-stream i18n keys and .adl-part-scope styling"
```

---

### Task 10: 会话页集成 + 旧路径逐步停用 + 全量验收

**Files:**
- Modify: `frontend/src/app/regions/CenterPane.tsx`（接入 `usePartStream`，Part 渲染替代/并存旧 `MessageStream`）
- Modify: `frontend/src/app/components/MessageStream.tsx`（或新增 `PartMessageStream`，见下）
- Test: `frontend/src/app/regions/__tests__/CenterPane.part.test.tsx`
- 全量验收命令

**Interfaces:**
- Consumes: `usePartStream(sessionId)`（Task 3）、`PartRenderer`（Task 4）、各组件（Task 5-8）；`sessionDetails`/`activeSessionId`（现有 store）
- Produces: 会话页在浏览器/桌面双端用 Part 渲染；旧 `ConversationBlock` 路径逐步停用（不新增兼容层）

- [ ] **Step 1: 写失败测试（集成：Part 渲染出现在会话页）**

`frontend/src/app/regions/__tests__/CenterPane.part.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { CenterPane } from '../CenterPane';

describe('CenterPane part-stream integration', () => {
  it('renders part-stream messages when part store populated', () => {
    // 用现有 store 测试基建预填 partBySession，渲染 CenterPane，断言 PartRenderer 出现
  });
});
```
> 按现有 CenterPane/MessageStream 测试的 store 注入方式写。若旧 MessageStream 与 Part 渲染并存过渡，测试断言 Part 渲染的内容出现。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend test -- CenterPane.part`
Expected: FAIL。

- [ ] **Step 3: 实现（会话页接入）**

`CenterPane.tsx` 在渲染会话消息处接入 `usePartStream(activeSessionId)`：
- 有 `activeSessionId` 时：`const { messages, partsByMessage, status, questions } = usePartStream(activeSessionId)`。
- 渲染：消息按 role 分组，assistant 消息渲染其 parts（`groupParts` → `PartRenderer`/`ContextToolGroup`），user 消息渲染文本；`questions` 渲染 `AskCard`（onReply → `bridge.conversation` reply 端点）；`status` 驱动 `TurnSummary`。
- 旧 `MessageStream`（`ConversationMessageRecord` 渲染）逐步停用：在 S2 内可保留（双渲染并存）或切换到 Part 渲染为主。**决策**：S2 以 Part 渲染为主路径，旧路径保留但标记 deprecated（不删——删除是后续清理任务；本阶段不新增兼容层）。若两个渲染同时存在会导致双份消息，则选 Part 渲染为主、旧路径仅在不含 part 数据时兜底。
- 双端一致：浏览器与桌面都用同一 `usePartStream`（bridge 相同）。

- [ ] **Step 4: 全量验收**

```bash
cargo test --workspace -- --skip google
cargo clippy --workspace --all-targets -- -D warnings   # 0
pnpm --dir frontend test
pnpm --dir frontend run lint                            # 0 errors
pnpm --dir frontend run typecheck                       # 0 errors
```
（Rust 侧无需改动但必须保持绿；浏览器自动化 E2E 不在本计划范围——用户手工验证。）

- [ ] **Step 5: 文档 + 提交**

更新 `docs/superpowers/specs/2026-08-09-agent-operation-frontend-opencode-alignment-design.md` §5 验收 → 标「完成」；`git commit -m "feat(frontend): session page part-stream rendering (OpenCode-aligned)"`

---

## Execution Handoff（由父 agent 选择）

- **Subagent-Driven（推荐）**：每次 dispatch 一个 subagent（Task 1→n），`Task 完成即 review`——见 superpowers:subagent-driven-development。
- **Inline**：executing-plans 逐 Task 检查点。

> 每 Task 一次 `git status` 确认 scope 干净；每次 commit 独立、conventional（feat/fix）。
