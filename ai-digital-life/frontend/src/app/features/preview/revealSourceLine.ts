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
 * **最近的前置块**（业界做法，见 VS Code markdown preview 的 scroll-sync）。
 */
export function resolveSourceLineElement(container: HTMLElement, line: number): HTMLElement | null {
  let containing: HTMLElement | null = null;
  let preceding: HTMLElement | null = null;
  for (const block of collectBlocks(container)) {
    if (
      Number.isFinite(block.start) &&
      Number.isFinite(block.end) &&
      block.start <= line &&
      line <= block.end
    ) {
      containing = block.element;
    } else if (block.end < line) {
      preceding = block.element;
    }
  }
  return containing ?? preceding ?? null;
}

/** 滚动到目标行对应的块并（可选）落点闪烁；返回是否找到了目标块。 */
export function revealSourceLine(
  container: HTMLElement,
  line: number,
  options: { flash?: boolean } = {},
): boolean {
  const target = resolveSourceLineElement(container, line);
  if (!target) {
    return false;
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (options.flash) {
    target.classList.remove('adl-md-flash');
    // 强制重排以便连续跳转时动画可重放
    void target.offsetWidth;
    target.classList.add('adl-md-flash');
    window.setTimeout(() => target.classList.remove('adl-md-flash'), 1400);
  }
  return true;
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
 */
export function revealEditorLineSafely(
  editor: EditorRef,
  line: number,
  context: { path?: string; scope: string },
): 'revealed' | 'clamped' | 'invalid' {
  const lineCount = editor.getModel?.()?.getLineCount() ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(line) || line < 1) {
    return 'invalid';
  }
  const finiteCount = Number.isFinite(lineCount) ? lineCount : null;
  const target = finiteCount === null ? line : Math.min(line, finiteCount);
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
