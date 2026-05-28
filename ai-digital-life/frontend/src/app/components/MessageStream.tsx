import React, { useEffect, useRef, useState, useCallback } from "react";
import { VariableSizeList as List } from "react-window";
import { MessageBubble, type MessageBubbleProps } from "./MessageBubble";
import { Icon } from "./Icon";

interface MessageStreamProps {
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp?: string;
  }>;
  streamingText?: string;
  isStreaming: boolean;
}

export function MessageStream({ messages, streamingText = "", isStreaming }: MessageStreamProps) {
  const listRef = useRef<List>(null);
  const isUserScrolledUp = useRef(false);
  const [itemHeights, setItemHeights] = useState<Map<number, number>>(new Map());
  const [containerHeight, setContainerHeight] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // 计算总项目数（消息数 + 可能的流式消息）
  const totalItems = messages.length + (isStreaming && streamingText ? 1 : 0);

  // 调整容器大小
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setContainerHeight(entries[0].contentRect.height);
      }
    });
    
    observer.observe(containerRef.current);
    resizeObserverRef.current = observer;
    
    return () => observer.disconnect();
  }, []);

  // 获取项目高度
  const getItemSize = useCallback(
    (index: number) => {
      return itemHeights.get(index) || 150; // 默认高度
    },
    [itemHeights]
  );

  // 测量项目高度
  const measureItem = useCallback(
    (index: number, height: number) => {
      setItemHeights((prev) => {
        const newMap = new Map(prev);
        newMap.set(index, height);
        return newMap;
      });
    },
    []
  );

  // 滚动到视图底部
  const scrollToBottom = useCallback(() => {
    if (listRef.current && totalItems > 0) {
      listRef.current.scrollToItem(totalItems - 1, "end");
    }
  }, [totalItems]);

  // 当消息数量变化时滚动到底部
  useEffect(() => {
    if (!isUserScrolledUp.current) {
      scrollToBottom();
    }
  }, [messages.length, scrollToBottom]);

  // 当流式文本变化时滚动到底部
  useEffect(() => {
    if (isStreaming && !isUserScrolledUp.current) {
      scrollToBottom();
    }
  }, [streamingText, isStreaming, scrollToBottom]);

  // 处理滚动，判断用户是否向上滚动
  const handleScroll = useCallback(({ scrollOffset, scrollUpdateWasRequested, scrollHeight, clientHeight }) => {
    isUserScrolledUp.current = scrollHeight - scrollOffset - clientHeight > 60 && !scrollUpdateWasRequested;
  }, []);

  // 渲染单个项目
  const RenderItem = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const measureRef = useRef<HTMLDivElement>(null);
      
      useEffect(() => {
        if (measureRef.current) {
          const height = measureRef.current.getBoundingClientRect().height;
          if (itemHeights.get(index) !== height) {
            measureItem(index, height);
            // 通知 react-window 高度已更改
            listRef.current?.resetAfterIndex(index);
          }
        }
      }, [index, measureItem, itemHeights, messages, streamingText]);

      if (index < messages.length) {
        const msg = messages[index];
        return (
          <div style={style} ref={measureRef}>
            <MessageBubble
              key={msg.id}
              id={msg.id}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
            />
          </div>
        );
      } else if (isStreaming && streamingText) {
        return (
          <div style={style} ref={measureRef}>
            <article
              className="message-bubble message-bubble--assistant message-bubble--streaming"
              aria-label="正在生成回复"
            >
              <div className="message-bubble__avatar">
                <span className="message-bubble__avatar-icon message-bubble__avatar-icon--assistant">
                  <Icon name="sparkles" size="sm" />
                </span>
              </div>
              <div className="message-bubble__body">
                <header className="message-bubble__header">
                  <span className="message-bubble__role">AI 助手</span>
                  <span className="message-bubble__streaming-indicator">正在输入</span>
                </header>
                <div className="message-bubble__content">
                  {streamingText}
                  <span className="message-bubble__cursor" aria-hidden="true" />
                </div>
              </div>
            </article>
          </div>
        );
      }
      return null;
    },
    [messages, isStreaming, streamingText, measureItem, itemHeights]
  );

  // 空状态处理
  if (messages.length === 0 && !streamingText) {
    return (
      <div className="message-stream message-stream--empty" ref={containerRef}>
        <p className="message-stream__empty-text">
          <Icon name="message-square" size="md" />
          暂无消息
        </p>
      </div>
    );
  }

  return (
    <div 
      className="message-stream" 
      ref={containerRef} 
      role="log" 
      aria-label="对话消息流" 
      aria-live="polite"
      style={{ height: '100%', overflow: 'hidden' }}
    >
      <List
        ref={listRef}
        height={containerHeight}
        itemCount={totalItems}
        itemSize={getItemSize}
        width="100%"
        onScroll={handleScroll}
        style={{ overflowY: 'auto' }}
      >
        {RenderItem}
      </List>
    </div>
  );
}

export default MessageStream;
export type { MessageStreamProps };
