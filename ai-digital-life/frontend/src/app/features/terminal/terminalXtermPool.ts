import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { TERMINAL_CAPTURE_SCROLLBACK_LINES } from './terminalHistoryCollector';
import type { HistoryPalette } from './historyModel';

/** cell 度量兜底：无实时终端实例可读时（历史区独立存在）用固定默认值 */
const FALLBACK_CELL_WIDTH = 8;
const FALLBACK_CELL_HEIGHT = 17;

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

/**
 * xterm 默认 16 色（Tango 色板）：历史区与实时终端共用同一套调色板。
 * 取值逐字抄自所装 `@xterm/xterm` 的 `DEFAULT_ANSI_COLORS`
 * （node_modules/@xterm/xterm/lib/xterm.js），不是 VGA 标准色
 * （旧值 `#0000ee` 等与实时终端实际渲染的 `#3465a4` 对不上，就是颜色不一致的根因）。
 * 主题未给出 fg/bg 时才退到纯黑底白字；ANSI 本身跟主题无关，
 * 与实时终端（theme 未配 ansi 色 → xterm 回退同一套 Tango）天然一致。
 */
export const HISTORY_ANSI_DEFAULTS: readonly string[] = Object.freeze([
  '#2e3436',
  '#cc0000',
  '#4e9a06',
  '#c4a000',
  '#3465a4',
  '#75507b',
  '#06989a',
  '#d3d7cf',
  '#555753',
  '#ef2929',
  '#8ae234',
  '#fce94f',
  '#729fcf',
  '#ad7fa8',
  '#34e2e2',
  '#eeeeec',
]);

let cachedHistoryPalette: HistoryPalette | null = null;
let cachedHistoryPaletteSig = '';

/**
 * 从实时终端主题读取配色 → 历史与实时共用同一套调色板。
 * 用模块级缓存保证「同一主题下返回同一个对象引用」，这样下游
 * `TerminalHistoryRow`（React.memo）收到的 `palette` 在普通重渲染中保持稳定、
 * memo 真正生效；仅当主题 fg/bg 变化时返回新对象触发重着色。
 */
export function readTerminalPalette(): HistoryPalette {
  const theme = readTerminalTheme();
  const foreground = theme.foreground || '#ffffff';
  const background = theme.background || '#000000';
  const sig = `${background}|${foreground}`;
  if (cachedHistoryPalette && cachedHistoryPaletteSig === sig) {
    return cachedHistoryPalette;
  }
  const palette: HistoryPalette = { foreground, background, ansi: HISTORY_ANSI_DEFAULTS };
  cachedHistoryPalette = palette;
  cachedHistoryPaletteSig = sig;
  return palette;
}

/**
 * 从实时终端 DOM 实测 cell 宽高：历史行高必须与实时终端完全一致，否则两侧对不齐。
 * 池没有 `first()` 访问器（不该为这一个度量暴露宽泛入口），这里由调用方带上
 * 它关心的 sessionId；sessionId 为空或对应实例 / `.xterm-screen` 缺失时退回固定默认值。
 */
export function readTerminalCellMetrics(sessionId: string | null): {
  cellWidth: number;
  cellHeight: number;
} {
  if (sessionId === null) {
    return { cellWidth: FALLBACK_CELL_WIDTH, cellHeight: FALLBACK_CELL_HEIGHT };
  }
  const entry = terminalXtermPool.get(sessionId);
  const screen = entry?.hostEl.querySelector('.xterm-screen') as HTMLElement | null;
  if (!screen || !entry) {
    return { cellWidth: FALLBACK_CELL_WIDTH, cellHeight: FALLBACK_CELL_HEIGHT };
  }
  return {
    cellWidth: screen.offsetWidth / Math.max(1, entry.terminal.cols),
    cellHeight: screen.offsetHeight / Math.max(1, entry.terminal.rows),
  };
}
