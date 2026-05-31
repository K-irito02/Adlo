import React, { useEffect, useRef, useMemo, useCallback, useState } from "react";
import { List, useListRef, useDynamicRowHeight } from "react-window";
import type { ConversationMessageRecord, AgentRunDetail, ModelTokenUsage, DigitalLifeRunActivityEventV1 } from "@ai-digital-life/kernel";
import type { CopyDict } from "../i18n";
import { IconBrain } from "../icons";
import { MessageBlocks } from "../MessageBlocks";
import { RunSummaryBlock } from "./conversation/RunSummaryBlock";
import { copy } from "../i18n";

interface MessageStreamProps {
  messages: ConversationMessageRecord[];
  t?: CopyDict;
  streamingText?: string;
  isStreaming?: boolean;
  activeRun?: AgentRunDetail;
  streamingActiveRunId?: string;
  runActivityByRunId?: Record<string, DigitalLifeRunActivityEventV1[]>;
  runUsageByRunId?: Record<string, ModelTokenUsage | undefined>;
  locale?: "zh-CN" | "en-US";
}

type StreamItem = 
  | { type: "message"; message: ConversationMessageRecord }
  | { type: "run-summary"; messageId: string; runId: string }
  | { type: "approval-hint" }
  | { type: "streaming-message" }
  | { type: "streaming-run-summary"; runId: string };

interface RowProps {
  streamItems: StreamItem[];
  t: CopyDict;
  activeRun?: AgentRunDetail;
  runActivityByRunId: Record<string, DigitalLifeRunActivityEventV1[]>;
  runUsageByRunId: Record<string, ModelTokenUsage | undefined>;
  locale: string;
  streamingText: string;
}

const RowComponent = React.memo(({ 
  index, 
  style, 
  ariaAttributes,
  streamItems, 
  t, 
  activeRun, 
  runActivityByRunId, 
  runUsageByRunId, 
  locale, 
  streamingText 
}: {
  index: number;
  style: React.CSSProperties;
  ariaAttributes: any;
  streamItems: StreamItem[];
  t: CopyDict;
  activeRun?: AgentRunDetail;
  runActivityByRunId: Record<string, DigitalLifeRunActivityEventV1[]>;
  runUsageByRunId: Record<string, ModelTokenUsage | undefined>;
  locale: string;
  streamingText: string;
}) => {
  const item = streamItems[index];

  if (!item) {
    return null;
  }

  const padding = useMemo(() => (
    index === 0 ? 0 : "var(--space-3) 0 0 0"
  ), [index]);

  const renderContent = useCallback(() => {
    switch (item.type) {
      case "message":
        return (
          <article className={`adl-message adl-message--${item.message.role}`}>
            <header>
              <strong>{item.message.role}</strong>
              <time>
                {new Date(item.message.createdAt).toLocaleTimeString(locale, {
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </time>
            </header>
            <p>{item.message.content}</p>
            <MessageBlocks message={item.message} t={t} />
          </article>
        );
      case "run-summary":
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
      case "approval-hint":
        return (
          <div className="adl-center__approval-hint">
            <span>{t.approvalWaitingHint}</span>
          </div>
        );
      case "streaming-message":
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
      case "streaming-run-summary":
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

  return (
    <div style={{ ...style, height: "auto", minHeight: style.height }}>
      <div style={{ padding }}>
        {renderContent()}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // 优化比较，只比较真正需要变化才会重新渲染的属性
  if (prevProps.index !== nextProps.index) return false;
  if (prevProps.streamItems !== nextProps.streamItems) return false;
  
  // 只在内容真正变化时才重新渲染相关部分
  const item = prevProps.streamItems[prevProps.index];
  const nextItem = nextProps.streamItems[nextProps.index];
  
  // 如果项类型不同，必须重新渲染
  if (!item || !nextItem || item.type !== nextItem.type) return false;
  
  // 对于流式文本，每次都要更新
  if (item.type === "streaming-message" && prevProps.streamingText !== nextProps.streamingText) {
    return false;
  }
  
  // 检查其他需要变化的属性
  if (prevProps.t !== nextProps.t) return false;
  if (prevProps.activeRun !== nextProps.activeRun) return false;
  if (prevProps.runActivityByRunId !== nextProps.runActivityByRunId) return false;
  if (prevProps.runUsageByRunId !== nextProps.runUsageByRunId) return false;
  if (prevProps.locale !== nextProps.locale) return false;
  
  return true;
});

RowComponent.displayName = "RowComponent";

export function MessageStream({ 
  messages, 
  t, 
  streamingText = "", 
  isStreaming = false,
  activeRun,
  streamingActiveRunId,
  runActivityByRunId = {},
  runUsageByRunId = {},
  locale = "en-US"
}: MessageStreamProps) {
  const listRef = useListRef(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);
  const dynamicRowHeight = useDynamicRowHeight({ defaultRowHeight: 200 });
  const wasAtBottomRef = useRef(true);
  
  const visibleMessages = useMemo(() => 
    messages.filter((message) => message.id !== "message-welcome"),
    [messages]
  );

  const streamItems = useMemo((): StreamItem[] => {
    const items: StreamItem[] = [];
    
    for (const message of visibleMessages) {
      items.push({ type: "message", message });
      if (message.role === "assistant" && message.runId) {
        items.push({ type: "run-summary", messageId: message.id, runId: message.runId });
      }
    }
    
    if (activeRun?.run.status === "waiting-approval") {
      items.push({ type: "approval-hint" });
    }
    
    if (isStreaming && streamingText) {
      items.push({ type: "streaming-message" });
    }
    
    if (streamingActiveRunId) {
      items.push({ type: "streaming-run-summary", runId: streamingActiveRunId });
    }
    
    return items;
  }, [visibleMessages, activeRun, isStreaming, streamingText, streamingActiveRunId]);

  const rowProps = useMemo((): RowProps => ({
    streamItems,
    t: t || copy[locale],
    activeRun,
    runActivityByRunId,
    runUsageByRunId,
    locale,
    streamingText,
  }), [streamItems, t, activeRun, runActivityByRunId, runUsageByRunId, locale, streamingText]);

  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleRowsRendered = useCallback((
    visibleRows: { startIndex: number; stopIndex: number }, 
    allRows: { startIndex: number; stopIndex: number }
  ) => {
    if (streamItems.length > 0) {
      wasAtBottomRef.current = visibleRows.stopIndex >= streamItems.length - 1;
    }
  }, [streamItems.length]);

  useEffect(() => {
    if (listRef.current && streamItems.length > 0 && (wasAtBottomRef.current || streamingText)) {
      listRef.current.scrollToRow({ 
        index: streamItems.length - 1, 
        align: "end",
        behavior: streamingText ? "instant" : "auto"
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
      aria-label="对话消息流" 
      aria-live="polite"
      style={{ display: "block" }}
    >
      <List
        listRef={listRef}
        style={{ height: containerHeight, width: "100%" }}
        rowComponent={RowComponent as any}
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
