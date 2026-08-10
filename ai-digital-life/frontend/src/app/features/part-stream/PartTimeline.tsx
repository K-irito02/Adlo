import { useEffect, useMemo, useRef, useState } from 'react';
import { List, useListRef, useDynamicRowHeight } from 'react-window';
import type { ListProps } from 'react-window';
import type { MessageRecord, PartRecord } from '../../../kernel/types-part';
import {
  type PartConversationProps,
  mapPartTurnStatus,
  resolvePartMessageRole,
} from './PartConversation';
import { normalizeQuestions } from './partTimelineUtils';
import { groupParts, type PartRef } from './groupParts';
import { PartRenderer } from './PartRenderer';
import { ContextToolGroup } from './ContextToolGroup';
import { AskCard } from './AskCard';
import { TurnSummary } from './TurnSummary';
import { useTCopy } from '../../i18n/useTCopy';

interface TimelineRow {
  message: MessageRecord;
  role: 'user' | 'assistant';
  text: string;
}

interface RowProps {
  rows: TimelineRow[];
  partsByMessage: Map<string, PartRecord[]>;
}

function partByRef(
  ref: PartRef,
  partsByMessage: ReadonlyMap<string, PartRecord[]>,
): PartRecord | undefined {
  return partsByMessage.get(ref.messageID)?.find((p) => p.id === ref.partID);
}

const TimelineRowComponent = ({
  index,
  style,
  rows,
  partsByMessage,
}: {
  index: number;
  style: React.CSSProperties;
  rows: RowProps['rows'];
  partsByMessage: RowProps['partsByMessage'];
}) => {
  const row = rows[index];
  if (!row) {
    return null;
  }
  const parts = partsByMessage.get(row.message.id) ?? [];
  return (
    <div style={{ ...style, height: 'auto', minHeight: style.height }}>
      {row.role === 'user' ? (
        <article className="adl-part-message adl-part-message--user">
          <div className="adl-part-message__text">{row.text}</div>
        </article>
      ) : (
        <article className="adl-part-message adl-part-message--assistant">
          {groupParts(parts.map((part) => ({ messageID: row.message.id, part }))).map((group) =>
            group.type === 'context' ? (
              <ContextToolGroup
                key={group.key}
                parts={group.refs
                  .map((ref) => partByRef(ref, partsByMessage))
                  .filter((p): p is PartRecord => !!p)}
              />
            ) : (
              <PartRenderer
                key={group.key}
                message={row.message}
                part={partByRef(group.ref, partsByMessage) as PartRecord}
              />
            ),
          )}
        </article>
      )}
    </div>
  );
};
TimelineRowComponent.displayName = 'TimelineRow';

/**
 * Virtualized part timeline (react-window). Renders only the viewport rows —
 * user messages (text) and assistant messages (parts via groupParts →
 * PartRenderer / ContextToolGroup) — with dynamic row heights, mirroring the
 * `MessageStream` List pattern. AskCards and the TurnSummary stay at the
 * bottom, non-virtualized (they are few; Task 3 moves them to the Composer dock).
 */
export function PartTimeline({ state, userTextByMessageId, onReply }: PartConversationProps) {
  const { t } = useTCopy();
  const listRef = useListRef(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);
  const dynamicRowHeight = useDynamicRowHeight({ defaultRowHeight: 120 });

  const rows = useMemo((): TimelineRow[] => {
    const ordered: TimelineRow[] = [];
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
      ordered.push({
        message,
        role,
        text: role === 'user' ? (userTextByMessageId?.get(message.id) ?? '') : '',
      });
    }
    return ordered;
  }, [state, userTextByMessageId]);

  const rowProps = useMemo(
    (): RowProps => ({
      rows,
      partsByMessage: state.partsByMessage,
    }),
    [rows, state.partsByMessage],
  );

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="adl-part-scope adl-part-timeline"
      role="log"
      aria-label={t.conversation}
      aria-live="polite"
    >
      <List
        listRef={listRef}
        style={{ height: containerHeight, width: '100%' }}
        rowComponent={TimelineRowComponent as unknown as ListProps<RowProps>['rowComponent']}
        rowCount={rows.length}
        rowHeight={dynamicRowHeight}
        overscanCount={5}
        rowProps={rowProps}
      />
      {state.questions.length > 0 ? (
        <div className="adl-part-question-list">
          {state.questions.map((question) => (
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
