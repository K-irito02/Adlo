import { buildSearchPattern } from '@utils/searchPattern';
import { highlightElement } from '@utils/revealHighlight';
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

/*
 * 覆盖层（视口夹层 + 高亮条）与「播放一次高亮」的实现在共享模块
 * `@utils/revealHighlight`（组件侧 `@components/RevealHighlight` 只渲染常驻覆盖层）：
 * 本模块只负责「行号 → 目标元素」的映射与滚动定位，
 * 呈现交给共享实现（文件面板用 `warning` 变体，设置面板搜索跳转用 `accent` 变体）。
 */

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
    highlightElement(container, target, { variant: 'warning' });
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
