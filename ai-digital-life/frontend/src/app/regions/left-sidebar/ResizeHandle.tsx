import React, { useCallback, useEffect, useRef } from 'react';
import { writeConversationPanelHeight, clampConversationPanelHeight } from './ResizeHandle.utils';
import { useTCopy } from '../../i18n/useTCopy';

export function ResizeHandle() {
  const { t } = useTCopy();
  const draggingRef = useRef(false);
  const rafRef = useRef(0);
  const cleanupDragRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (cleanupDragRef.current) {
        cleanupDragRef.current();
        cleanupDragRef.current = null;
      }
    };
  }, []);

  const handleResizeMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const shellBody = document.querySelector('.adl-shell__body');
    if (!shellBody) {
      return;
    }
    draggingRef.current = true;
    shellBody.classList.add('is-resizing');
    const startX = event.clientX;
    const root = document.documentElement;
    const startWidth =
      parseFloat(getComputedStyle(root).getPropertyValue('--leftbar-width')) || 180;
    const minWidth =
      parseFloat(getComputedStyle(root).getPropertyValue('--leftbar-width-min')) || 180;
    const maxWidth =
      parseFloat(getComputedStyle(root).getPropertyValue('--leftbar-width-max')) || 360;
    const centerMinWidth =
      parseFloat(getComputedStyle(root).getPropertyValue('--center-width-min')) || 640;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!draggingRef.current || rafRef.current) {
        return;
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const delta = moveEvent.clientX - startX;
        const rightWidth = shellBody.classList.contains('is-right-collapsed')
          ? 0
          : parseFloat(getComputedStyle(shellBody).getPropertyValue('--rightpanel-width')) || 0;
        const shellWidth = shellBody.getBoundingClientRect().width;
        const allowedMax = Math.max(minWidth, shellWidth - rightWidth - centerMinWidth);
        const newWidth = Math.min(
          Math.min(maxWidth, allowedMax),
          Math.max(minWidth, startWidth + delta)
        );
        root.style.setProperty('--leftbar-width', `${newWidth}px`);
      });
    };

    const cleanup = () => {
      draggingRef.current = false;
      shellBody.classList.remove('is-resizing');
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onBlur);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      cleanupDragRef.current = null;
    };

    const onBlur = () => cleanup();
    const onMouseUp = () => cleanup();

    cleanupDragRef.current = cleanup;
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onBlur);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  return (
    <div
      className="adl-leftbar__resize-handle"
      onMouseDown={handleResizeMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label={t.resizeSidebar}
    />
  );
}

interface ConversationResizeHandleProps {
  conversationPanelHeight: number;
  onHeightChange: (height: number) => void;
  getMaxHeight: () => number;
}

export function ConversationResizeHandle({
  conversationPanelHeight,
  onHeightChange,
  getMaxHeight,
}: ConversationResizeHandleProps) {
  const { t } = useTCopy();
  const conversationResizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (conversationResizeCleanupRef.current) {
        conversationResizeCleanupRef.current();
        conversationResizeCleanupRef.current = null;
      }
    };
  }, []);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const shellBody = document.querySelector('.adl-shell__body');
      if (!shellBody) {
        return;
      }
      shellBody.classList.add('is-resizing');
      const startY = event.clientY;
      const startHeight = conversationPanelHeight;
      const maxHeight = getMaxHeight();
      let rafId = 0;

      const onMouseMove = (moveEvent: MouseEvent) => {
        if ((moveEvent.buttons & 1) === 0) {
          cleanup();
          return;
        }
        if (rafId) {
          return;
        }
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          const delta = startY - moveEvent.clientY;
          const nextHeight = clampConversationPanelHeight(startHeight + delta, maxHeight);
          onHeightChange(nextHeight);
          writeConversationPanelHeight(nextHeight);
        });
      };

      const cleanup = () => {
        shellBody.classList.remove('is-resizing');
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('blur', onBlur);
        window.removeEventListener('mouseleave', onBlur);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        conversationResizeCleanupRef.current = null;
      };

      const onMouseUp = () => cleanup();
      const onBlur = () => cleanup();

      conversationResizeCleanupRef.current = cleanup;
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('blur', onBlur);
      window.addEventListener('mouseleave', onBlur);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    },
    [conversationPanelHeight, getMaxHeight, onHeightChange]
  );

  return (
    <div
      className="adl-leftbar__conversation-resize"
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="horizontal"
      aria-label={t.resizeConversation}
    />
  );
}
