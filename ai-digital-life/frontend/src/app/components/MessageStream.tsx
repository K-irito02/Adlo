import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { List, useListRef, useDynamicRowHeight } from 'react-window';
import type { ListProps } from 'react-window';
import type { ConversationMessageRecord, AgentRunDetail, ModelTokenUsage } from '@shared/ipc';
import type { DigitalLifeRunActivityEventV1 } from '@shared/ipc/digital-life';
import { IconBrain } from '../icons';
import { MessageBlocks } from '../features/conversation/MessageBlocks';
import { RunSummaryBlock } from './conversation/RunSummaryBlock';
import { useTCopy } from '../i18n/useTCopy';

interface MessageStreamProps {
  messages: ConversationMessageRecord[];
  streamingText?: string;
  isStreaming?: boolean;
  activeRun?: AgentRunDetail;
  streamingActiveRunId?: string;
  runActivityByRunId?: Record<string, DigitalLifeRunActivityEventV1[]>;
  runUsageByRunId?: Record<string, ModelTokenUsage | undefined>;
  locale?: 'zh-CN' | 'en-US';
}

type StreamItem =
  | { type: 'message'; message: ConversationMessageRecord }
  | { type: 'run-summary'; messageId: string; runId: string }
  | { type: 'approval-hint' }
  | { type: 'streaming-message' }
  | { type: 'streaming-run-summary'; runId: string };

interface RowProps {
  streamItems: StreamItem[];
  activeRun?: AgentRunDetail;
  runActivityByRunId: Record<string, DigitalLifeRunActivityEventV1[]>;
  runUsageByRunId: Record<string, ModelTokenUsage | undefined>;
  locale: string;
  streamingText: string;
}

