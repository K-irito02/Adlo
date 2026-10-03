// src/app/features/terminal/terminalHistoryCollector.ts
import {
  extractLines,
  type ExtractLine,
  type ExtractSource,
  type HistoryRun,
} from './historyModel';
import { chunkKey, type TerminalHistoryChunkMeta } from './terminalHistoryStore';

export const TERMINAL_HISTORY_CHUNK_MAX_BYTES = 64 * 1024;
export const TERMINAL_CAPTURE_SCROLLBACK_LINES = 5000;
export const TERMINAL_CAPTURE_THROTTLE_MS = 500;

/**
 * 周期检查点的封块阈值（三选一命中即封）：
 * - 行数或字节攒够 → 正常封块（块大小合理，写放大低）；
 * - 距上次封块超过空闲时长 → 即使只有几行也落盘，把「崩溃丢尾」的窗口限制在该时长内。
 * 会话结束的 `flush` 不受阈值约束，一律封块（尾部必须完整）。
 */
export const TERMINAL_CHECKPOINT_MIN_LINES = 200;
export const TERMINAL_CHECKPOINT_MIN_BYTES = 16 * 1024;
export const TERMINAL_CHECKPOINT_IDLE_MS = 5 * 60 * 1000;

export interface BufferSnapshot {
  length: number;
  baseY: number;
  activeType: 'normal' | 'alternate';
  getLine(y: number): ExtractLine | undefined;
}

interface CollectorDeps {
  readBuffer: () => BufferSnapshot;
  cols: () => number;
  /** 返回是否写入成功；实现处应检查 IpcResult.ok（见 terminalOutputStore.save） */
  write: (key: string, payload: string) => Promise<boolean>;
  /** 时间源（默认 Date.now）：检查点的空闲判定需要它，测试注入以便确定性断言 */
  now?: () => number;
}

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** 全空白行：零 run，或所有 run 的文本全由空白字符组成（含带背景色的空格填充行） */
function isBlankLine(line: HistoryRun[]): boolean {
  return line.every((run) => run.text.trim() === '');
}

/**
 * 行块采集状态机：把「已冻结的屏幕行」按块追加落盘。
 *
 * 三条不变量：
 * 1. **只追加**：块一旦落盘就不再重写，因此后续写入不可能损坏已保存的内容。
 * 2. **单次写入体积有界**：由「两次采集之间新增的行数」决定，撞不到任何体积上限
 *    —— 这是「超出上限被拒收」被结构性消除的原因，而不是把阈值调大。
 * 3. **成功才推进水位**：写入失败时保留未满块与水位，下一次采集重试同一批行。
 *
 * 绝对行号失效兜底（scrollback 环回 **或** 列数变化引起的 xterm 重排，见 `detectRewind`）：
 * 此时只重置采集器**内部状态**（水位 / 暂存 / `written[]` 元信息 / seq / lastCols），
 * **磁盘上已写入的块不会被删除** —— 它们仍占着存储，必须由调用方以当前缓冲区内容整段重建：
 * 用同一 `seq` 推导出的块键覆盖写回，并同步重建分段索引。否则会写出错位的历史，比丢失更难排查。
 */
export class TerminalHistoryCollector {
  private sessionId = '';
  private watermark = 0;
  private pending: HistoryRun[][] = [];
  /** pending 各行 JSON 字节数之和；不含块包装与行间逗号（判定见 wouldExceedCap） */
  private pendingBytes = 0;
  private written: TerminalHistoryChunkMeta[] = [];
  private seq = 0;
  private rebuilt = false;
  /** 上次采集时的列数：列数变化＝xterm 重排，绝对行号失效（见 detectRewind） */
  private lastCols = 0;
  /** 上次成功封块的时刻（ms）：检查点的空闲兜底据此判定 */
  private lastSealAt = 0;

