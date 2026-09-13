import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SerializeAddon } from '@xterm/addon-serialize';

export interface PooledXterm {
  terminal: Terminal;
  fitAddon: FitAddon;
  serializeAddon: SerializeAddon;
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
        existing.fitAddon.fit();
      }
      return existing;
    }

    const hostEl = document.createElement('div');
    hostEl.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;';

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: readTerminalFontFamily(),
      theme: readTerminalTheme(),
      allowProposedApi: true,
      scrollback: 1000,
      scrollSensitivity: 1,
      disableStdin: false,
      cursorStyle: 'bar',
      cursorWidth: 1,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    const serializeAddon = new SerializeAddon();
    terminal.loadAddon(serializeAddon);
    terminal.open(hostEl);

    container.appendChild(hostEl);

    const entry: PooledXterm = {
      terminal,
      fitAddon,
      serializeAddon,
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
