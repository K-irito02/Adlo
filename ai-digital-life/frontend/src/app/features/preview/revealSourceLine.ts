import { buildSearchPattern } from '@utils/searchPattern';
import type { EditorRef } from '@stores/types';

/** 块级源行映射：`end` 为闭区间末行号（单行块 `start === end`）。 */
interface MappedBlock {
  element: HTMLElement;
  start: number;
  end: number;
}

function collectBlocks(container: HTMLElement): MappedBlock[] {
  const nodes = Array.from(container.querySelectorAll<HTMLElement>('[data-source-line-start]'));
  return nodes.map((element) => ({
    element,
    start: Number(element.dataset.sourceLineStart),
    end: Number(element.dataset.sourceLineEnd),
  }));
}

/**
 * 取包含该行的最内层块（文档顺序中最后一个命中者）；无包含者时回退到
 * **最近的前置块**（`end` 最大者，同 end 取后者；见 VS Code markdown preview 的 scroll-sync）。
 */
export function resolveSourceLineElement(container: HTMLElement, line: number): HTMLElement | null {
  let containing: HTMLElement | null = null;
  let preceding: HTMLElement | null = null;
  let precedingEnd = Number.NEGATIVE_INFINITY;
  for (const block of collectBlocks(container)) {
    if (
      Number.isFinite(block.start) &&
      Number.isFinite(block.end) &&
      block.start <= line &&
      line <= block.end
    ) {
      containing = block.element;
    } else if (block.end < line && block.end >= precedingEnd) {
      preceding = block.element;
      precedingEnd = block.end;
    }
  }
  return containing ?? preceding ?? null;
}

/* ---------------- 滚动定位 ---------------- */

/**
 * 远距阈值（预览面可视高度的倍数）：超出即瞬时定位。
 * 平滑滚动耗时随距离增长（大文件可达数秒），既拖慢跳转，也会让落点高亮在视口到达前过期。
 */
const INSTANT_SCROLL_VIEWPORT_RATIO = 1.5;

/** 近距保留平滑滚动，远距瞬时定位（避免长距离平滑滚动的耗时与落点高亮错位）。 */
function chooseScrollBehavior(container: HTMLElement, target: HTMLElement): ScrollBehavior {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  if (containerRect.height <= 0) {
    return 'instant';
  }
  const containerCenter = containerRect.top + containerRect.height / 2;
  const targetCenter = targetRect.top + targetRect.height / 2;
  const overflowRatio = Math.abs(targetCenter - containerCenter) / containerRect.height;
  return overflowRatio > INSTANT_SCROLL_VIEWPORT_RATIO ? 'instant' : 'smooth';
}

/* ---------------- 落点高亮 ---------------- */

/**
 * 落点高亮覆盖层类名。
 *
 * 结构：预览面（`.adl-tool-editor__surface--preview`，`position: relative` 且不滚动）内常驻
 * 「视口夹层 `.adl-md-flash-overlay-viewport`」+ 本元素「高亮条」，横向 `left: 0; right: 0`
 * 铺满并与主内容显示区域左右边缘贴合（直角 + 左侧警示竖线）。
 *
 * 为何用覆盖层而非给目标块加背景：预览正文位于 `.adl-markdown-preview` 列内（该列左右各有
 * `var(--space-10)` = 40px 内边距，且**该列自身就是滚动容器**：`overflow-y: auto` 使 `overflow-x`
 * 计算值为 auto，会裁剪其内部溢出）。块级背景的左右边界止于该内边距、并被列的溢出裁剪，
 * 因此物理上无法抵达预览面边缘。
 * 为何需要夹层：高亮条在平滑滚动期间可能落在可视区之外，夹层裁剪掉这部分溢出，
 * 避免给预览面制造可滚动溢出。
 */
export const FLASH_OVERLAY_CLASS = 'adl-md-flash-overlay';
export const FLASH_OVERLAY_VIEWPORT_CLASS = 'adl-md-flash-overlay-viewport';
const FLASH_ACTIVE_CLASS = 'is-active';
/** 高亮时长（单一来源）：写入 `--adl-md-flash-duration`，CSS 关键帧与清除定时器共用同一值。 */
const FLASH_DURATION_MS = 1400;
/** CSS 自定义属性名：由本模块注入，避免 TS 与 CSS 各写一份时长导致漂移。 */
const FLASH_DURATION_VAR = '--adl-md-flash-duration';

interface FlashTracking {
  raf: number;
  timer: number;
}

/** WeakMap 跟踪：连续跳转时旧定时器/rAF 不得撕掉新加的类。 */
const flashTracking = new WeakMap<HTMLElement, FlashTracking>();

/**
 * 把覆盖层对齐到目标块。覆盖层的 offsetParent 是**不滚动**的视口夹层（其矩形与预览面一致），
 * 而被定位的块位于其内部滚动列中，故须按视口矩形差实时计算（滚动过程中每帧跟踪）。
 * 目标已脱离文档（切换文件后旧块被替换）或夹层不可测时**立即收起高亮条** ——
 * 既不压成错误位置，也不让它冻结在旧像素位置（冻结会留下一条错位的黄带）。
 */
