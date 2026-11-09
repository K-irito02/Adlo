import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useAppStore } from '@stores/slicedStore';
import { clampTerminalFontSize } from '@stores/slices/terminalSliceTypes';
import { shouldFitTerminal } from './terminalFitGuard';

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

  /** 复用式尺寸测量终端：首次建实例，之后只改宿主尺寸再 fit，避免每次建 PTY
   * 都构造/销毁一整个 xterm（见 `measureDimensions`）。 */
  private measureEntry: {
    terminal: Terminal;
    fitAddon: FitAddon;
    hostEl: HTMLDivElement;
    fontSize: number;
    fontFamily: string;
  } | null = null;

  /** 池条目尚未建立时的输出缓冲：shell 首次提示符可能早于 xterm 挂载，先暂存，
   * acquire 时一次性写入，避免丢首屏输出。上限防止异常会话无限增长。 */
  private pendingOutput = new Map<string, string>();
  private static MAX_PENDING_OUTPUT = 256 * 1024;

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

  /**
   * 按目标容器尺寸测量终端列/行，供 PTY 出生尺寸使用。
   *
   * 复用同一个离屏终端：首次调用才构造 xterm，后续只改宿主宽高再 fit。
   * 测量宿主与旧实现（容器内临时 div，宽高 100%）同尺寸口径，保持既有
   * 初始 cols/rows 不变。
   */
  measureDimensions(width: number, height: number): { cols: number; rows: number } | null {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }
    const fontSize = readTerminalFontSize();
    const fontFamily = readTerminalFontFamily();
    if (
      !this.measureEntry ||
      this.measureEntry.fontSize !== fontSize ||
      this.measureEntry.fontFamily !== fontFamily
    ) {
      this.measureEntry?.terminal.dispose();
      this.measureEntry?.hostEl.remove();
      const hostEl = document.createElement('div');
      hostEl.setAttribute('aria-hidden', 'true');
      hostEl.style.cssText =
        'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;overflow:hidden;';
      const terminal = new Terminal({
        fontSize,
        fontFamily,
        rows: 24,
        cols: 80,
        allowProposedApi: true,
      });
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(hostEl);
      document.body.appendChild(hostEl);
      this.measureEntry = { terminal, fitAddon, hostEl, fontSize, fontFamily };
    }
    const entry = this.measureEntry;
    entry.hostEl.style.width = `${width}px`;
    entry.hostEl.style.height = `${height}px`;
    try {
      entry.fitAddon.fit();
      const dims = entry.fitAddon.proposeDimensions();
      if (dims && dims.cols > 0 && dims.rows > 0) {
        return { cols: dims.cols, rows: dims.rows };
      }
    } catch {
      // 隐藏/零尺寸等不可测场景：调用方回退默认 80×24
    }
    return null;
  }

  /** 向会话写入输出；池条目尚未建立时先缓冲，acquire 时补写。 */
  write(sessionId: string, data: string): void {
    const existing = this.pool.get(sessionId);
    if (existing) {
      existing.terminal.write(data);
      return;
    }
    const buffered = (this.pendingOutput.get(sessionId) ?? '') + data;
    this.pendingOutput.set(
      sessionId,
      buffered.length > TerminalXtermPool.MAX_PENDING_OUTPUT
        ? buffered.slice(-TerminalXtermPool.MAX_PENDING_OUTPUT)
        : buffered,
    );
  }

  /**
   * 把旧会话的 xterm 实例改名给新会话（kill → 重新激活复用同一窗格实例）：
   * 清屏/清缓冲后由 acquire 按新 id 命中，避免重建 canvas + xterm（实测约 60ms）。
   * 返回 false 表示没有可复用实例，调用方按正常路径新建。
   */
  rekey(fromSessionId: string, toSessionId: string): boolean {
    if (fromSessionId === toSessionId) {
      return this.pool.has(toSessionId);
    }
    const entry = this.pool.get(fromSessionId);
    if (!entry) {
      return false;
    }
    this.pool.delete(fromSessionId);
    entry.sessionId = toSessionId;
    this.pool.set(toSessionId, entry);
    try {
      entry.terminal.reset();
    } catch {
      // 实例已释放：新会话 acquire 会按正常路径新建
      this.pool.delete(toSessionId);
      entry.hostEl.remove();
      return false;
    }
    return true;
  }

  /** 把池条目建立前缓冲的输出补写到新建条目（无缓冲则空操作）。 */
  private flushPending(sessionId: string, terminal: Terminal): void {
    const pending = this.pendingOutput.get(sessionId);
    if (!pending) {
      return;
    }
    terminal.write(pending);
    this.pendingOutput.delete(sessionId);
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
      this.flushPending(sessionId, existing.terminal);
      if (existing.hostEl.parentElement !== container) {
        container.appendChild(existing.hostEl);
        if (shouldFitTerminal(existing.hostEl)) {
          try {
            existing.fitAddon.fit();
          } catch {
            // 实例已释放或尺寸不可测；消费侧 XtermTerminal 的 ResizeObserver 会重 fit
          }
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

    this.flushPending(sessionId, terminal);

    requestAnimationFrame(() => {
      if (!shouldFitTerminal(hostEl)) {
        return;
      }
      try {
        fitAddon.fit();
      } catch {
        // Container may have been disposed
      }
    });

    return entry;
  }

  release(sessionId: string): void {
    this.pendingOutput.delete(sessionId);
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
   * 全量套用新字号（菜单增大/减小字号）：逐实例设值；可见且已布局时立即 fit，
   * 否则交由挂载侧 ResizeObserver / 回焦补 fit 收敛。
   * 入口即钳制取整，与读侧 `readTerminalFontSize` 同口径（非法回退默认）。
   */
  setFontSize(size: number): void {
    const effective = clampTerminalFontSize(size);
    for (const entry of this.pool.values()) {
      // 赋值在 try 之外：options 写入失败是真缺陷，应直接抛出而不是吞掉；
      // 只有 fit() 本身失败（实例已释放 / 尺寸不可测）才静默。
      entry.terminal.options.fontSize = effective;
      if (shouldFitTerminal(entry.hostEl)) {
        try {
          entry.fitAddon.fit();
        } catch {
          // 实例已释放：挂载侧会在可见时重新 fit
        }
      }
    }
    if (this.measureEntry) {
      this.measureEntry.terminal.options.fontSize = effective;
      this.measureEntry.fontSize = effective;
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
