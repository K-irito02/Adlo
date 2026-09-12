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
  createdAt: number;
}

export class TerminalXtermPool {
  private pool = new Map<string, PooledXterm>();

  acquire(sessionId: string, container: HTMLDivElement): PooledXterm {
    const existing = this.pool.get(sessionId);
    if (existing) {
      if (existing.hostEl !== container) {
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
      fontFamily:
        getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() ||
        'Cascadia Code, Fira Code, Consolas, monospace',
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
      createdAt: Date.now(),
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

  fitAll(): void {
    for (const entry of this.pool.values()) {
      try {
        entry.fitAddon.fit();
      } catch {
        // Skip disposed or detached instances
      }
    }
  }

  disposeAll(): void {
    for (const [id] of this.pool) {
      this.release(id);
    }
  }

  syncTheme(): void {
    const theme = readTerminalTheme();
    for (const entry of this.pool.values()) {
      entry.terminal.options.theme = theme;
    }
  }

  get size(): number {
    return this.pool.size;
  }
}

function readTerminalTheme() {
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
