/* eslint-disable react-refresh/only-export-components */
import { useMemo } from 'react';
import type { MessageRecord, PartRecord } from '../../../kernel/types-part';
import type { QuestionEntry, SessionPartState } from './partStoreTypes';
import { groupParts, type PartRef } from './groupParts';
import { PartRenderer } from './PartRenderer';
import { ContextToolGroup } from './ContextToolGroup';
import { AskCard } from './AskCard';
import { TurnSummary } from './TurnSummary';
import { useTCopy } from '../../i18n/useTCopy';

export type PartTurnStatus = 'idle' | 'busy' | 'error' | 'cancelled' | 'completed';

/**
 * Map the PartStore `session.status` onto the TurnSummary union.
 *
 * The wire canonicalizes terminal statuses to `"active"` (a resting session,
 * `canonical_terminal_status("idle")`), `"cancelled"` and `"error"` (S1
 * `agent_loop.rs`). `'active'` is a member of the store's typed union (the
 * reducer casts the raw wire value, and `active` is the terminal resting
 * status the server actually publishes). Both `'idle'` and `'active'` are
 * terminal resting states → mapped to `'completed'` for the summary display
 * (a busy run that ended).
 */
export function mapPartTurnStatus(status: SessionPartState['status']): PartTurnStatus {
  switch (status) {
    case 'busy':
      return 'busy';
    case 'error':
      return 'error';
    case 'cancelled':
      return 'cancelled';
    default:
      // 'idle' | 'active' — terminal resting → completed
      return 'completed';
  }
}

/**
 * Resolve a message's display role when the `MessageRecord.role` is absent.
 *
 * The S1 `message.created` wire info is `{ id, finish: null }` — no
 * role/sessionID/timeCreated. The PartStore therefore holds announcements
 * whose `role` is `undefined` until history hydrate (`GET /session/{id}/message`)
 * overwrites them with full records. Heuristic, in priority order:
 *
 *   1. explicit `role === 'user'` / `'assistant'` (history hydrate carries the
 *      full record) — authoritative.
 *   2. has parts → assistant (only assistant messages accumulate parts).
 *   3. is the `parentID` of another message → user (the loop links each
 *      assistant message to the user message that prompted it).
 *   4. otherwise → user. An un-annotated, part-less announcement with no
 *      children is the `kick_agent_run` user announcement (published before the
 *      loop saves the hydrated `MessageRecord`); it renders the user prompt
 *      from the legacy ConversationMessageRecord until hydrate arrives.
 */
export function resolvePartMessageRole(
  message: MessageRecord,
  messages: ReadonlyMap<string, MessageRecord>,
  partsByMessage: ReadonlyMap<string, PartRecord[]>,
): 'user' | 'assistant' {
  if (message.role === 'user') {
    return 'user';
  }
  if (message.role === 'assistant') {
    return 'assistant';
  }
  if ((partsByMessage.get(message.id)?.length ?? 0) > 0) {
    return 'assistant';
  }
  for (const candidate of messages.values()) {
    if (candidate.parentID === message.id) {
      return 'user';
    }
  }
  return 'user';
}

function normalizeQuestions(questions: unknown[]): { text?: string; [key: string]: unknown }[] {
  return (questions ?? []).map((q) => {
    if (typeof q === 'string') {
      return { text: q };
    }
    if (q && typeof q === 'object') {
      return { ...(q as Record<string, unknown>) };
    }
    return { text: String(q) };
  });
}

function partByRef(
  ref: PartRef,
  partsByMessage: ReadonlyMap<string, PartRecord[]>,
): PartRecord | undefined {
  return partsByMessage.get(ref.messageID)?.find((p) => p.id === ref.partID);
}

export interface PartConversationProps {
  /** Per-session part-render state from `selectSessionMessages` / `usePartStream`. */
  state: SessionPartState;
  /**
   * User prompt text by part-message id. The Part wire carries NO user text
   * (MessageRecord has no content field; the loop attaches no text part to the
   * user message) — it lives only on the legacy ConversationMessageRecord the
   * S1 bridge persists. CenterPane builds this map (direct id + assistant-hop
   * correlation); absent → user rows render only their parts.
   */
  userTextByMessageId?: ReadonlyMap<string, string>;
  /** AskCard reply — the caller wires `conversation.replyToQuestion`. */
  onReply: (requestID: string, answers: string[]) => void;
}

/**
 * S2 part-render conversation body: renders the PartStore message list
 * (user text + assistant parts via PartRenderer/ContextToolGroup), pending
 * AskCards and the TurnSummary, all inside the `.adl-part-scope` local visual
 * scope. This is the PRIMARY render path in CenterPane whenever the session
 * has part data; the legacy `MessageStream` remains the fallback for
 * part-less sessions (it is NOT a compat layer for part data).
 */
export function PartConversation({ state, userTextByMessageId, onReply }: PartConversationProps) {
  const { t } = useTCopy();

  const rows = useMemo(() => {
    const ordered: { message: MessageRecord; role: 'user' | 'assistant' }[] = [];
    let lastUserText: string | undefined;
    for (const message of state.messages.values()) {
      const role = resolvePartMessageRole(message, state.messages, state.partsByMessage);
      if (role === 'user') {
        const text = userTextByMessageId?.get(message.id);
        const hasParts = (state.partsByMessage.get(message.id)?.length ?? 0) > 0;
        // Skip a user row with neither parts nor text: a transient
        // `message.created` kick announcement whose hydrated twin carries the
        // prompt. Also dedupe the rare hydrate/SSE twin — the same turn can
        // appear as `message_xxx` (direct ConversationMessageRecord id) AND
        // `msg_xxx` (hydrated MessageRecord via the assistant-parent hop) that
        // resolve to the SAME prompt; render only the first consecutive
        // identical user row.
        if (!hasParts && !text) {
          continue;
        }
        if (!hasParts && text === lastUserText) {
          continue;
        }
        lastUserText = text;
      }
      ordered.push({ message, role });
    }
    return ordered;
  }, [state, userTextByMessageId]);

  return (
    <div className="adl-part-scope adl-part-conversation" role="log" aria-label={t.conversation}>
      {rows.map(({ message, role }) =>
        role === 'user' ? (
          <article key={message.id} className="adl-part-message adl-part-message--user">
            <div className="adl-part-message__text">{userTextByMessageId?.get(message.id)}</div>
          </article>
        ) : (
          <article key={message.id} className="adl-part-message adl-part-message--assistant">
            {groupParts(
              (state.partsByMessage.get(message.id) ?? []).map((part) => ({
                messageID: message.id,
                part,
              })),
            ).map((group) =>
              group.type === 'context' ? (
                <ContextToolGroup
                  key={group.key}
                  parts={group.refs
                    .map((ref) => partByRef(ref, state.partsByMessage))
                    .filter((p): p is PartRecord => !!p)}
                />
              ) : (
                <PartRenderer
                  key={group.key}
                  message={message}
                  part={partByRef(group.ref, state.partsByMessage) as PartRecord}
                />
              ),
            )}
          </article>
        ),
      )}

      {state.questions.length > 0 ? (
        <div className="adl-part-question-list">
          {state.questions.map((question: QuestionEntry) => (
            <AskCard
              key={question.requestID}
              requestID={question.requestID}
              questions={normalizeQuestions(question.questions)}
              onReply={onReply}
            />
          ))}
        </div>
      ) : null}

      {state.status !== 'idle' ? <TurnSummary status={mapPartTurnStatus(state.status)} /> : null}
    </div>
  );
}
