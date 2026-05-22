import React, { useCallback, useMemo, useState } from "react";
import { TooltipSimple } from "./Tooltip";
import { Icon } from "./Icon";

interface MessageBubbleProps {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

const EDIT_WINDOW_MS = 120_000;

export function MessageBubble({ id, role, content, timestamp }: MessageBubbleProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  const canEdit = useMemo(() => {
    if (role !== "user" || !timestamp) return false;
    const messageTime = new Date(timestamp).getTime();
    const now = Date.now();
    return now - messageTime < EDIT_WINDOW_MS;
  }, [role, timestamp]);

  const formattedTime = useMemo(() => {
    if (!timestamp) return "";
    try {
      return new Date(timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return "";
    }
  }, [timestamp]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard API unavailable */
    }
  }, [content]);

  const isUser = role === "user";

  return (
    <article
      className={`message-bubble message-bubble--${role}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-message-id={id}
      role="article"
      aria-label={`${role} message`}
    >
      <div className="message-bubble__avatar">
        {isUser ? (
          <span className="message-bubble__avatar-icon message-bubble__avatar-icon--user">
            <Icon name="at-sign" size="sm" />
          </span>
        ) : (
          <span className="message-bubble__avatar-icon message-bubble__avatar-icon--assistant">
            <Icon name="sparkles" size="sm" />
          </span>
        )}
      </div>

      <div className="message-bubble__body">
        {!isUser && (
          <header className="message-bubble__header">
            <span className="message-bubble__role">AI 助手</span>
          </header>
        )}

        <div className="message-bubble__content">{content}</div>

        {formattedTime && (
          <TooltipSimple content={timestamp} placement="top">
            <time
              className="message-bubble__timestamp"
              dateTime={timestamp}
            >
              {formattedTime}
            </time>
          </TooltipSimple>
        )}

        {isHovered && (
          <div className="message-bubble__actions" role="toolbar" aria-label="消息操作">
            <TooltipSimple content={copied ? "已复制" : "复制"} placement="top">
              <button
                type="button"
                className="message-bubble__action-btn"
                onClick={handleCopy}
                aria-label={copied ? "已复制到剪贴板" : "复制消息内容"}
              >
                {copied ? (
                  <Icon name="check" size="xs" />
                ) : (
                  <Icon name="copy" size="xs" />
                )}
              </button>
            </TooltipSimple>

            {!isUser && (
              <TooltipSimple content="重新生成" placement="top">
                <button
                  type="button"
                  className="message-bubble__action-btn"
                  aria-label="重新生成此回复"
                >
                  <Icon name="refresh" size="xs" />
                </button>
              </TooltipSimple>
            )}

            {canEdit && (
              <TooltipSimple content="编辑消息" placement="top">
                <button
                  type="button"
                  className="message-bubble__action-btn"
                  aria-label="编辑此消息"
                >
                  <Icon name="pencil" size="xs" />
                </button>
              </TooltipSimple>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export default MessageBubble;
export type { MessageBubbleProps };