const RowComponent = React.memo(
  ({
    index,
    style,
    ariaAttributes: _ariaAttributes,
    streamItems,
    activeRun,
    runActivityByRunId,
    runUsageByRunId,
    locale,
    streamingText,
  }: {
    index: number;
    style: React.CSSProperties;
    ariaAttributes: { 'aria-posinset': number; 'aria-setsize': number; role: 'listitem' };
    streamItems: StreamItem[];
    activeRun?: AgentRunDetail;
    runActivityByRunId: Record<string, DigitalLifeRunActivityEventV1[]>;
    runUsageByRunId: Record<string, ModelTokenUsage | undefined>;
    locale: string;
    streamingText: string;
  }) => {
    const { t } = useTCopy();
    const item = streamItems[index];

    const padding = useMemo(() => (index === 0 ? 0 : 'var(--space-3) 0 0 0'), [index]);

    const renderContent = useCallback(() => {
      switch (item.type) {
        case 'message':
          return (
            <article className={`adl-message adl-message--${item.message.role}`}>
              <header>
                <strong>{item.message.role}</strong>
                <time>
                  {new Date(item.message.createdAt).toLocaleTimeString(locale, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </header>
              <p>{item.message.content}</p>
              <MessageBlocks message={item.message} t={t} />
            </article>
          );
        case 'run-summary':
          return (
            <RunSummaryBlock
              t={t}
              runId={item.runId}
              run={activeRun?.run.id === item.runId ? activeRun : undefined}
              events={runActivityByRunId[item.runId] ?? []}
              usage={runUsageByRunId[item.runId]}
              defaultExpanded={false}
            />
          );
        case 'approval-hint':
          return (
            <div className="adl-center__approval-hint">
              <span>{t.approvalWaitingHint}</span>
            </div>
          );
        case 'streaming-message':
          return (
            <article className="adl-message adl-message--assistant adl-message--streaming">
              <header>
                <strong>assistant</strong>
                <span className="adl-agent-status adl-agent-status--processing">
                  <IconBrain size={12} decorative />
                  {t.agentGenerating}
                </span>
              </header>
              <p>{streamingText}</p>
            </article>
          );
        case 'streaming-run-summary':
          return (
            <RunSummaryBlock
              t={t}
              runId={item.runId}
              events={runActivityByRunId[item.runId] ?? []}
              usage={runUsageByRunId[item.runId]}
              defaultExpanded
            />
          );
        default:
          return null;
      }
    }, [item, t, activeRun, runActivityByRunId, runUsageByRunId, locale, streamingText]);

    if (!item) {
      return null;
    }

    return (
      <div style={{ ...style, height: 'auto', minHeight: style.height }}>
        <div style={{ padding }}>{renderContent()}</div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    if (prevProps.index !== nextProps.index) {
      return false;
    }

    const item = prevProps.streamItems[prevProps.index];
    const nextItem = nextProps.streamItems[nextProps.index];

    // If the item type changed (or item is missing), re-render
    if (!item || !nextItem || item.type !== nextItem.type) {
      return false;
    }

    // locale affects all rows through `t` from useTCopy()
    if (prevProps.locale !== nextProps.locale) {
      return false;
    }

    // Per-row-type dependency comparison — only re-render when props
    // that actually flow into the row's render output have changed.
    // This is the fix for the re-render storm: previously, ANY change
    // to streamItems (which depends on streamingText) forced ALL rows
    // to re-render. Now, non-streaming rows compare only their actual
    // dependencies.
    switch (item.type) {
      case 'message':
        // message row uses: item.message (reference), locale (checked above)
        return item.message === (nextItem as typeof item).message;

      case 'streaming-message':
        // streaming-message row uses: streamingText, locale (checked above)
        return prevProps.streamingText === nextProps.streamingText;

      case 'run-summary':
        // run-summary row uses: item.runId, activeRun, runActivityByRunId, runUsageByRunId, locale (checked above)
        return (
          item.runId === (nextItem as typeof item).runId &&
          prevProps.activeRun === nextProps.activeRun &&
          prevProps.runActivityByRunId === nextProps.runActivityByRunId &&
          prevProps.runUsageByRunId === nextProps.runUsageByRunId
        );

      case 'streaming-run-summary':
        // streaming-run-summary row uses: item.runId, runActivityByRunId, runUsageByRunId, locale (checked above)
        return (
          item.runId === (nextItem as typeof item).runId &&
          prevProps.runActivityByRunId === nextProps.runActivityByRunId &&
          prevProps.runUsageByRunId === nextProps.runUsageByRunId
        );

      case 'approval-hint':
        // approval-hint row uses: locale (checked above, via t.approvalWaitingHint)
        // activeRun only affects whether the item EXISTS in streamItems (already checked via type comparison)
        return true;

      default:
        // Unknown type — re-render to be safe
        return false;
    }
  },
);

RowComponent.displayName = 'RowComponent';

export function MessageStream({
  messages,
  streamingText = '',
  isStreaming = false,
  activeRun,
  streamingActiveRunId,
  runActivityByRunId = {},
  runUsageByRunId = {},
  locale = 'en-US',
}: MessageStreamProps) {
  const { t } = useTCopy();
  const listRef = useListRef(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);
  const dynamicRowHeight = useDynamicRowHeight({ defaultRowHeight: 200 });
  const wasAtBottomRef = useRef(true);

  const visibleMessages = useMemo(
    () => messages.filter((message) => message.id !== 'message-welcome'),
    [messages],
  );

  const streamItems = useMemo((): StreamItem[] => {
    const items: StreamItem[] = [];

    for (const message of visibleMessages) {
      items.push({ type: 'message', message });
      if (message.role === 'assistant' && message.runId) {
        items.push({ type: 'run-summary', messageId: message.id, runId: message.runId });
      }
    }

    if (activeRun?.run.status === 'waiting-approval') {
      items.push({ type: 'approval-hint' });
    }

    if (isStreaming && streamingText) {
      items.push({ type: 'streaming-message' });
    }

    if (streamingActiveRunId) {
      items.push({ type: 'streaming-run-summary', runId: streamingActiveRunId });
    }

    return items;
  }, [visibleMessages, activeRun, isStreaming, streamingText, streamingActiveRunId]);

  const rowProps = useMemo(
    (): RowProps => ({
      streamItems,
      activeRun,
      runActivityByRunId,
      runUsageByRunId,
      locale,
      streamingText,
    }),
    [streamItems, activeRun, runActivityByRunId, runUsageByRunId, locale, streamingText],
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

  const handleRowsRendered = useCallback(
    (
      visibleRows: { startIndex: number; stopIndex: number },
      _allRows: { startIndex: number; stopIndex: number },
    ) => {
      if (streamItems.length > 0) {
        wasAtBottomRef.current = visibleRows.stopIndex >= streamItems.length - 1;
      }
    },
    [streamItems.length],
  );

  useEffect(() => {
    if (listRef.current && streamItems.length > 0 && (wasAtBottomRef.current || streamingText)) {
      listRef.current.scrollToRow({
        index: streamItems.length - 1,
        align: 'end',
        behavior: streamingText ? 'instant' : 'auto',
      });
    }
  }, [messages.length, streamingText, streamItems.length, listRef]);

  if (visibleMessages.length === 0 && !streamingText) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="adl-message-stream"
      role="log"
      aria-label={t.conversationMessageStream}
      aria-live="polite"
      style={{ display: 'block' }}
    >
      <List
        listRef={listRef}
        style={{ height: containerHeight, width: '100%' }}
        rowComponent={RowComponent as unknown as ListProps<RowProps>['rowComponent']}
        rowCount={streamItems.length}
        rowHeight={dynamicRowHeight}
        overscanCount={5}
        onRowsRendered={handleRowsRendered}
        rowProps={rowProps}
      />
    </div>
  );
}

export default MessageStream;
export type { MessageStreamProps };