  constructor(private readonly deps: CollectorDeps) {}

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  /** 绑定会话并重置全部状态（每建一个新会话都要调用） */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
    this.watermark = 0;
    this.pending = [];
    this.pendingBytes = 0;
    this.written = [];
    this.seq = 0;
    this.rebuilt = false;
    this.lastCols = 0;
    this.lastSealAt = this.now();
  }

  getWrittenChunks(): TerminalHistoryChunkMeta[] {
    return this.written.slice();
  }

  /**
   * 回卷（scrollback 溢出）是否已发生：返回 true 并**清除标志**（一次性消费）。
   * 一次性是关键：粘性标志会让调用方的「块数未变则跳过」保护永久失效，
   * 造成空闲期无意义 upsert；消费后由调用方决定是否重建索引。
   */
  consumeRebuild(): boolean {
    const rebuilt = this.rebuilt;
    this.rebuilt = false;
    return rebuilt;
  }

  /**
   * 操作串行化：collect / checkpoint / flush 共享 watermark / pending / seq，
   * 调用方（节流采集、30s 检查点、terminated 定稿、关闭全量定稿）可并发打到同一采集器。
   * 单线程下同步段不会交错，但 seal 内的 await（IPC 落盘）会让第二个操作插进来，
   * 造成水位推进与 pending 清空错位（丢行或写重复行）。所有入口经此队列，前一个落定后一个才跑。
   */
  private queue: Promise<void> = Promise.resolve();

  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    const next = this.queue.then(run);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  /** 采集：把 [watermark, baseY) 的冻结行并入当前块，写满即封块 */
  async collect(): Promise<boolean> {
    return this.enqueue(() => this.doCollect());
  }

  /**
   * 检查点：收集冻结行，并在「攒够阈值」或「距上次封块超过空闲时长」时封块。
   * 只含冻结行、不含视口区 —— 与 collect 同口径，追加性与水位不变量同样成立。
   * 攒不够就留 pending 给后续检查点或会话结束的 flush（避免稀疏会话每 30s 落一个小块，
   * 又用空闲兜底把崩溃丢尾窗口限制在 TERMINAL_CHECKPOINT_IDLE_MS 内）。
   */
  async checkpoint(): Promise<boolean> {
    return this.enqueue(() => this.doCheckpoint());
  }

  /** 定稿：把视口区也封入最后一块（会话已结束，视口不再变化） */
  async flush(): Promise<boolean> {
    return this.enqueue(() => this.doFlush());
  }

  private async doCollect(): Promise<boolean> {
    const buffer = this.deps.readBuffer();
    this.detectRewind(buffer);
    // 本次采集的冻结终点：只采 [watermark, baseY) 的冻结行，视口区留给 flush。
    const frozenEnd = buffer.baseY;
    return this.append(buffer, frozenEnd);
  }

  private async doCheckpoint(): Promise<boolean> {
    const buffer = this.deps.readBuffer();
    this.detectRewind(buffer);
    if (!(await this.append(buffer, buffer.baseY))) {
      return false;
    }
    const enoughLines = this.pending.length >= TERMINAL_CHECKPOINT_MIN_LINES;
    const enoughBytes = this.pendingBytes >= TERMINAL_CHECKPOINT_MIN_BYTES;
    const idleTooLong = this.now() - this.lastSealAt >= TERMINAL_CHECKPOINT_IDLE_MS;
    if (!enoughLines && !enoughBytes && !idleTooLong) {
      // 攒着不封：调用方的「块数未变则跳过」会跟着跳过索引写入，不产生 churn
      return true;
    }
    return this.seal();
  }

  private async doFlush(): Promise<boolean> {
    const buffer = this.deps.readBuffer();
    this.detectRewind(buffer);
    if (!(await this.append(buffer, buffer.length))) {
      return false;
    }
    // 定稿快照丢掉末尾全空白行：视口尾部常年拖着一整屏空白（cls 之后更甚），
    // 原样封块会让日期分隔符沉到数十空行之后。只动本次快照的末尾，
    // 冻结区中间的空行（排版原意）不动；按被删行的实际 JSON 字节扣回，
    // 保持 pendingBytes 与封块预算投影一致。
    let tail = this.pending[this.pending.length - 1];
    while (tail !== undefined && isBlankLine(tail)) {
      const removed = this.pending.pop() as HistoryRun[];
      this.pendingBytes = Math.max(0, this.pendingBytes - utf8Length(JSON.stringify(removed)));
      tail = this.pending[this.pending.length - 1];
    }
    return this.seal();
  }

  /**
   * 环回 + 重排兜底：绝对行号失效时重置内部状态并要求整段重建。
   * 这里**不删除磁盘上的块**：`written` 只是内存里的元信息，落盘的块仍留在原键上，
   * 等调用方重建时按同一 `seq` 覆盖写回（见类注释）。
   *
   * 增量采集依赖「已采集行的绝对行号不再变化」，两种情形会打破它，都必须整段重采：
   * 1. **环回**：scrollback 溢出裁掉最旧行 → `buffer.length < watermark`；
   * 2. **重排**：列数变化（拖拽分界线、窗口或区域宽度变化都会让 xterm `resize(cols)`）
   *    → 重排后同一绝对行号对应的内容整体位移。此时长度未必变短，旧实现只判长度，
   *    会从失效水位继续采 → 写进错位/重复/缺失的行（静默损坏，重启后表现为历史被裁剪）。
   */
  private detectRewind(buffer: BufferSnapshot): void {
    const cols = this.deps.cols();
    const overflowed = this.watermark > 0 && buffer.length < this.watermark;
    const rewrapped = this.watermark > 0 && cols !== this.lastCols;
    if (overflowed || rewrapped) {
      console.warn('[TERMINAL-HISTORY] rebuild whole segment', {
        sessionId: this.sessionId,
        reason: overflowed ? 'scrollback-overflow' : 'reflow-cols-changed',
        watermark: this.watermark,
        bufferLength: buffer.length,
        prevCols: this.lastCols,
        cols,
        staleChunks: this.written.length,
      });
      this.rebuilt = true;
      this.watermark = 0;
      this.pending = [];
      this.pendingBytes = 0;
      this.written = [];
      this.seq = 0;
    }
    this.lastCols = cols;
  }

  private async append(buffer: BufferSnapshot, toRow: number): Promise<boolean> {
    // 已暂存 + 已落盘的行总数：从它之后开始提取，避免把「上次 collect 留下的未满块」重复采集。
    const stagedTo = this.watermark + this.pending.length;
    if (toRow <= stagedTo) {
      return true;
    }
    const rows = extractLines(
      { active: buffer as unknown as ExtractSource, normal: buffer as unknown as ExtractSource },
      stagedTo,
      toRow,
    );
    for (const line of rows) {
      const lineBytes = utf8Length(JSON.stringify(line));
      if (this.pending.length > 0 && this.wouldExceedCap(lineBytes)) {
        if (!(await this.seal())) {
          return false;
        }
      }
      this.pending.push(line);
      this.pendingBytes += lineBytes;
    }
    return true;
  }

  /**
   * 与 `seal` 同口径的「投影 payload 体积」是否超上限。
   *
   * 不能只比行体和：真正落盘的字节数还包含 `{"seq":N,"cols":N,"lines":[` … `]}` 这层包装，
   * 以及 n+1 个行元素之间的 **n 个逗号**（n = 已暂存行数）。行体和顶格时包装与逗号会把
   * payload 顶过上限，所以必须一并计入，让「交给 write 的 payload 永不超上限」成立在
   * 结构性上，而不是靠余量够大。
   */
  private wouldExceedCap(lineBytes: number): boolean {
    const projected = this.wrapperBytes() + this.pendingBytes + lineBytes + this.pending.length;
    return projected > TERMINAL_HISTORY_CHUNK_MAX_BYTES;
  }

  /** 封块 payload 的固定包装字节数（与 `seal` 的序列化方式逐字一致） */
  private wrapperBytes(): number {
    return utf8Length(
      `{"seq":${JSON.stringify(this.seq)},"cols":${JSON.stringify(this.deps.cols())},"lines":[` +
        ']}',
    );
  }

  /** 把 pending 落盘为一个块；成功推进 seq 与水位，失败清空 pending 让下次从同一水位重建 */
  private async seal(): Promise<boolean> {
    if (this.pending.length === 0) {
      return true;
    }
    const payload = JSON.stringify({
      seq: this.seq,
      cols: this.deps.cols(),
      lines: this.pending,
    });
    const ok = await this.deps.write(chunkKey(this.sessionId, this.seq), payload);
    if (!ok) {
      // 水位未推进（成功才推进，见 seal 成功分支），下次 append 会从同一水位重新提取；
      // 此处必须丢弃已暂存的行，否则重建时会把同一批行重复追加，写出重复内容。
      this.pending = [];
      this.pendingBytes = 0;
      return false;
    }
    this.written.push({ lines: this.pending.length, size: utf8Length(payload) });
    this.lastSealAt = this.now();
    this.seq += 1;
    // 水位只在此处（落盘成功）推进，且严格按「本块行数」推进 —— 失败时不推进，
    // 这是「成功才推进水位、失败重试同一批行不重复」不变量成立的关键。
    this.watermark += this.pending.length;
    this.pending = [];
    this.pendingBytes = 0;
    return true;
  }
}
