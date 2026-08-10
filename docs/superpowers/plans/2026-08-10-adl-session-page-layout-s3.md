# S3 · 桌面布局（OpenCode 对齐会话页布局）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对标 OpenCode `packages/app/src/pages/session/` 的会话页布局（虚拟化 timeline、会话文件 tab、Composer dock、面板约束、侧面板会话上下文），在 ADL 现有 `regions/` 布局内对齐会话页内部。

**Architecture:** 在 ADL 既有 `left-sidebar / center / right-panel` 三区布局内，仅对齐会话页内部。核心：把 S2 的 `PartConversation`（当前非虚拟化 `.map` 渲染）升级为基于 `react-window` 的虚拟化 timeline（对标 OpenCode `message-timeline.tsx`）；Composer 区补齐问询/待办/权限 dock；会话文件 tab 复用现有编辑器 tabs 体系并与会话绑定；面板宽度约束对齐 OpenCode `session-panel-layout` 语义；右侧面板按会话上下文呈现（文件树/变更/审核）。

**Tech Stack:** React 19 + TS、Zustand、react-window（已存在依赖，`MessageStream` 已用）、CodeMirror（编辑器 tabs）、vitest、CSS 变量（设计 token）。

## Global Constraints

- 双端一致（AGENTS.md 硬性）：Tauri 桌面与浏览器共用同一布局组件、同一数据源；布局无表面分支
- 与现有 ADL 侧边栏/面板区域映射，**不改动全局布局**；仅会话页内部对齐（设计 §6）
- 数据模型：Part/Message（S2 `types-part.ts` + `PartStore`）；`SessionPartState`（`usePartStream` 返回）；会话文件来自现有编辑器 tabs 体系（`right-panel` / `editor`）
- i18n 硬性（AGENTS.md）：所有 UI 展示文本（按钮/Tooltip/aria-label/占位符/相对时间/日期格式）必须使用 i18n key，禁止硬编码
- 红绿测试先行（mandatory-testing）：`pnpm --dir frontend run test`、`pnpm --dir frontend run lint` 0 errors、`pnpm --dir frontend run typecheck` 0 errors、`cargo test --workspace -- --skip google` 绿
- 视觉 Token：保留现有 `tokens.css`；会话区用 `.adl-part-scope`（S2 已建）局部作用域；颜色只用 `var(--…)`
- 禁止向后兼容 shim：旧 `MessageStream` 路径（ConversationMessageRecord）保持兜底但**不新增**兼容层；不新增旧字段保留
- 未发布阶段禁止数据格式兼容/迁移代码
- 无浏览器自动化（用户指令）：不提交 Playwright spec；用调试日志埋点 + 手动验证

---

### Task 1: 虚拟化 Part timeline（`PartTimeline`）

**Files:**
- Create: `frontend/src/app/features/part-stream/PartTimeline.tsx`（react-window 虚拟化，渲染视口内消息行 + 占位）
- Create: `frontend/src/app/features/part-stream/partTimelineUtils.ts`（`normalizeQuestions` 共享纯函数）
- Modify: `frontend/src/app/features/part-stream/PartConversation.tsx`（内部行渲染抽到 `PartTimeline`；或 PartConversation 改为薄壳，行渲染由 PartTimeline 负责）
- Test: `frontend/src/app/features/part-stream/__tests__/PartTimeline.test.tsx`

**Interfaces:**
- Consumes: `PartConversationProps`（`state: SessionPartState`、`userTextByMessageId`、`onReply`）；`SessionPartState`（`messages: Map<string, MessageRecord>`、`partsByMessage`、`status`、`questions`）；`groupParts`/`PartRenderer`/`ContextToolGroup` 现有渲染（S2）
- Produces: `PartTimeline({ state, userTextByMessageId, onReply })` —— react-window `List`，行组件渲染：user 消息（文本）/ assistant 消息（parts 经 groupParts→PartRenderer/ContextToolGroup）；`rowCount = messages.size`，动态行高（`useDynamicRowHeight`，S2 `MessageStream` 已用）；`normalizeQuestions(questions: unknown[]): { text?: string }[]`（共享纯函数，Task 3 复用）

