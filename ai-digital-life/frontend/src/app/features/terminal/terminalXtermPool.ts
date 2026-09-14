import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { TERMINAL_CAPTURE_SCROLLBACK_LINES } from './terminalHistoryCollector';

export interface PooledXterm {
  terminal: Terminal;
  fitAddon: FitAddon;
  hostEl: HTMLDivElement;
  sessionId: string;
}

export class TerminalXtermPool {
  private pool = new Map<string, PooledXterm>();

  acquire(sessionId: string, container: HTMLDivElement): PooledXterm {
    // 同一容器只允许挂一个 hostEl。会话 id 变化（重启恢复时旧会话被新会话替换）会让
    // 新 entry 被 append 到同一个容器，若不摘掉旧 entry 就会上下堆叠、互相遮挡。
    // 只从 DOM 摘除（detach），entry 仍保留在池中，切回该会话时可直接复用其 buffer。
    for (const entry of this.pool.values()) {
      if (entry.sessionId !== sessionId && entry.hostEl.parentElement === container) {
        entry.hostEl.remove();
      }
    }

    const existing = this.pool.get(sessionId);
    if (existing) {
      if (existing.hostEl.parentElement !== container) {
        container.appendChild(existing.hostEl);
        try {
          existing.fitAddon.fit();
        } catch {
          // 容器尚未布局（隐藏/零尺寸），消费侧 XtermTerminal 的 ResizeObserver 会重 fit
        }
      }
      return existing;
    }

    const hostEl = document.createElement('div');
    // 内缩一个间距：与只读历史视图同理，绝对定位子元素相对 padding 盒布局，
    // 必须显式内缩才能让终端内容与区域边缘保持 var(--space-2) 间距。
    // 右侧不内缩：xterm 自绘滚动条需贴住区域右边缘（事项 5）。各边距须与容器
    // padding 同值，容器见 terminal-panel.css `.adl-terminal-canvas`（改一边必须改另一边）。
    hostEl.style.cssText =
      'position:absolute;top:var(--space-2, 8px);left:var(--space-2, 8px);right:0;bottom:var(--space-2, 8px);overflow:hidden;';

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: readTerminalFontFamily(),
      theme: readTerminalTheme(),
      allowProposedApi: true,
      // 采集侧 scrollback 提到 5000：否则采集间隙的输出会从环里丢掉，持久化层看不到。
      scrollback: TERMINAL_CAPTURE_SCROLLBACK_LINES,
      scrollSensitivity: 1,
      disableStdin: false,
      cursorStyle: 'bar',
      cursorWidth: 1,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(hostEl);

    container.appendChild(hostEl);

    const entry: PooledXterm = {
      terminal,
      fitAddon,
      hostEl,
      sessionId,
    };
    this.pool.set(sessionId, entry);

    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
      } catch {
        // Container may have been disposed
      }
    });

    return entry;
  }

  release(sessionId: string): void {
    const entry = this.pool.get(sessionId);
    if (!entry) {
      return;
    }

    entry.terminal.dispose();
    entry.hostEl.remove();
    this.pool.delete(sessionId);
  }

  get(sessionId: string): PooledXterm | undefined {
    return this.pool.get(sessionId);
  }

  syncTheme(): void {
    const theme = readTerminalTheme();
    for (const entry of this.pool.values()) {
      entry.terminal.options.theme = theme;
    }
  }
}

export function readTerminalFontFamily(): string {
  return (
    getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() ||
    'Cascadia Code, Fira Code, Consolas, monospace'
  );
}

export function readTerminalTheme() {
  const style = getComputedStyle(document.documentElement);
  return {
    background: style.getPropertyValue('--bg-terminal').trim() || '#0c0c0c',
    foreground: style.getPropertyValue('--text-primary').trim() || '#d4d4d4',
    cursor: style.getPropertyValue('--text-primary').trim() || '#d4d4d4',
    selectionBackground: style.getPropertyValue('--selection').trim() || '#264f78',
    selectionInactiveBackground: style.getPropertyValue('--selection').trim() || '#264f78',
  };
}

/** Singleton pool instance */
export const terminalXtermPool = new TerminalXtermPool();
