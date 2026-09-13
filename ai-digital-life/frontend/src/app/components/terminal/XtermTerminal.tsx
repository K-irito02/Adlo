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

      // 键盘复制粘贴：经 attachCustomKeyEventHandler 返回 false 让 xterm 跳过按键处理
      // （此时 xterm 既不发数据也不 preventDefault），浏览器原生 copy/paste 事件照常触发，
      // 由 xterm 原生监听完成复制粘贴——全程无剪贴板权限弹窗（禁用程序化 readText 方案）。
      // 复制：有选区时返回 false（避免同时向 PTY 发中断信号），无选区返回 true（保留中断行为）；
      // 带 Shift 的 C 一律 false（Ctrl+Shift+C 本意复制，无选区时吞掉误中断）。
      // 粘贴优先判定：Shift+Insert 一律粘贴（不论 Ctrl 是否按下）；Ctrl/Cmd+V 返回 false——
      // xterm 默认会把 Ctrl+V 当普通按键发给 PTY（显示 ^V）并 preventDefault 掉原生 paste，
      // 必须拦截才放行原生粘贴。
      const customKeyHandler = (event: KeyboardEvent): boolean => {
        const mod = event.ctrlKey || event.metaKey;
        const lowerKey = (event.key ?? '').toLowerCase();
        const isPasteKey = (event.shiftKey && event.key === 'Insert') || (mod && lowerKey === 'v');
        if (isPasteKey) {
          return false;
        }
        const isCopyKey = (mod && lowerKey === 'c') || (mod && event.key === 'Insert');
        if (isCopyKey) {
          if (event.shiftKey) {
            return false;
          }
          return !entry.terminal.hasSelection();
        }
        return true;
      };
      // 注：本版本 xterm 的 attachCustomKeyEventHandler 返回 void（单槽位，后挂载直接覆盖），
      // 无需 dispose；entry 为池化共享实例，逻辑等价，重复挂载无副作用。
      entry.terminal.attachCustomKeyEventHandler(customKeyHandler);

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
