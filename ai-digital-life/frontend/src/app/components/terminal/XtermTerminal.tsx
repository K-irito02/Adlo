import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

export interface XtermTerminalHandle {
  write(data: string): void;
  clear(): void;
  focus(): void;
  getSelection(): string;
}

interface XtermTerminalProps {
  className?: string;
  onData?: (data: string) => void;
}

export const XtermTerminal = forwardRef<XtermTerminalHandle, XtermTerminalProps>(
  function XtermTerminal({ className, onData }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const onDataRef = useRef(onData);
    onDataRef.current = onData;

    useImperativeHandle(ref, () => ({
      write(data: string) {
        terminalRef.current?.write(data);
      },
      clear() {
        terminalRef.current?.clear();
      },
      focus() {
        terminalRef.current?.focus();
      },
      getSelection() {
        return terminalRef.current?.getSelection() ?? "";
      }
    }), []);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const fitAddon = new FitAddon();
      fitAddonRef.current = fitAddon;

      const webLinksAddon = new WebLinksAddon();

      const terminal = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "Cascadia Code, Fira Code, Consolas, monospace",
        theme: {
          background: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#1e1e1e",
          foreground: getComputedStyle(document.documentElement).getPropertyValue("--text-primary").trim() || "#d4d4d4",
          cursor: getComputedStyle(document.documentElement).getPropertyValue("--text-primary").trim() || "#d4d4d4",
          selectionBackground: getComputedStyle(document.documentElement).getPropertyValue("--selection").trim() || "#264f78",
          selectionInactiveBackground: getComputedStyle(document.documentElement).getPropertyValue("--selection").trim() || "#264f78"
        },
        allowProposedApi: true
      });

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinksAddon);
      terminal.open(container);
      fitAddon.fit();

      terminal.onData((data) => {
        onDataRef.current?.(data);
      });

      terminalRef.current = terminal;

      const resizeObserver = new ResizeObserver(() => {
        fitAddonRef.current?.fit();
      });
      resizeObserver.observe(container);

      const themeObserver = new MutationObserver(() => {
        const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#1e1e1e";
        const fg = getComputedStyle(document.documentElement).getPropertyValue("--text-primary").trim() || "#d4d4d4";
        const sel = getComputedStyle(document.documentElement).getPropertyValue("--selection").trim() || "#264f78";
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
        attributeFilter: ["data-theme"],
      });

      return () => {
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
      />
    );
  }
);
