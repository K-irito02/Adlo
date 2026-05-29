import React, { useEffect, useRef } from "react";
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUp = useRef(false);

  // 滚动到视图底部
  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  };

  // 当消息数量变化时滚动到底部
  useEffect(() => {
    if (!isUserScrolledUp.current) {
      scrollToBottom();
    }
  }, [messages.length]);

  // 当流式文本变化时滚动到底部
  useEffect(() => {
    if (isStreaming && !isUserScrolledUp.current) {
      scrollToBottom();
    }
  }, [streamingText, isStreaming]);

  // 处理滚动，判断用户是否向上滚动
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    isUserScrolledUp.current = scrollHeight - scrollTop - clientHeight > 60;
  };

  // 空状态处理
  if (messages.length === 0 && !streamingText) {
    return (
      <div className="message-stream message-stream--empty">
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
      ref={scrollContainerRef}
      role="log" 
      aria-label="对话消息流" 
      aria-live="polite"
      style={{ height: '100%', overflowY: 'auto' }}
      onScroll={handleScroll}
    >
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          id={msg.id}
          role={msg.role}
          content={msg.content}
          timestamp={msg.timestamp}
        />
      ))}
      {isStreaming && streamingText && (
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
      )}
    </div>
  );
}

export default MessageStream;
export type { MessageStreamProps };