- [ ] **Step 1: 写失败测试（虚拟化只渲染视口行）**

`frontend/src/app/features/part-stream/__tests__/PartTimeline.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PartTimeline } from '../PartTimeline';
import type { SessionPartState } from '../partStoreTypes';

function makeState(messages: { id: string; role: string; text?: string }[]): SessionPartState {
  const msgMap = new Map(messages.map((m) => [m.id, { id: m.id, sessionID: 's1', role: m.role, timeCreated: 0 } as never]));
  const parts = new Map<string, never[]>();
  for (const m of messages) {
    if (m.text) {
      parts.set(m.id, [{ id: `${m.id}-p1`, messageID: m.id, sessionID: 's1', type: 'text', ordinal: 0, timeCreated: 0, data: { type: 'text', text: m.text } } as never]);
    }
  }
  return { messages: msgMap, partsByMessage: parts, status: 'idle', questions: [] };
}

describe('PartTimeline', () => {
  it('renders messages with parts', () => {
    const state = makeState([
      { id: 'u1', role: 'user', text: 'hello' },
      { id: 'a1', role: 'assistant', text: 'world' },
    ]);
    const { container } = render(<PartTimeline state={state} userTextByMessageId={{ u1: 'hello' }} onReply={() => {}} />);
    expect(container.textContent).toContain('hello');
    expect(container.textContent).toContain('world');
  });
});
```
> 虚拟化测试难点：react-window 只渲染视口内行。为可测，容器设固定高度（如 400px），消息行数较少时全部渲染；测试断言行内容出现。若 `List` 在 jsdom 下需要 mock ResizeObserver（现有 `MessageStream.test.tsx` 的处理方式——查它怎么处理，沿用）。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend test -- PartTimeline`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `partTimelineUtils.ts` + `PartTimeline.tsx`**

`partTimelineUtils.ts`（共享纯函数）:
```ts
export function normalizeQuestions(questions: unknown[]): { text?: string }[] {
  return questions.map((q) => {
    if (q && typeof q === 'object' && 'text' in q) return { text: String((q as { text: unknown }).text ?? '') };
    if (typeof q === 'string') return { text: q };
    return { text: JSON.stringify(q) };
  });
}
```

对标 `MessageStream.tsx` 的 react-window 用法（`List` + `useDynamicRowHeight` + `ListProps`）与 OpenCode `message-timeline.tsx` 的"仅渲染视口行"语义：
```tsx
// frontend/src/app/features/part-stream/PartTimeline.tsx
import { List, useListRef, useDynamicRowHeight } from 'react-window';
import type { ListProps } from 'react-window';
import { useMemo } from 'react';
import type { SessionPartState } from './partStoreTypes';
import type { MessageRecord } from '../../../kernel/types-part';
import { groupParts } from './groupParts';
import { PartRenderer } from './PartRenderer';
import { ContextToolGroup } from './ContextToolGroup';

interface PartTimelineProps {
  state: SessionPartState;
  userTextByMessageId: Record<string, string>;
  onReply: (requestID: string, answers: string[]) => void;
}

interface RowProps {
  rows: { message: MessageRecord; role: string; text: string }[];
  partsByMessage: SessionPartState['partsByMessage'];
  userTextByMessageId: Record<string, string>;
}

