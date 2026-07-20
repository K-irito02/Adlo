import React, { useCallback, useEffect, useState } from 'react';
import { IconCollapseRows, IconExpandRows, IconPlus } from '../../icons';
import { TooltipSimple } from '../../components/Tooltip';
import { useTCopy } from '../../i18n/useTCopy';
import {
  readConversationPanelHeight,
  writeConversationPanelHeight,
  clampConversationPanelHeight,
} from './ResizeHandle.utils';
import { ConversationResizeHandle } from './ResizeHandle';

const MIN_CONVERSATION_PANEL_HEIGHT = 120;
const MAX_CONVERSATION_PANEL_HEIGHT = 9_999;

interface ConversationPanelProps {
  onCreateSession: () => void;
  leftbarContentRef: React.RefObject<HTMLDivElement | null>;
  workspaceToolbarRef: React.RefObject<HTMLDivElement | null>;
  children?: React.ReactNode;
}

export function ConversationPanel({
  onCreateSession,
  leftbarContentRef,
  workspaceToolbarRef,
  children,
}: ConversationPanelProps) {
  const { t } = useTCopy();
  const [conversationsCollapsed, setConversationsCollapsed] = useState(false);
  const [conversationPanelHeight, setConversationPanelHeight] = useState<number>(() =>
    readConversationPanelHeight(),
  );

  const getConversationPanelMaxHeight = useCallback(() => {
    const contentRect = leftbarContentRef.current?.getBoundingClientRect();
    const workspaceToolbarRect = workspaceToolbarRef.current?.getBoundingClientRect();
    if (!contentRect || !workspaceToolbarRect) {
      return MAX_CONVERSATION_PANEL_HEIGHT;
    }
    return Math.max(
      MIN_CONVERSATION_PANEL_HEIGHT,
      Math.floor(contentRect.bottom - workspaceToolbarRect.bottom),
    );
  }, [leftbarContentRef, workspaceToolbarRef]);

  useEffect(() => {
    const syncConversationPanelHeight = () => {
      const maxHeight = getConversationPanelMaxHeight();
      setConversationPanelHeight((current) => {
        const nextHeight = clampConversationPanelHeight(current, maxHeight);
        if (nextHeight !== current) {
          writeConversationPanelHeight(nextHeight);
        }
        return nextHeight;
      });
    };

    syncConversationPanelHeight();
    window.addEventListener('resize', syncConversationPanelHeight);
    return () => window.removeEventListener('resize', syncConversationPanelHeight);
  }, [getConversationPanelMaxHeight]);

  const handleHeightChange = useCallback((nextHeight: number) => {
    setConversationPanelHeight(nextHeight);
    writeConversationPanelHeight(nextHeight);
  }, []);

  return (
    <section
      className={`adl-leftbar__nav adl-leftbar__nav--conversations${conversationsCollapsed ? ' is-collapsed' : ''}`}
      aria-label={t.conversations}
      style={
        { '--leftbar-conversation-height': `${conversationPanelHeight}px` } as React.CSSProperties
      }
    >
      <ConversationResizeHandle
        conversationPanelHeight={conversationPanelHeight}
        onHeightChange={handleHeightChange}
        getMaxHeight={getConversationPanelMaxHeight}
      />
      <div className="adl-workspace-toolbar adl-workspace-toolbar--conversation">
        <div className="adl-section-toolbar__title">
          <span className="adl-section-toolbar__label">{t.conversations}</span>
          <TooltipSimple
            content={conversationsCollapsed ? t.expand : t.collapseSessions}
            placement="right"
          >
            <button
              type="button"
              className="adl-icon-btn adl-icon-btn--xs"
              onClick={() => setConversationsCollapsed((current) => !current)}
              aria-label={conversationsCollapsed ? t.expand : t.collapseSessions}
            >
              {conversationsCollapsed ? (
                <IconExpandRows size={14} decorative />
              ) : (
                <IconCollapseRows size={14} decorative />
              )}
            </button>
          </TooltipSimple>
        </div>
        <TooltipSimple content={t.newConversation} placement="right">
          <button
            type="button"
            className="adl-icon-btn adl-icon-btn--xs"
            aria-label={t.newConversation}
            onClick={onCreateSession}
          >
            <IconPlus size={14} decorative />
          </button>
        </TooltipSimple>
      </div>
      {!conversationsCollapsed ? (
        <div className="adl-leftbar__conversation-body">{children}</div>
      ) : null}
    </section>
  );
}
