import type { PartData, PartRecord, MessageRecord } from '../../../kernel/types-part';
import type { PartState, SessionPartState, SseWireEvent } from './partStoreTypes';

export function createInitialPartState(): PartState {
  return {};
}

function sessionState(state: PartState, sessionID: string): SessionPartState {
  return (
    state[sessionID] ?? {
      messages: new Map(),
      partsByMessage: new Map(),
      status: 'idle',
      questions: [],
    }
  );
}

function cloneSession(prev: SessionPartState): SessionPartState {
  return {
    messages: new Map(prev.messages),
    // Shallow map copy: parts arrays are immutable here — every mutation path
    // (`message.part.updated`/`message.part.delta`) replaces the touched
    // message's array with a fresh one, never mutating in place. Reusing the
    // untouched arrays preserves their identity across deltas so the timeline's
    // memoized rows can bail out when their message's parts did not change.
    partsByMessage: new Map(prev.partsByMessage),
    status: prev.status,
    questions: [...prev.questions],
  };
}

// Wire `message.part.updated` carries the part either as a full PartRecord with a
// nested `data` object (ADL loop_executor `serde_json::to_value(&PartRecord)`) or as
// an OpenCode-style flattened part (content fields at row level, no `data`). Normalize
// both into a PartRecord that always has a nested `data` payload.
function toPartRecord(wire: Record<string, unknown>): PartRecord {
  const existing = wire.data;
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    return { ...wire, data: existing } as unknown as PartRecord;
  }
  const { id, messageID, sessionID, type, ordinal, timeCreated, ...content } = wire;
  return {
    id,
    messageID,
    sessionID,
    type,
    ordinal,
    timeCreated,
    data: { type, ...content },
  } as unknown as PartRecord;
}

function upsertPart(parts: PartRecord[], part: PartRecord): PartRecord[] {
  const idx = parts.findIndex((p) => p.id === part.id);
  if (idx < 0) {
    return [...parts, part];
  }
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
      if (existing) {
        next.messages.set(event.info.id, {
          ...existing,
          ...(event.info as object),
        } as MessageRecord);
      }
      break;
    }
    case 'message.part.updated': {
      const part = toPartRecord(event.part);
      const list = next.partsByMessage.get(event.messageID) ?? [];
      next.partsByMessage.set(event.messageID, upsertPart(list, part));
      break;
    }
    case 'message.part.delta': {
      const list = next.partsByMessage.get(event.messageID) ?? [];
      const part = list.find((p) => p.id === event.partID);
      if (part && typeof part.data === 'object' && part.data !== null) {
        const data = { ...(part.data as Record<string, unknown>) };
        // 增量字段 text 与 reasoning 都落在 data.text：TextPartData.text 与
        // ReasoningPartData.text 是内容存储键（design §5.1：delta 追加到 text/reasoning）。
        // 真实 wire 中 text/reasoning delta 均以 field="text" 发送（loop_executor.rs）。
        if (
          (event.field === 'text' || event.field === 'reasoning') &&
          typeof data.text === 'string'
        ) {
          data.text = (data.text as string) + event.delta;
        }
        const idx = list.findIndex((p) => p.id === event.partID);
        const updated = { ...part, data: data as PartData } as PartRecord;
        next.partsByMessage.set(event.messageID, [
          ...list.slice(0, idx),
          updated,
          ...list.slice(idx + 1),
        ]);
      }
      break;
    }
    case 'session.status': {
      const status = event.status as SessionPartState['status'];
      next.status = status;
      break;
    }
    case 'question.asked':
      next.questions = [
        ...next.questions,
        { requestID: event.requestID, questions: event.questions, tool: event.tool },
      ];
      break;
    case 'question.replied':
      next.questions = next.questions.filter((q) => q.requestID !== event.requestID);
      break;
  }

  return { ...state, [sessionID]: next };
}

export function hydratePartHistory(
  state: PartState,
  sessionID: string,
  payload: { messages: { message: MessageRecord; parts: PartRecord[] }[] },
): PartState {
  const prev = sessionState(state, sessionID);
  const next: SessionPartState = cloneSession(prev);
  for (const entry of payload.messages) {
    next.messages.set(entry.message.id, entry.message);
    next.partsByMessage.set(
      entry.message.id,
      [...(entry.parts ?? [])].sort((a, b) => a.ordinal - b.ordinal),
    );
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