const TimelineRow = ({ index, style, rows, partsByMessage, userTextByMessageId }: {
  index: number; style: React.CSSProperties;
  rows: RowProps['rows']; partsByMessage: RowProps['partsByMessage']; userTextByMessageId: RowProps['userTextByMessageId'];
}) => {
  const row = rows[index];
  if (!row) return null;
  const parts = partsByMessage.get(row.message.id) ?? [];
  const groups = groupParts(parts.map((part) => ({ messageID: row.message.id, part })));
  return (
    <div style={{ ...style, padding: 'var(--space-3) 0' }} className="adl-part-scope">
      {row.role === 'user' ? (
        <div className="adl-part-user-msg">{row.text}</div>
      ) : (
        groups.map((group) =>
          group.type === 'context' ? (
            <ContextToolGroup
              key={group.key}
              parts={group.refs
                .map((ref) => partsByMessage.get(ref.messageID)?.find((p) => p.id === ref.partID))
                .filter((p): p is NonNullable<typeof p> => !!p)}
              busy={false}
            />
          ) : (
            <PartRenderer
              key={group.key}
              message={row.message}
              part={partsByMessage.get(group.ref.messageID)?.find((p) => p.id === group.ref.partID)!}
              defaultOpen={false}
            />
          ),
        )
      )}
    </div>
  );
};

