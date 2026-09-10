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
  resize(): void;
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
        resize() {
          const addon = fitAddonRef.current;
          const terminal = terminalRef.current;
          if (addon && terminal) {
            addon.fit();
            const dims = addon.proposeDimensions();
            if (dims) {
              onResizeRef.current?.(dims.cols, dims.rows);
            }
            setTimeout(() => {
              terminal.scrollToBottom();
            }, 0);
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
            getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#1e1e1e',
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
              addon.fit();
              const dims = addon.proposeDimensions();
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
          getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#1e1e1e';
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
