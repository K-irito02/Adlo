import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { terminalXtermPool } from '@features/terminal/terminalXtermPool';
import '@xterm/xterm/css/xterm.css';

export interface XtermTerminalHandle {
  write(data: string): void;
  clear(): void;
  focus(): void;
  getSelection(): string;
  /** 读取当前建议尺寸（只测量，不 fit、不触发重排），供创建 PTY 时对齐真实尺寸 */
  getDims(): { cols: number; rows: number } | null;
  resize(): void;
  /** 仅把当前尺寸上报给 PTY，不做 fit（不会触发整屏重排） */
  reportSize(): void;
  scrollToBottom(): void;
}

interface XtermTerminalProps {
  sessionId: string | null;
  className?: string;
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
}

export const XtermTerminal = forwardRef<XtermTerminalHandle, XtermTerminalProps>(
  function XtermTerminal({ sessionId, className, onData, onResize }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const onDataRef = useRef(onData);
    const onResizeRef = useRef(onResize);
    onDataRef.current = onData;
    onResizeRef.current = onResize;

    const entryRef = useRef(terminalXtermPool.get(sessionId ?? ''));

    useImperativeHandle(
      ref,
      () => ({
        write(data: string) {
          const entry = entryRef.current;
          if (!entry) {
            return;
          }
          const sanitized = data.replace(/\x7f/g, '');
          entry.terminal.write(sanitized);
          setTimeout(() => {
            entry.terminal.scrollToBottom();
          }, 0);
        },
        clear() {
          const entry = entryRef.current;
          if (!entry) {
            return;
          }
          entry.terminal.clear();
          setTimeout(() => {
            entry.terminal.scrollToBottom();
          }, 0);
        },
        focus() {
          const entry = entryRef.current;
          if (entry) {
            entry.terminal.focus();
          }
        },
        getSelection() {
          const entry = entryRef.current;
          return entry?.terminal.getSelection() ?? '';
        },
        getDims() {
          const entry = entryRef.current;
          if (!entry) {
            return null;
          }
          const proposed = entry.fitAddon.proposeDimensions();
          if (proposed && proposed.cols > 0 && proposed.rows > 0) {
            return { cols: proposed.cols, rows: proposed.rows };
          }
          return { cols: entry.terminal.cols, rows: entry.terminal.rows };
        },
        resize() {
          const entry = entryRef.current;
          if (!entry) {
            return;
          }
          entry.fitAddon.fit();
          const dims = entry.fitAddon.proposeDimensions();
          if (dims) {
            onResizeRef.current?.(dims.cols, dims.rows);
          }
          setTimeout(() => {
            entry.terminal.scrollToBottom();
          }, 0);
        },
        reportSize() {
          const entry = entryRef.current;
          if (!entry) {
            return;
          }
          const dims = entry.fitAddon.proposeDimensions();
          if (dims) {
            onResizeRef.current?.(dims.cols, dims.rows);
          }
        },
        scrollToBottom() {
          const entry = entryRef.current;
          if (entry) {
            entry.terminal.scrollToBottom();
          }
        },
      }),
      [],
    );

    useEffect(() => {
      if (!sessionId || !containerRef.current) {
        return;
      }

      const entry = terminalXtermPool.acquire(sessionId, containerRef.current);
      entryRef.current = entry;

      const disposable = entry.terminal.onData((data) => {
        onDataRef.current?.(data);
      });

      return () => {
        disposable.dispose();
        // 不释放 pool entry — 保留 xterm 实例和 buffer，切换标签时不丢失内容。
        // pool entry 仅在标签关闭时由 handleCloseTab 释放。
        entryRef.current = undefined;
      };
    }, [sessionId]);

    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          position: 'relative',
          overflow: 'hidden',
          width: '100%',
          height: '100%',
        }}
      />
    );
  },
);