export function PartTimeline({ state, userTextByMessageId, onReply }: PartTimelineProps) {
  const rows = useMemo(
    () => Array.from(state.messages.entries()).map(([id, message]) => ({
      message,
      role: message.role ?? (state.partsByMessage.get(id)?.length ? 'assistant' : 'user'),
      text: userTextByMessageId[id] ?? '',
    })),
    [state.messages, state.partsByMessage, userTextByMessageId],
  );
  const listRef = useListRef(null);
  const dynamicRowHeight = useDynamicRowHeight({ defaultRowHeight: 120 });
  // onReply 传递给需要它的部分（AskCard 在 state.questions 渲染中，见下）

  return (
    <div className="adl-part-timeline" role="log" aria-live="polite">
      <List
        listRef={listRef}
        style={{ height: '100%', width: '100%' }}
        rowComponent={TimelineRow as unknown as ListProps<RowProps>['rowComponent']}
        rowCount={rows.length}
        rowHeight={dynamicRowHeight}
        overscanCount={5}
        rowProps={{ rows, partsByMessage: state.partsByMessage, userTextByMessageId }}
      />
      {state.questions.length > 0 ? (
        <div className="adl-part-question-list">
          {state.questions.map((q) => (
            <AskCard
              key={q.requestID}
              requestID={q.requestID}
              questions={normalizeQuestions(q.questions)}
              onReply={onReply}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
```
> 说明：`TimelineRow` 通过共享的 `rowProps`（`partsByMessage`）解析每个消息的 parts（对标 OpenCode `message-timeline.tsx` 只渲染视口内行的语义）。react-window 的 `rowProps` 对象会传给每个 row 组件——若你的 react-window 版本签名不同，按实际 API 调整 `rowProps` 形状。本任务把消息行虚拟化；`state.questions`（AskCard）/ `TurnSummary` 留在 timeline 尾部非虚拟化（数量少）。Task 3 会把 questions/status 移到 Composer dock 并去重。`normalizeQuestions` 从 `./partTimelineUtils` 导入（本任务创建）；`AskCard`/`TurnSummary`/`mapPartTurnStatus` 从 `PartConversation` 导出复用。

- [ ] **Step 4: 让 PartConversation 使用 PartTimeline**

修改 `PartConversation.tsx`：把现有的 `.map` 行渲染替换为 `<PartTimeline state={state} userTextByMessageId={userTextByMessageId} onReply={onReply} />`（PartConversation 变为薄壳）。保留 `mapPartTurnStatus`/`resolvePartMessageRole`/`normalizeQuestions` 导出（Task 10 用）。确保现有 `CenterPane.part.test.tsx` 仍绿。

- [ ] **Step 5: 绿 + 全量**

Run: `pnpm --dir frontend test`、`pnpm --dir frontend run lint`、`pnpm --dir frontend run typecheck`
Expected: PASS / 0 errors。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/app/features/part-stream/
git commit -m "feat(frontend): virtualized PartTimeline (react-window, OpenCode timeline-aligned)"
```

---

### Task 2: 会话文件 tab（复用编辑器 tabs，与会话绑定）

**Files:**
- Create: `frontend/src/app/features/part-stream/SessionFileTabs.tsx`（会话文件 tab 条：显示当前会话关联的文件）
- Modify: `frontend/src/app/regions/CenterPane.tsx`（在 PartConversation 上方渲染 `SessionFileTabs`）
- Test: `frontend/src/app/features/part-stream/__tests__/SessionFileTabs.test.tsx`

**Interfaces:**
- Consumes: 现有编辑器 tabs 体系（`right-panel` 的 `FileNavigatorShell` / `useEditorStateCache` / `FilesPanel` —— 查 ADL 编辑器 tabs 如何存当前打开文件，复用其 state）；`usePartStream` 的 `state`（assistant 消息的 `file` parts —— `PartData.type === 'file'` 携带 `url`/`filename`）
- Produces: `SessionFileTabs({ files: { url: string; filename?: string }[] })` —— 渲染会话关联文件 tab；点击切换右侧面板到该文件（若有）

- [ ] **Step 1: 写失败测试**

`frontend/src/app/features/part-stream/__tests__/SessionFileTabs.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionFileTabs } from '../SessionFileTabs';

describe('SessionFileTabs', () => {
  it('renders session file tabs', () => {
    render(<SessionFileTabs files={[{ url: 'file:///a.txt', filename: 'a.txt' }, { url: 'file:///b.ts', filename: 'b.ts' }]} />);
    expect(screen.getByText('a.txt')).toBeTruthy();
    expect(screen.getByText('b.ts')).toBeTruthy();
  });
});
```
> i18n：tab 文件名是内容（非 UI 文案），可硬编码显示文件名；但容器 aria-label/tooltip 用 i18n key。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend test -- SessionFileTabs`
Expected: FAIL。

- [ ] **Step 3: 实现 `SessionFileTabs.tsx` + CenterPane 集成**

`SessionFileTabs.tsx`:
```tsx
import { useTCopy } from '../../i18n/useTCopy';

export interface SessionFileTabItem { url: string; filename?: string }

export function SessionFileTabs({ files, onSelect }: {
  files: SessionFileTabItem[];
  onSelect?: (url: string) => void;
}) {
  const { t } = useTCopy();
  if (files.length === 0) return null;
  return (
    <div className="adl-part-file-tabs" role="tablist" aria-label={t.partSessionFileTabs}>
      {files.map((file) => (
        <button key={file.url} type="button" role="tab" className="adl-part-file-tab" onClick={() => onSelect?.(file.url)}>
          <span className="adl-part-file-tab__name">{file.filename ?? file.url}</span>
        </button>
      ))}
    </div>
  );
}
```
CenterPane 集成：在 `<PartConversation/>` 上方渲染 `<SessionFileTabs files={sessionFileParts} onSelect={handleOpenFile} />`。`sessionFileParts` 从 `state.partsByMessage` 收集 `data.type === 'file'` 的 parts（去重 url）。`handleOpenFile` 调用现有编辑器打开文件 action（查 `actions` 是否有 openFile；若无则本任务仅渲染，onSelect 留空并注明）。i18n 加 `partSessionFileTabs`（"会话文件"/"Session files"）。

- [ ] **Step 4: 绿**

Run: `pnpm --dir frontend test`、lint、typecheck。
Expected: PASS / 0 errors。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/part-stream/SessionFileTabs.tsx frontend/src/app/regions/CenterPane.tsx
git commit -m "feat(frontend): session file tabs bound to part-stream file parts"
```

---

### Task 3: Composer dock（问询/待办 dock 接入）

**Files:**
- Create: `frontend/src/app/features/part-stream/SessionDocks.tsx`（Composer 上方 dock 区：`AskCard` dock + `TurnSummary` dock）
- Modify: `frontend/src/app/regions/CenterPane.tsx`（在 ComposerFooter 上方渲染 dock 区）
- Modify: `frontend/src/app/regions/center-pane/ComposerFooter.tsx`（dock 区锚点/占位）
- Test: `frontend/src/app/features/part-stream/__tests__/SessionDocks.test.tsx`

**Interfaces:**
- Consumes: `state.questions`（QuestionEntry[]）、`state.status`（SessionPartState status）；`AskCard`（S2）、`TurnSummary`（S2）；`onReply`（reply 端点，S2 已接）
- Produces: `SessionDocks({ state, onReply })` —— 渲染 `AskCard`s（question.asked → 选项 → onReply）与 `TurnSummary`（status → 摘要），置于 Composer 上方

- [ ] **Step 1: 写失败测试**

`frontend/src/app/features/part-stream/__tests__/SessionDocks.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionDocks } from '../SessionDocks';
import type { SessionPartState } from '../partStoreTypes';

describe('SessionDocks', () => {
  it('renders AskCard for pending questions and TurnSummary for status', () => {
    const state: SessionPartState = {
      messages: new Map(), partsByMessage: new Map(), status: 'busy',
      questions: [{ requestID: 'q1', questions: [{ text: 'Allow?' }] }],
    };
    const onReply = vi.fn();
    render(<SessionDocks state={state} onReply={onReply} />);
    expect(screen.getByText(/Allow/i)).toBeTruthy();
    fireEvent.click(screen.getByText(/Allow/i));
    expect(onReply).toHaveBeenCalledWith('q1', ['Allow?']);
  });
});
```
> 与 `PartConversation` 里的 questions/status 渲染是否重复？本任务把 questions + TurnSummary 从 PartTimeline/PartConversation 移到 Composer dock 区（对齐 OpenCode 的 `session-question-dock.tsx`）。**去重**：确认 questions/status 只渲染一处（dock 区），不在 timeline 尾部重复。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend test -- SessionDocks`
Expected: FAIL。

- [ ] **Step 3: 实现 `SessionDocks.tsx` + CenterPane 集成**

`SessionDocks.tsx`:
```tsx
import { AskCard } from './AskCard';
import { TurnSummary } from './TurnSummary';
import { mapPartTurnStatus } from './PartConversation';
import { normalizeQuestions } from './partTimelineUtils';
import type { SessionPartState } from './partStoreTypes';
import { useTCopy } from '../../i18n/useTCopy';

export function SessionDocks({ state, onReply }: {
  state: SessionPartState;
  onReply: (requestID: string, answers: string[]) => void;
}) {
  const { t } = useTCopy();
  return (
    <div className="adl-part-docks" aria-label={t.partDocks}>
      {state.questions.map((q) => (
        <AskCard
          key={q.requestID}
          requestID={q.requestID}
          questions={normalizeQuestions(q.questions)}
          onReply={onReply}
        />
      ))}
      <TurnSummary status={mapPartTurnStatus(state.status)} />
    </div>
  );
}
```
CenterPane：在 `<ComposerFooter/>` 上方渲染 `<SessionDocks state={partState} onReply={replyToQuestion} />`（`partState` 来自 `usePartStream`；`replyToQuestion` 是 S2 接好的 reply 端点）。**从 PartTimeline/PartConversation 移除重复的 questions/status 渲染**（只留 dock 一处）。i18n 加 `partDocks`（"会话操作区"/"Session actions"）。

- [ ] **Step 4: 绿**

Run: `pnpm --dir frontend test`、lint、typecheck。
Expected: PASS / 0 errors。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/part-stream/SessionDocks.tsx frontend/src/app/regions/CenterPane.tsx frontend/src/app/regions/center-pane/ComposerFooter.tsx
git commit -m "feat(frontend): composer docks (AskCard + TurnSummary) bound to part-stream state"
```

---

### Task 4: 会话面板布局约束（panel constraints）

**Files:**
- Create: `frontend/src/app/features/part-stream/sessionPanelLayout.ts`（会话面板宽度约束纯函数）
- Create: `frontend/src/app/features/part-stream/__tests__/sessionPanelLayout.test.ts`
- Modify: `frontend/src/app/regions/CenterPane.tsx`（应用约束到 center 区宽度/右侧面板）
- Modify: `frontend/src/app/regions/right-panel/hooks/useRightPanelLayout.ts`（若有会话上下文，应用会话面板约束）

**Interfaces:**
- Consumes: 现有 `rightPanelLayout.ts`（`RightPanelMode` docked/overlay）、`RIGHT_PANEL_WIDTH_MIN/MAX`（uiSlice）、`useRightPanelLayout`（shellWidth/leftWidth/rightMaxWidth）；OpenCode `session-panel-width.ts` 语义（`SESSION_PANEL_WIDTH_MIN = 450`、`REVIEW_PANE_WIDTH_MIN = 480`、`clampSessionPanelWidth`）
- Produces: `sessionPanelLayout({ available, split }) -> number`（会话面板最大宽度）；`clampSessionPanelWidth({ width, available, split }) -> number`

- [ ] **Step 1: 写失败测试**

`frontend/src/app/features/part-stream/__tests__/sessionPanelLayout.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { sessionPanelWidthMax, clampSessionPanelWidth } from '../sessionPanelLayout';

describe('sessionPanelLayout', () => {
  it('caps chat panel width reserving review pane minimum', () => {
    expect(sessionPanelWidthMax({ available: 1400, split: false })).toBe(920);
    expect(sessionPanelWidthMax({ available: 1400, split: true })).toBe(600);
  });
  it('clamps stored width to max', () => {
    expect(clampSessionPanelWidth({ width: 1200, available: 1000, split: false })).toBe(520);
    expect(clampSessionPanelWidth({ width: 300, available: 1000, split: false })).toBe(300);
    expect(clampSessionPanelWidth({ width: 500, available: undefined, split: false })).toBe(500);
  });
});
```
> 对标 OpenCode `session-panel-width.ts`（SESSION_PANEL_WIDTH_MIN=450、REVIEW_PANE_WIDTH_MIN=480、REVIEW_PANE_WIDTH_MIN_SPLIT=800）。`available - 480`（非 split）/ `available - 800`（split），下限 450。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend test -- sessionPanelLayout`
Expected: FAIL。

- [ ] **Step 3: 实现**

`sessionPanelLayout.ts`（对标 OpenCode session-panel-width.ts）:
```ts
export const SESSION_PANEL_WIDTH_MIN = 450;
export const REVIEW_PANE_WIDTH_MIN = 480;
export const REVIEW_PANE_WIDTH_MIN_SPLIT = 800;

export function sessionPanelWidthMax(input: { available: number; split: boolean }): number {
  const pane = input.split ? REVIEW_PANE_WIDTH_MIN_SPLIT : REVIEW_PANE_WIDTH_MIN;
  return Math.max(SESSION_PANEL_WIDTH_MIN, input.available - pane);
}

export function clampSessionPanelWidth(input: {
  width: number;
  available: number | undefined;
  split: boolean;
}): number {
  if (input.available === undefined) return input.width;
  return Math.min(input.width, sessionPanelWidthMax(input));
}
```
CenterPane 集成：当会话有 Part 数据时，把 center 区宽度/右侧面板最大宽度用 `clampSessionPanelWidth` 约束（结合 `useRightPanelLayout` 的 `rightMaxWidth`）。**最小侵入**：若现有布局已足够，仅添加约束函数 + 单测 + 在 CenterPane 计算一个可用宽度传入（或注明现有布局已满足、约束函数为未来扩展保留）。报告说明实际接线。

- [ ] **Step 4: 绿**

Run: `pnpm --dir frontend test`、lint、typecheck。
Expected: PASS / 0 errors。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/part-stream/sessionPanelLayout.ts frontend/src/app/regions/CenterPane.tsx
git commit -m "feat(frontend): session panel width constraints (OpenCode-aligned)"
```

---

### Task 5: 右侧面板会话上下文（session side panel）

**Files:**
- Create: `frontend/src/app/features/part-stream/SessionSidePanel.tsx`（会话上下文面板：会话关联文件树 + 变更 + 审核摘要的上下文视图）
- Modify: `frontend/src/app/regions/CenterPane.tsx`（在 part 路径的 PartTimeline 之后渲染 `SessionSidePanel`——**决策（2026-08-11，评审确认）：** 不接线进 RightPanel 的 view 机器，因为 `ActiveToolPanel` 是 `React.memo` + 严格引用相等 + ToolId 驱动 switch，注入会话视图需重构 ToolSwitcher/面板相等性；CenterPane part 路径的常驻卡片（`flex:1 1 auto`，不随虚拟化 timeline 滚动）是最小侵入且满足「会话文件 + patch 上下文视图」意图。计划原文的 RightPanel 目标改为 CenterPane，评审复核通过）
- Test: `frontend/src/app/features/part-stream/__tests__/SessionSidePanel.test.tsx`

**Interfaces:**
- Consumes: `usePartStream` 的 `state`（assistant 的 `file` parts + `patch` parts）；现有 `right-panel` 的 `FilesPanel`/`ChangesPanel`/`useChangesPanelProps`；`PartDiffPanel`（S2，渲染 patch 文件列表）
- Produces: `SessionSidePanel({ state })` —— 会话关联文件（file parts）+ patch 列表（patch parts → `PartDiffPanel`）的上下文视图，供右侧面板会话模式呈现

- [ ] **Step 1: 写失败测试**

`frontend/src/app/features/part-stream/__tests__/SessionSidePanel.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SessionSidePanel } from '../SessionSidePanel';
import type { SessionPartState } from '../partStoreTypes';

describe('SessionSidePanel', () => {
  it('lists session files and patches', () => {
    const state: SessionPartState = {
      messages: new Map(), partsByMessage: new Map(), status: 'idle', questions: [],
    };
    // seed a file part + a patch part
    render(<SessionSidePanel state={state} />);
    // assert file / patch render
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend test -- SessionSidePanel`
Expected: FAIL。

- [ ] **Step 3: 实现**

`SessionSidePanel.tsx`:
```tsx
import { useMemo } from 'react';
import type { SessionPartState } from './partStoreTypes';
import { PartDiffPanel } from './PartDiffPanel';
import { useTCopy } from '../../i18n/useTCopy';

export function SessionSidePanel({ state }: { state: SessionPartState }) {
  const { t } = useTCopy();
  const files = useMemo(() => {
    const seen = new Set<string>();
    const out: { url: string; filename?: string }[] = [];
    for (const parts of state.partsByMessage.values()) {
      for (const part of parts) {
        if (part.type === 'file' && part.data.type === 'file') {
          if (!seen.has(part.data.url)) { seen.add(part.data.url); out.push({ url: part.data.url, filename: part.data.filename }); }
        }
      }
    }
    return out;
  }, [state.partsByMessage]);
  const patches = useMemo(() => {
    const out = [];
    for (const parts of state.partsByMessage.values()) {
      for (const part of parts) {
        if (part.type === 'patch' && part.data.type === 'patch') out.push(part);
      }
    }
    return out;
  }, [state.partsByMessage]);

  return (
    <div className="adl-part-side-panel" aria-label={t.partSessionSidePanel}>
      <h3 className="adl-part-side-panel__title">{t.partSessionFiles}</h3>
      <ul className="adl-part-side-panel__files">
        {files.map((f) => <li key={f.url}>{f.filename ?? f.url}</li>)}
      </ul>
      <h3 className="adl-part-side-panel__title">{t.partSessionPatches}</h3>
      {patches.map((p) => <PartDiffPanel key={p.id} part={p} />)}
    </div>
  );
}
```
RightPanel 集成：当活动会话有 Part 数据时，右侧面板在会话模式呈现 `SessionSidePanel`（与现有 FilesPanel/ChangesPanel 并存或作为会话上下文 Tab）。**最小侵入**：查 RightPanel 当前如何决定显示哪个面板（`ToolSwitcher`/`useRightPanelViewProps`），在会话有 Part 数据时注入会话上下文视图。i18n 加 `partSessionSidePanel`/`partSessionFiles`/`partSessionPatches`。

- [ ] **Step 4: 绿**

Run: `pnpm --dir frontend test`、lint、typecheck。
Expected: PASS / 0 errors。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/part-stream/SessionSidePanel.tsx frontend/src/app/regions/right-panel/RightPanel.tsx
git commit -m "feat(frontend): session side panel context (files + patches)"
```

---

### Task 6: i18n keys + 会话布局样式 + 全量验收

**Files:**
- Modify: `frontend/src/app/i18n/en-US/*` + `frontend/src/app/i18n/zh-CN/*`（新增 S3 keys：`partSessionFileTabs`、`partDocks`、`partSessionSidePanel`、`partSessionFiles`、`partSessionPatches`）
- Modify: `frontend/src/app/i18n/types.ts`（CopyKey 自动派生，无需手改）
- Create: `frontend/src/styles/part-session.css`（会话布局样式：timeline、file-tabs、docks、side-panel；`.adl-part-scope` 内，`var(--…)`）
- Modify: `frontend/src/styles/index.css`（import part-session.css）

**Interfaces:**
- Consumes: 现有 i18n dict + `CopyKey = keyof typeof zhCN`；`.adl-part-scope` 作用域（S2）
- Produces: S3 全部 i18n keys（en/zh 对齐）；会话布局 CSS（token-only，作用域内）

- [ ] **Step 1: 写失败测试（i18n key 存在性 + CSS class 覆盖）**

按现有约定：运行 `check:i18n`（若存在）或 i18n parity 测试；`part-stream-scope.test.ts` 扩展断言 S3 class（`adl-part-timeline`/`adl-part-file-tabs`/`adl-part-docks`/`adl-part-side-panel`）被样式覆盖。
Expected: FAIL（keys/CSS 不存在）。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend run check:i18n`（或对应测试）
Expected: FAIL。

- [ ] **Step 3: 实现**

新增 keys（en-US + zh-CN 同步）：
- `partSessionFileTabs` / `partDocks` / `partSessionSidePanel` / `partSessionFiles` / `partSessionPatches`

`part-session.css`（作用域内，token-only）:
```css
.adl-part-timeline { height: 100%; overflow: hidden; }
.adl-part-file-tabs { display: flex; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--border-default); }
.adl-part-file-tab { padding: 4px 10px; border-radius: 6px; background: var(--bg-card); color: var(--text-primary); }
.adl-part-file-tab__name { font-size: 13px; }
.adl-part-docks { display: flex; flex-direction: column; gap: 8px; padding: 8px 12px; border-top: 1px solid var(--border-default); }
.adl-part-side-panel__title { font-size: 13px; font-weight: 600; color: var(--text-secondary); }
.adl-part-side-panel__files li { font-size: 13px; color: var(--text-primary); }
```

- [ ] **Step 4: 绿**

Run: i18n 检查 + `pnpm --dir frontend test` + lint + typecheck。
Expected: PASS / 0 errors。

- [ ] **Step 5: 全量验收 + 文档 + 提交**

```bash
pnpm --dir frontend test
pnpm --dir frontend run lint
pnpm --dir frontend run typecheck
cargo test --workspace -- --skip google
cargo clippy --workspace --all-targets -- -D warnings
```
更新 `docs/superpowers/specs/2026-08-09-agent-operation-frontend-opencode-alignment-design.md` §6 验收 → 标「完成」。提交：
`feat(frontend): session page OpenCode-aligned layout (timeline/file-tabs/docks/panels)`

---

## Execution Handoff（由父 agent 选择）

- **Subagent-Driven（推荐）**：每次 dispatch 一个 subagent（Task 1→n），`Task 完成即 review`——见 superpowers:subagent-driven-development。
- **Inline**：executing-plans 逐 Task 检查点。

> 每 Task 一次 `git status` 确认 scope 干净；每次 commit 独立、conventional（feat/fix）。
