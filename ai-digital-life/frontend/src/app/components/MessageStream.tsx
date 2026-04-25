import React, { useEffect, useRef } from "react";
import { renderIcon, type IconName } from "../../design-system/icons";
import { MessageBubble, type MessageBubbleProps } from "./MessageBubble";

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

function Icon({ name, size = "md" }: { name: IconName; size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" }) {
  return (
    <span dangerouslySetInnerHTML={{ __html: renderIcon(name, { size, decorative: true }).value }} />
  );
}

export function MessageStream({ messages, streamingText = "", isStreaming }: MessageStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUp = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      isUserScrolledUp.current = scrollHeight - scrollTop - clientHeight > 60;
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (isStreaming && !isUserScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [streamingText, isStreaming]);

  useEffect(() => {
    if (!isUserScrolledUp.current && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  if (messages.length === 0 && !streamingText) {
    return (
      <div className="message-stream message-stream--empty" ref={scrollRef}>
        <p className="message-stream__empty-text">
          <Icon name="message-square" size="md" />
          暂无消息
        </p>
        <div ref={bottomRef} />
      </div>
    );
  }

  return (
    <div className="message-stream" ref={scrollRef} role="log" aria-label="对话消息流" aria-live="polite">
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

      <div ref={bottomRef} />
    </div>
  );
}

export default MessageStream;
export type { MessageStreamProps };
