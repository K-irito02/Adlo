import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { terminalXtermPool } from '@features/terminal/terminalXtermPool';
import '@xterm/xterm/css/xterm.css';

export interface XtermTerminalHandle {
  clear(): void;
  getSelection(): string;
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
        getSelection() {
          const entry = entryRef.current;
          return entry?.terminal.getSelection() ?? '';
        },
      }),
      [],
    );

    useEffect(() => {
      const container = containerRef.current;
      if (!sessionId || !container) {
        return;
      }

      const entry = terminalXtermPool.acquire(sessionId, container);
      entryRef.current = entry;

      const disposable = entry.terminal.onData((data) => {
        onDataRef.current?.(data);
      });

      // 自身容器尺寸变化时重新 fit 并把尺寸上报给 PTY。
      // 覆盖：面板缩放、视图模式切换（单列/双列）、分界线拖拽、历史区出现/消失。
      // 去抖 120ms：连续拖拽不会把 ConPTY 打成整屏重绘风暴（ConPTY 每次 resize 都会重发整屏）。
      let resizeTimer: ReturnType<typeof setTimeout> | null = null;
      const observer = new ResizeObserver(() => {
        if (resizeTimer) {
          clearTimeout(resizeTimer);
        }
        resizeTimer = setTimeout(() => {
          resizeTimer = null;
          if (!entry.hostEl.isConnected) {
            return;
          }
          try {
            entry.fitAddon.fit();
          } catch {
            return;
          }
          const dims = entry.fitAddon.proposeDimensions();
          if (dims) {
            onResizeRef.current?.(dims.cols, dims.rows);
          }
        }, 120);
      });
      observer.observe(container);

      return () => {
        if (resizeTimer) {
          clearTimeout(resizeTimer);
        }
        observer.disconnect();
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
