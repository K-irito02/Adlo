import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
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
  /** 恢复历史期间隐藏画面，避免用户看到「回放 → 清屏 → banner」的中间态 */
  setHidden(hidden: boolean): void;
  scrollToBottom(): void;
}

interface XtermTerminalProps {
  className?: string;
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
}

export const XtermTerminal = forwardRef<XtermTerminalHandle, XtermTerminalProps>(
  function XtermTerminal({ className, onData, onResize }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const onDataRef = useRef(onData);
    const onResizeRef = useRef(onResize);
    const isFirstWriteRef = useRef(true);
    onDataRef.current = onData;
    onResizeRef.current = onResize;

    useImperativeHandle(
      ref,
      () => ({
        write(data: string) {
          const sanitized = data.replace(/\x7f/g, '');
          const terminal = terminalRef.current;
          if (terminal) {
            terminal.write(sanitized);
            setTimeout(() => {
              terminal.scrollToBottom();
            }, 0);
            if (isFirstWriteRef.current) {
              isFirstWriteRef.current = false;
            }
          }
        },
        clear() {
          const terminal = terminalRef.current;
          if (terminal) {
            terminal.clear();
            setTimeout(() => {
              terminal.scrollToBottom();
            }, 0);
          }
        },
        focus() {
          const terminal = terminalRef.current;
          if (terminal) {
            terminal.focus();
          }
        },
        getSelection() {
          const terminal = terminalRef.current;
          return terminal?.getSelection() ?? '';
        },
        getDims() {
          const addon = fitAddonRef.current;
          const terminal = terminalRef.current;
          if (!addon || !terminal) {
            return null;
          }
          // proposeDimensions 只按容器实测尺寸计算，不会应用 fit、不会触发重排；
          // 测量失败（容器尚未布局）时回退到 xterm 当前 dims。
          const proposed = addon.proposeDimensions();
          if (proposed && proposed.cols > 0 && proposed.rows > 0) {
            return { cols: proposed.cols, rows: proposed.rows };
          }
          return { cols: terminal.cols, rows: terminal.rows };
        },
        resize() {
          const addon = fitAddonRef.current;
          const terminal = terminalRef.current;
          if (addon && terminal) {
            const before = `${terminal.cols}x${terminal.rows}`;
            addon.fit();
            const dims = addon.proposeDimensions();
            console.log(
              `[ADL-DEBUG] xterm fit(resize) — ${before} → ${dims ? `${dims.cols}x${dims.rows}` : 'n/a'} t=${Math.round(performance.now())}`,
            );
            if (dims) {
              onResizeRef.current?.(dims.cols, dims.rows);
            }
            setTimeout(() => {
              terminal.scrollToBottom();
            }, 0);
          }
        },
        reportSize() {
          // 只上报尺寸、不 fit：fit 在尺寸变化时会按新宽度重排整个缓冲，
          // 若发生在历史回放之后，用户就会看到「历史瞬间跳动上移」。
          const dims = fitAddonRef.current?.proposeDimensions();
          if (dims) {
            console.log(
              `[ADL-DEBUG] xterm reportSize(no fit) — ${dims.cols}x${dims.rows} t=${Math.round(performance.now())}`,
            );
            onResizeRef.current?.(dims.cols, dims.rows);
          }
        },
        setHidden(hidden: boolean) {
          const el = containerRef.current;
          if (el) {
            el.style.visibility = hidden ? 'hidden' : 'visible';
            console.log(
              `[ADL-DEBUG] xterm visibility — hidden=${hidden} t=${Math.round(performance.now())}`,
            );
          }
        },
        scrollToBottom() {
          const terminal = terminalRef.current;
          if (terminal) {
            terminal.scrollToBottom();
          }
        },
      }),
      [],
    );

    useEffect(() => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const fitAddon = new FitAddon();
      fitAddonRef.current = fitAddon;

      const webLinksAddon = new WebLinksAddon();

      const terminal = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily:
          getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() ||
          'Cascadia Code, Fira Code, Consolas, monospace',
        theme: {
          background:
            getComputedStyle(document.documentElement).getPropertyValue('--bg-terminal').trim() ||
            '#0c0c0c',
          foreground:
            getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() ||
            '#d4d4d4',
          cursor:
            getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() ||
            '#d4d4d4',
          selectionBackground:
            getComputedStyle(document.documentElement).getPropertyValue('--selection').trim() ||
            '#264f78',
          selectionInactiveBackground:
            getComputedStyle(document.documentElement).getPropertyValue('--selection').trim() ||
            '#264f78',
        },
        allowProposedApi: true,
        scrollback: 1000,
        scrollSensitivity: 1,
        disableStdin: false,
        cursorStyle: 'bar',
        cursorWidth: 1,
      });

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinksAddon);
      terminal.open(container);

      const initialFit = () => {
        try {
          fitAddon.fit();
          const dims = fitAddon.proposeDimensions();
          if (dims) {
            onResizeRef.current?.(dims.cols, dims.rows);
          }
        } catch (e) {
          console.warn('XtermTerminal initialFit failed:', e);
        }
      };

      setTimeout(initialFit, 0);

      terminal.onData((data) => {
        onDataRef.current?.(data);
      });

      terminal.onWriteParsed(() => {
        const term = terminalRef.current;
        if (term) {
          term.scrollToBottom();
        }
      });

      terminalRef.current = terminal;

      let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

      const handleResize = () => {
        if (resizeTimeout) {
          clearTimeout(resizeTimeout);
        }
        resizeTimeout = setTimeout(() => {
          try {
            const addon = fitAddonRef.current;
            const term = terminalRef.current;
            if (addon && term) {
              const before = `${term.cols}x${term.rows}`;
              addon.fit();
              const dims = addon.proposeDimensions();
              console.log(
                `[ADL-DEBUG] xterm fit(resizeObserver) — ${before} → ${dims ? `${dims.cols}x${dims.rows}` : 'n/a'} t=${Math.round(performance.now())}`,
              );
              if (dims) {
                onResizeRef.current?.(dims.cols, dims.rows);
              }
            }
          } catch {
            // resize failed during layout/unmount — non-fatal
            console.warn('XtermTerminal resize fit failed');
          }
        }, 100);
      };

      const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            handleResize();
          }
        }
      });
      resizeObserver.observe(container);

      const themeObserver = new MutationObserver(() => {
        const bg =
          getComputedStyle(document.documentElement).getPropertyValue('--bg-terminal').trim() ||
          '#0c0c0c';
        const fg =
          getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() ||
          '#d4d4d4';
        const sel =
          getComputedStyle(document.documentElement).getPropertyValue('--selection').trim() ||
          '#264f78';
        terminal.options.theme = {
          background: bg,
          foreground: fg,
          cursor: fg,
          selectionBackground: sel,
          selectionInactiveBackground: sel,
        };
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
      });

      return () => {
        if (resizeTimeout) {
          clearTimeout(resizeTimeout);
        }
        themeObserver.disconnect();
        resizeObserver.disconnect();
        terminal.dispose();
        terminalRef.current = null;
        fitAddonRef.current = null;
      };
    }, []);

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