function alignOverlay(overlay: HTMLElement, target: HTMLElement): void {
  const anchor = overlay.offsetParent;
  if (!(anchor instanceof HTMLElement) || !target.isConnected) {
    if (overlay.style.height !== '0px') {
      overlay.style.height = '0px';
    }
    return;
  }
  const anchorRect = anchor.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const top = `${targetRect.top - anchorRect.top}px`;
  const height = `${targetRect.height}px`;
  if (overlay.style.top !== top) {
    overlay.style.top = top;
  }
  if (overlay.style.height !== height) {
    overlay.style.height = height;
  }
}

/** 播放一次落点高亮：对齐目标块并随滚动跟踪（连点可重放）。覆盖层不存在时不作提示。 */
function flashRevealedElement(container: HTMLElement, target: HTMLElement): void {
  const overlay = container.querySelector<HTMLElement>(`.${FLASH_OVERLAY_CLASS}`);
  if (!overlay) {
    return;
  }
  const previous = flashTracking.get(overlay);
  if (previous) {
    window.clearTimeout(previous.timer);
    window.cancelAnimationFrame(previous.raf);
  }
  overlay.classList.remove(FLASH_ACTIVE_CLASS);
  // 时长单一来源：TS 常量注入 CSS 变量，关键帧动画与下方清除定时器共用同一值
  overlay.style.setProperty(FLASH_DURATION_VAR, `${FLASH_DURATION_MS}ms`);
  alignOverlay(overlay, target);
  // 强制重排以便连续跳转时动画可重放
  void overlay.offsetWidth;
  overlay.classList.add(FLASH_ACTIVE_CLASS);
  const tracking: FlashTracking = { raf: 0, timer: 0 };
  const track = () => {
    alignOverlay(overlay, target);
    tracking.raf = window.requestAnimationFrame(track);
  };
  tracking.raf = window.requestAnimationFrame(track);
  tracking.timer = window.setTimeout(() => {
    window.cancelAnimationFrame(tracking.raf);
    overlay.classList.remove(FLASH_ACTIVE_CLASS);
    flashTracking.delete(overlay);
  }, FLASH_DURATION_MS);
  flashTracking.set(overlay, tracking);
}

/** 滚动到指定元素并（可选）播放落点高亮；返回是否滚动成功。 */
export function scrollAndFlash(
  container: HTMLElement,
  target: HTMLElement,
  options: { flash?: boolean } = {},
): boolean {
  try {
    target.scrollIntoView({
      behavior: chooseScrollBehavior(container, target),
      block: 'center',
    });
  } catch {
    // 游离 DOM 等极端情况：不抛，由调用方回退。
    return false;
  }
  if (options.flash) {
    flashRevealedElement(container, target);
  }
  return true;
}

/** 滚动到目标行对应的块并（可选）落点高亮；返回是否找到了目标块。 */
export function revealSourceLine(
  container: HTMLElement,
  line: number,
  options: { flash?: boolean } = {},
): boolean {
  const target = resolveSourceLineElement(container, line);
  if (!target) {
    return false;
  }
  return scrollAndFlash(container, target, options);
}

/**
 * 在 live 内容中定位检索词所在行：优先返回 `preferredLine`（若仍匹配），
 * 否则返回**距其行号最近**的匹配行（同距取靠前者）；内容中已无匹配返回 `null`。
 */
export function findLineForQuery(
  content: string,
  query: string,
  options: { matchCase: boolean; wholeWord: boolean; useRegex: boolean },
  preferredLine: number,
): number | null {
  const pattern = buildSearchPattern(query, {
    matchCase: options.matchCase,
    wholeWord: options.wholeWord,
    useRegex: options.useRegex,
  });
  if (!pattern) {
    return null;
  }
  const matcher = new RegExp(pattern);
  const lines = content.split(/\r?\n/);
  const matches: number[] = [];
  lines.forEach((text, index) => {
    matcher.lastIndex = 0;
    if (matcher.test(text)) {
      matches.push(index + 1);
    }
  });
  if (matches.length === 0) {
    return null;
  }
  if (matches.includes(preferredLine)) {
    return preferredLine;
  }
  return matches.reduce((best, candidate) =>
    Math.abs(candidate - preferredLine) < Math.abs(best - preferredLine) ? candidate : best,
  );
}

/**
 * 编辑器行揭示：越界行钳制到最近有效行（越界会抛 RangeError，且上层无错误边界）。
 * 与 FilesPanel 内联分支同语义（含 `line < 1 → 1`），调用方可统一预期。
 */
export function revealEditorLineSafely(
  editor: EditorRef,
  line: number,
  context: { path?: string; scope: string },
): 'revealed' | 'clamped' | 'invalid' {
  const lineCount = editor.getModel?.()?.getLineCount() ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(line)) {
    return 'invalid';
  }
  const finiteCount = Number.isFinite(lineCount) ? lineCount : null;
  const target = line < 1 ? 1 : finiteCount === null ? line : Math.min(line, finiteCount);
  if (target !== line) {
    console.warn(
      `[revealEditorLineSafely] clamped in ${context.scope}: requested=${line}, applied=${target}, lineCount=${finiteCount ?? 'unknown'}, path=${context.path ?? 'unknown'}`,
    );
  }
  editor.revealLineInCenter?.(target);
  editor.setPosition?.({ lineNumber: target, column: 1 });
  editor.focus?.();
  return target === line ? 'revealed' : 'clamped';
}
