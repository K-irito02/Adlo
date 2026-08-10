/* eslint-disable react-refresh/only-export-components */
import type { MessageRecord, PartRecord } from '../../../kernel/types-part';
import type { SessionPartState } from './partStoreTypes';
import { normalizeQuestions } from './partTimelineUtils';
import { PartTimeline } from './PartTimeline';

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

export { normalizeQuestions };

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
}

/**
 * S2 part-render conversation body: a thin shell over the virtualized
 * `PartTimeline` (react-window List rendering the PartStore message list —
 * user text + assistant parts via PartRenderer/ContextToolGroup). AskCards
 * and the TurnSummary are rendered by the Composer dock `SessionDocks` (Task
 * 3), NOT by the timeline. This is the PRIMARY render path in CenterPane
 * whenever the session has part data; the legacy `MessageStream` remains the
 * fallback for part-less sessions (it is NOT a compat layer for part data).
 */
export function PartConversation({ state, userTextByMessageId }: PartConversationProps) {
  return <PartTimeline state={state} userTextByMessageId={userTextByMessageId} />;
}
