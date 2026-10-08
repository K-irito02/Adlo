import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useAppStore } from '@stores/slicedStore';
import { clampTerminalFontSize } from '@stores/slices/terminalSliceTypes';

/** 当前生效字号：store 值经统一钳制（与写侧/读侧同口径）。 */
export function readTerminalFontSize(): number {
  return clampTerminalFontSize(useAppStore.getState().terminalFontSize);
}

/** 实时终端回滚缓冲行数。 */
const TERMINAL_SCROLLBACK_LINES = 5000;

export interface PooledXterm {
  terminal: Terminal;
  fitAddon: FitAddon;
  hostEl: HTMLDivElement;
  sessionId: string;
}

export class TerminalXtermPool {
  private pool = new Map<string, PooledXterm>();
  /**
   * 会话出生尺寸（PTY 创建时刻的实测列/行）：acquire 建实例时同步套用，
   * 保证池几何与 PTY 几何从出生就一致。shell 按 PTY 尺寸排版输出，
   * 采集读池 buffer —— 两边任一时刻不一致，落盘的就是被重排版的错行
   * （曾实测 PTY 226 列而池 25 列，`ls` 被拦腰截断 baked 进历史）。
   * 无记录时（老会话/测试）跳过，沿用原 rAF fit 路径。
   */
  private birthDims = new Map<string, { cols: number; rows: number }>();

  /**
   * 记录会话出生尺寸（PTY 创建后、XtermTerminal 挂载前调用，挂载时 acquire 消费）。
   * 若该会话的实例已存在（挂载早于 PTY 创建），直接套用到例上，不写待消费表
   * —— 否则该 key 永远不会被消费，只能等 release 才清理。
   */
  setBirthDims(sessionId: string, cols: number, rows: number): void {
    if (cols <= 0 || rows <= 0) {
      return;
    }
    const existing = this.pool.get(sessionId);
    if (existing) {
      // 实例先于本次 PTY 创建而存在（仅当 sessionId 被复用才会发生，属未来防御）：
      // 直接套用出生尺寸以保证池与 PTY 同几何，不写真源给「待消费表」白留一份。
      try {
        existing.terminal.resize(cols, rows);
      } catch {
        // 尺寸非法：留给既有 fit 链路纠正
      }
      return;
    }
    this.birthDims.set(sessionId, { cols, rows });
  }

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
    // 内缩一个间距：绝对定位子元素相对 padding 盒布局，
    // 必须显式内缩才能让终端内容与区域边缘保持 var(--space-2) 间距。
    // 右侧不内缩：xterm 自绘滚动条需贴住区域右边缘（事项 5）。各边距须与容器
    // padding 同值，容器见 terminal-panel.css `.adl-terminal-canvas`（改一边必须改另一边）。
    hostEl.style.cssText =
      'position:absolute;top:var(--space-2, 8px);left:var(--space-2, 8px);right:0;bottom:var(--space-2, 8px);overflow:hidden;';

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: readTerminalFontSize(),
      fontFamily: readTerminalFontFamily(),
      theme: readTerminalTheme(),
      allowProposedApi: true,
      scrollback: TERMINAL_SCROLLBACK_LINES,
      scrollSensitivity: 1,
      disableStdin: false,
      cursorStyle: 'bar',
      cursorWidth: 1,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(hostEl);

    // 出生尺寸同步套用（见 setBirthDims）：新建实例默认 80×24，
    // 若容器此时尚未布局，rAF fit 会量出极小值并粘住；
    // 先按 PTY 出生尺寸立住，再让 fit 按实际容器精调。
    const birth = this.birthDims.get(sessionId);
    if (birth) {
      try {
        terminal.resize(birth.cols, birth.rows);
      } catch {
        // 尺寸非法时退回 fit 路径
      }
      // 消费即删：会话出生尺寸只用于首次建实例，留着只会随会话数累积
      // （未挂载就被关闭的会话由 release 清理）。
      this.birthDims.delete(sessionId);
    }

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
      this.birthDims.delete(sessionId);
      return;
    }

    entry.terminal.dispose();
    entry.hostEl.remove();
    this.pool.delete(sessionId);
    this.birthDims.delete(sessionId);
  }

  get(sessionId: string): PooledXterm | undefined {
    return this.pool.get(sessionId);
  }

  /**
   * 全量套用新字号（菜单增大/减小字号）：逐实例设值 + 重 fit 上报由各
   * XtermTerminal 的 ResizeObserver/fit 链路自然收敛，此处直接 fit 保证即时生效。
   * 入口即钳制取整，与读侧 `readTerminalFontSize` 同口径（非法回退默认）。
   */
  setFontSize(size: number): void {
    const effective = clampTerminalFontSize(size);
    for (const entry of this.pool.values()) {
      // 赋值在 try 之外：options 写入失败是真缺陷，应直接抛出而不是吞掉；
      // 只有 fit()（隐藏容器量不到尺寸）是预期内失败，才静默并交由挂载侧
      // ResizeObserver 在可见时重 fit。
      entry.terminal.options.fontSize = effective;
      try {
        entry.fitAddon.fit();
      } catch {
        // 容器未布局：挂载侧 ResizeObserver 会重 fit
      }
    }
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
