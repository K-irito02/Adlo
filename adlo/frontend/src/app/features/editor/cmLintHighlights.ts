import type { EditorView } from '@codemirror/view';

export class ChunkButtonManager {
  private lastChunkPositions = new Map<Element, string>();

  constructor(private readonly view: EditorView) {}

  clearChunkButtonStyles(): void {
    const buttons = this.view.dom.querySelectorAll('.cm-chunkButtons');
    for (const btn of buttons) {
      const s = (btn as HTMLElement).style;
      s.removeProperty('position');
      s.removeProperty('top');
      s.removeProperty('transform');
      s.removeProperty('right');
      s.removeProperty('inset-inline-end');
    }
    this.lastChunkPositions.clear();
  }

  setChunkButtonsVisibility(visible: boolean): void {
    const buttons = this.view.dom.querySelectorAll('.cm-deletedChunk .cm-chunkButtons');
    for (const btn of buttons) {
      (btn as HTMLElement).style.visibility = visible ? '' : 'hidden';
    }
  }

  prepareAndShowChunkButtons(visibleWidth: number, scrollLeft: number): void {
    this.positionChunkButtons(visibleWidth, scrollLeft);
    this.setChunkButtonsVisibility(true);
  }

  private positionChunkButtons(visibleWidth: number, _scrollLeft: number): void {
    const isNoWrap = this.view.dom.closest('.adl-cm-no-word-wrap') !== null;
    const isInlineDiff = this.view.dom.closest('.adl-cm-diff-viewer--inline') !== null;

    const buttons = this.view.dom.querySelectorAll('.cm-deletedChunk .cm-chunkButtons');

    if (!isNoWrap || !isInlineDiff) {
      if (this.lastChunkPositions.size > 0) {
        for (const btn of buttons) {
          const s = (btn as HTMLElement).style;
          s.removeProperty('position');
          s.removeProperty('top');
          s.removeProperty('transform');
          s.removeProperty('right');
          s.removeProperty('inset-inline-end');
          s.removeProperty('left');
          s.removeProperty('margin-top');
        }
        this.lastChunkPositions.clear();
      }
      return;
    }

    const scrollDOM = this.view.scrollDOM;
    const scrollerRect = scrollDOM.getBoundingClientRect();
    const contentDOM = this.view.contentDOM;
    const lineHeight = parseFloat(getComputedStyle(contentDOM).lineHeight) || 18;

    const activeChunks = new Set<Element>();
    const gap = 4;

    for (const btn of buttons) {
      const chunk = btn.parentElement;
      if (!chunk) {
        continue;
      }
      activeChunks.add(btn);

      const btnEl = btn as HTMLElement;
      const chunkRect = chunk.getBoundingClientRect();

      const targetButtonRight = scrollerRect.left + visibleWidth - gap;
      const offset = Math.max(0, chunkRect.right - targetButtonRight);

      const offsetKey = `${offset}px`;

      if (this.lastChunkPositions.get(btn) === offsetKey) {
        continue;
      }
      this.lastChunkPositions.set(btn, offsetKey);

      const btnHeight = btnEl.offsetHeight;
      const topOffset = (lineHeight - btnHeight) / 2;

      const s = btnEl.style;
      s.setProperty('position', 'absolute', 'important');
      s.setProperty('top', `${topOffset}px`, 'important');
      s.removeProperty('transform');
      s.removeProperty('margin-top');
      s.setProperty('right', `${offset}px`, 'important');
      s.setProperty('inset-inline-end', `${offset}px`, 'important');
      s.removeProperty('left');
    }

    for (const [btn] of this.lastChunkPositions) {
      if (!activeChunks.has(btn)) {
        const s = (btn as HTMLElement).style;
        s.removeProperty('position');
        s.removeProperty('top');
        s.removeProperty('transform');
        s.removeProperty('right');
        s.removeProperty('inset-inline-end');
        s.removeProperty('left');
        s.removeProperty('margin-top');
        this.lastChunkPositions.delete(btn);
      }
    }
  }
}
