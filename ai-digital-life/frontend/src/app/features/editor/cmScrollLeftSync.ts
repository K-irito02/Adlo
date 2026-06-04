import { ViewPlugin, type EditorView, type PluginValue, type ViewUpdate } from '@codemirror/view';

const SCROLL_LEFT_CSS_VAR = '--adl-editor-scroll-left';
const VISIBLE_WIDTH_CSS_VAR = '--adl-editor-visible-width';
const CONTENT_WIDTH_CSS_VAR = '--adl-editor-content-width';
const NO_HSCROLL_CLASS = 'adl-cm-scroller--no-hscroll';
const GUTTER_WIDTH_CSS_VAR = '--adl-editor-gutter-width';
const HSCROLL_CLASS = 'adl-cm-hscroll';
const HSCROLL_VISIBLE_CLASS = 'is-visible';
const HSCROLL_DRAGGING_CLASS = 'is-dragging';
const HSCROLL_DOT_OFFSET_VAR = '--adl-hscroll-dot-offset';
const THUMB_MIN_WIDTH = 40;

function formatPx(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0px';
  return `${value}px`;
}

class ScrollLeftSyncPlugin implements PluginValue {
  private frame = 0;
  private lastChunkPositions = new Map<Element, string>();
  private resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private hscrollEl: HTMLElement | null = null;
  private hscrollThumb: HTMLElement | null = null;
  private isDragging = false;
  private isPointerDown = false;
  private dragStartX = 0;
  private dragTrackLeft = 0;
  private dragTrackWidth = 0;
  private dragContentWidth = 0;
  private dragVisibleWidth = 0;
  private dragThumbWidth = 0;
  private dragMaxScrollLeft = 0;
  private dragMaxThumbLeft = 0;
  private boundOnThumbPointerDown: (e: PointerEvent) => void;
  private boundOnTrackPointerDown: (e: PointerEvent) => void;
  private boundOnPointerMove: (e: PointerEvent) => void;
  private boundOnPointerUp: (e: PointerEvent) => void;
  private boundOnPointerCancel: (e: PointerEvent) => void;
  private boundOnWheel: (e: WheelEvent) => void;
  private boundOnDocumentPointerDown: () => void;
  private boundOnDocumentPointerUp: () => void;
  private boundOnScrollDOMPointerMove: (e: PointerEvent) => void;

  constructor(private readonly view: EditorView) {
    this.boundOnThumbPointerDown = this.onThumbPointerDown.bind(this);
    this.boundOnTrackPointerDown = this.onTrackPointerDown.bind(this);
    this.boundOnPointerMove = this.onPointerMove.bind(this);
    this.boundOnPointerUp = this.onPointerUp.bind(this);
    this.boundOnPointerCancel = this.onPointerCancel.bind(this);
    this.boundOnWheel = this.onWheel.bind(this);
    this.boundOnDocumentPointerDown = this.onDocumentPointerDown.bind(this);
    this.boundOnDocumentPointerUp = this.onDocumentPointerUp.bind(this);
    this.boundOnScrollDOMPointerMove = this.onScrollDOMPointerMove.bind(this);

    this.createCustomScrollbar();
    this.syncCssPropsOnly();
    this.schedule();
    this.view.scrollDOM.addEventListener('scroll', this.handleScroll, { passive: true });
    this.view.scrollDOM.addEventListener('wheel', this.boundOnWheel, { passive: false });
    this.view.scrollDOM.addEventListener('pointermove', this.boundOnScrollDOMPointerMove);
    document.addEventListener('pointerdown', this.boundOnDocumentPointerDown);
    document.addEventListener('pointerup', this.boundOnDocumentPointerUp);
    this.setupResizeObserver();
  }

  private createCustomScrollbar(): void {
    const thumb = document.createElement('div');
    thumb.className = `${HSCROLL_CLASS}__thumb`;

    const track = document.createElement('div');
    track.className = `${HSCROLL_CLASS}__track`;
    track.appendChild(thumb);

    const container = document.createElement('div');
    container.className = HSCROLL_CLASS;
    container.appendChild(track);

    this.view.dom.appendChild(container);

    this.hscrollEl = container;
    this.hscrollThumb = thumb;

    thumb.addEventListener('pointerdown', this.boundOnThumbPointerDown);
    track.addEventListener('pointerdown', this.boundOnTrackPointerDown);
  }

  private onThumbPointerDown(e: PointerEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.isDragging = true;
    const thumbRect = this.hscrollThumb!.getBoundingClientRect();
    this.dragStartX = e.clientX - thumbRect.left;
    this.hscrollThumb!.classList.add(HSCROLL_DRAGGING_CLASS);
    this.cacheDragLayout();
    this.setChunkButtonsVisibility(false);
    this.hscrollThumb!.setPointerCapture(e.pointerId);
    this.hscrollThumb!.addEventListener('pointermove', this.boundOnPointerMove);
    this.hscrollThumb!.addEventListener('pointerup', this.boundOnPointerUp);
    this.hscrollThumb!.addEventListener('pointercancel', this.boundOnPointerCancel);
  }

  private cacheDragLayout(): void {
    if (!this.hscrollEl || !this.hscrollThumb) return;
    const scrollDOM = this.view.scrollDOM;
    const trackRect = this.hscrollEl.getBoundingClientRect();
    this.dragTrackLeft = trackRect.left;
    this.dragTrackWidth = trackRect.width;
    this.dragContentWidth = scrollDOM.scrollWidth;
    this.dragVisibleWidth = scrollDOM.clientWidth;
    this.dragThumbWidth = parseFloat(this.hscrollThumb.style.width) || 30;
    this.dragMaxScrollLeft = Math.max(0, this.dragContentWidth - this.dragVisibleWidth);
    this.dragMaxThumbLeft = Math.max(0, this.dragTrackWidth - this.dragThumbWidth);
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.isDragging || !this.hscrollThumb) return;
    if (this.dragMaxThumbLeft <= 0) return;

    const thumbLeft = Math.max(
      0,
      Math.min(this.dragMaxThumbLeft, e.clientX - this.dragTrackLeft - this.dragStartX)
    );

    const scrollLeft = (thumbLeft / this.dragMaxThumbLeft) * this.dragMaxScrollLeft;
    this.view.scrollDOM.scrollLeft = scrollLeft;

    this.hscrollThumb.style.left = `${thumbLeft}px`;

    const mergeView = this.view.dom.closest('.cm-mergeView');
    if (mergeView) {
      const editors = mergeView.querySelectorAll('.cm-mergeViewEditor .cm-scroller');
      for (const scroller of editors) {
        if (scroller !== this.view.scrollDOM) {
          const otherScroll = scroller as HTMLElement;
          const otherMax = Math.max(0, otherScroll.scrollWidth - otherScroll.clientWidth);
          if (otherMax > 0) {
            const ratio = Math.min(1, scrollLeft / this.dragMaxScrollLeft);
            otherScroll.scrollLeft = ratio * otherMax;
          }
        }
      }
    }
  }

  private onPointerUp(): void {
    if (!this.isDragging) return;
    this.stopEdgeScroll();
    this.endDrag();
    this.schedule();
  }

  private onPointerCancel(): void {
    if (!this.isDragging) return;
    this.endDrag();
  }

  private endDrag(): void {
    this.isDragging = false;
    if (this.hscrollThumb) {
      this.hscrollThumb.classList.remove(HSCROLL_DRAGGING_CLASS);
      this.hscrollThumb.removeEventListener('pointermove', this.boundOnPointerMove);
      this.hscrollThumb.removeEventListener('pointerup', this.boundOnPointerUp);
      this.hscrollThumb.removeEventListener('pointercancel', this.boundOnPointerCancel);
    }
    if (!this.resizeDebounceTimer) {
      const scrollDOM = this.view.scrollDOM;
      const scrollerStyle = getComputedStyle(scrollDOM);
      const paddingRight = parseFloat(scrollerStyle.paddingRight) || 0;
      this.prepareAndShowChunkButtons(scrollDOM.clientWidth - paddingRight, scrollDOM.scrollLeft);
    }
  }

  private onTrackPointerDown(e: PointerEvent): void {
    if (e.target === this.hscrollThumb || !this.hscrollEl) return;
    const trackRect = this.hscrollEl.getBoundingClientRect();
    const clickX = e.clientX - trackRect.left;
    const scrollDOM = this.view.scrollDOM;
    const scrollWidth = scrollDOM.scrollWidth;
    const visibleWidth = scrollDOM.clientWidth;
    const maxScrollLeft = Math.max(0, scrollWidth - visibleWidth);
    const ratio = clickX / trackRect.width;
    scrollDOM.scrollLeft = ratio * maxScrollLeft;
  }

  private onWheel(e: WheelEvent): void {
    const wrapper = this.view.dom.closest('.adl-cm-editor-wrapper, .adl-cm-diff-viewer-wrapper');
    const isNoWordWrap = wrapper?.classList.contains('adl-cm-no-word-wrap');
    if (!isNoWordWrap) return;

    const scrollDOM = this.view.scrollDOM;
    const contentDOM = this.view.contentDOM;
    const contentWidth = scrollDOM.scrollWidth;
    const visibleWidth = scrollDOM.clientWidth;
    if (contentWidth <= visibleWidth) return;

    let delta = 0;
    if (e.deltaX !== 0) {
      delta = e.deltaX;
    } else if (e.shiftKey && e.deltaY !== 0) {
      delta = e.deltaY;
    }

    if (delta === 0) return;

    e.preventDefault();
    scrollDOM.scrollLeft += delta;
  }

  private onDocumentPointerDown(): void {
    this.isPointerDown = true;
  }

  private onDocumentPointerUp(): void {
    this.isPointerDown = false;
    this.stopEdgeScroll();
    if (this.resizeDebounceTimer !== null) {
      clearTimeout(this.resizeDebounceTimer);
      this.resizeDebounceTimer = null;
      const scrollDOM = this.view.scrollDOM;
      const scrollerStyle = getComputedStyle(scrollDOM);
      const paddingRight = parseFloat(scrollerStyle.paddingRight) || 0;
      this.prepareAndShowChunkButtons(scrollDOM.clientWidth - paddingRight, scrollDOM.scrollLeft);
    }
  }

  private edgeScrollRafId: number | null = null;
  private edgeScrollDirection: number = 0;
  private edgeScrollSpeed: number = 0;

  private onScrollDOMPointerMove(e: PointerEvent): void {
    if (document.querySelector('.adl-cm-diff-resizer--dragging')) return;
    if (!(e.buttons & 1)) {
      this.stopEdgeScroll();
      return;
    }
    if (this.isDragging) return;

    const scrollDOM = this.view.scrollDOM;
    const scrollerRect = scrollDOM.getBoundingClientRect();
    const x = e.clientX - scrollerRect.left;
    const edgeZone = 40;

    if (x >= scrollerRect.width - edgeZone && x < scrollerRect.width) {
      this.edgeScrollDirection = 1;
      this.edgeScrollSpeed = (x - (scrollerRect.width - edgeZone)) / edgeZone;
      this.startEdgeScroll();
    } else if (x <= edgeZone && x > 0) {
      this.edgeScrollDirection = -1;
      this.edgeScrollSpeed = (edgeZone - x) / edgeZone;
      this.startEdgeScroll();
    } else {
      this.stopEdgeScroll();
    }
  }

  private startEdgeScroll(): void {
    if (this.edgeScrollRafId !== null) return;
    this.edgeScrollRafId = requestAnimationFrame(this.tickEdgeScroll);
  }

  private stopEdgeScroll(): void {
    if (this.edgeScrollRafId !== null) {
      cancelAnimationFrame(this.edgeScrollRafId);
      this.edgeScrollRafId = null;
    }
    this.edgeScrollDirection = 0;
    this.edgeScrollSpeed = 0;
  }

  private tickEdgeScroll = (): void => {
    const scrollDOM = this.view.scrollDOM;
    const dir = this.edgeScrollDirection;
    const speed = this.edgeScrollSpeed;

    if (dir === 0) {
      this.edgeScrollRafId = null;
      return;
    }

    const maxScrollLeft = Math.max(0, scrollDOM.scrollWidth - scrollDOM.clientWidth);

    if (dir > 0) {
      scrollDOM.scrollLeft = Math.min(maxScrollLeft, scrollDOM.scrollLeft + 2 + 4 * speed);
    } else {
      scrollDOM.scrollLeft = Math.max(0, scrollDOM.scrollLeft - 2 - 4 * speed);
    }

    const mergeView = this.view.dom.closest('.cm-mergeView');
    if (mergeView) {
      const editors = mergeView.querySelectorAll('.cm-mergeViewEditor .cm-scroller');
      for (const scroller of editors) {
        if (scroller !== scrollDOM) {
          (scroller as HTMLElement).scrollLeft = scrollDOM.scrollLeft;
        }
      }
    }

    if (this.edgeScrollRafId !== null) {
      this.edgeScrollRafId = requestAnimationFrame(this.tickEdgeScroll);
    }
  };

  private syncCssPropsOnly(): void {
    const scrollDOM = this.view.scrollDOM;
    const contentDOM = this.view.contentDOM;
    const dom = this.view.dom;

    const scrollLeft = scrollDOM.scrollLeft;
    dom.style.setProperty(SCROLL_LEFT_CSS_VAR, formatPx(scrollLeft));
    scrollDOM.style.setProperty(SCROLL_LEFT_CSS_VAR, formatPx(scrollLeft));

    const scrollerStyle = getComputedStyle(scrollDOM);
    const paddingRight = parseFloat(scrollerStyle.paddingRight) || 0;
    const visibleWidth = scrollDOM.clientWidth - paddingRight;
    dom.style.setProperty(VISIBLE_WIDTH_CSS_VAR, formatPx(visibleWidth));
    scrollDOM.style.setProperty(VISIBLE_WIDTH_CSS_VAR, formatPx(visibleWidth));

    const contentWidth = scrollDOM.scrollWidth;
    dom.style.setProperty(CONTENT_WIDTH_CSS_VAR, formatPx(contentWidth));
    scrollDOM.style.setProperty(CONTENT_WIDTH_CSS_VAR, formatPx(contentWidth));

    const gutters = scrollDOM.querySelector('.cm-gutters') as HTMLElement | null;
    const gutterWidth = gutters?.offsetWidth ?? 0;
    dom.style.setProperty(GUTTER_WIDTH_CSS_VAR, formatPx(gutterWidth));
    scrollDOM.style.setProperty(GUTTER_WIDTH_CSS_VAR, formatPx(gutterWidth));
  }

  private syncOverflow(scrollDOM: HTMLElement): void {
    const wrapper = scrollDOM.closest('.adl-cm-editor-wrapper, .adl-cm-diff-viewer-wrapper');
    const isNoWordWrap = wrapper?.classList.contains('adl-cm-no-word-wrap');

    if (isNoWordWrap) {
      scrollDOM.classList.remove(NO_HSCROLL_CLASS);
      scrollDOM.style.removeProperty('overflow-x');
      return;
    }

    const scrollerStyle = getComputedStyle(scrollDOM);
    const paddingRight = parseFloat(scrollerStyle.paddingRight) || 0;
    const visibleWidth = scrollDOM.clientWidth - paddingRight;
    const scrollWidth = scrollDOM.scrollWidth;

    const hasHorizontalOverflow = scrollWidth > visibleWidth;
    if (hasHorizontalOverflow) {
      scrollDOM.classList.remove(NO_HSCROLL_CLASS);
      scrollDOM.style.removeProperty('overflow-x');
    } else {
      scrollDOM.classList.add(NO_HSCROLL_CLASS);
      scrollDOM.style.setProperty('overflow-x', 'hidden', 'important');
    }
  }

  private updateCustomScrollbar(): void {
    if (!this.hscrollEl || !this.hscrollThumb) return;

    const scrollDOM = this.view.scrollDOM;

    const wrapper = scrollDOM.closest('.adl-cm-editor-wrapper, .adl-cm-diff-viewer-wrapper');
    const isNoWordWrap = wrapper?.classList.contains('adl-cm-no-word-wrap');

    if (!isNoWordWrap) {
      this.hscrollEl.classList.remove(HSCROLL_VISIBLE_CLASS);
      return;
    }

    const scrollWidth = scrollDOM.scrollWidth;
    const visibleWidth = scrollDOM.clientWidth;
    const scrollLeft = scrollDOM.scrollLeft;

    const hasOverflow = scrollWidth > visibleWidth;
    if (!hasOverflow) {
      this.hscrollEl.classList.remove(HSCROLL_VISIBLE_CLASS);
      return;
    }

    this.hscrollEl.classList.add(HSCROLL_VISIBLE_CLASS);

    const scrollbarWidth = scrollDOM.offsetWidth - scrollDOM.clientWidth;
    this.hscrollEl.style.right = `${scrollbarWidth}px`;

    const trackWidth = this.hscrollEl.offsetWidth;
    if (trackWidth <= 0) return;

    const maxScrollLeft = Math.max(0, scrollWidth - visibleWidth);
    const thumbWidth = Math.max(THUMB_MIN_WIDTH, (visibleWidth / scrollWidth) * trackWidth);
    const maxThumbLeft = trackWidth - thumbWidth;
    const thumbLeft = maxThumbLeft > 0 ? (scrollLeft / maxScrollLeft) * maxThumbLeft : 0;

    this.hscrollThumb.style.width = `${thumbWidth}px`;
    this.hscrollThumb.style.left = `${thumbLeft}px`;
    this.hscrollThumb.style.setProperty(HSCROLL_DOT_OFFSET_VAR, `${thumbWidth / 2 - 3}px`);
  }

  update(update: ViewUpdate): void {
    if (update.geometryChanged || update.viewportChanged || update.docChanged) {
      this.schedule();
    }
  }

  destroy(): void {
    document.removeEventListener('pointerdown', this.boundOnDocumentPointerDown);
    document.removeEventListener('pointerup', this.boundOnDocumentPointerUp);
    if (this.resizeDebounceTimer !== null) {
      clearTimeout(this.resizeDebounceTimer);
      this.resizeDebounceTimer = null;
    }
    this.view.scrollDOM.removeEventListener('scroll', this.handleScroll);
    this.view.scrollDOM.removeEventListener('wheel', this.boundOnWheel);
    this.view.scrollDOM.removeEventListener('pointermove', this.boundOnScrollDOMPointerMove);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    this.destroyCustomScrollbar();
    const dom = this.view.dom;
    const scrollDOM = this.view.scrollDOM;
    for (const prop of [
      SCROLL_LEFT_CSS_VAR,
      VISIBLE_WIDTH_CSS_VAR,
      CONTENT_WIDTH_CSS_VAR,
      GUTTER_WIDTH_CSS_VAR,
    ]) {
      dom.style.removeProperty(prop);
      scrollDOM.style.removeProperty(prop);
    }
    scrollDOM.classList.remove(NO_HSCROLL_CLASS);
    scrollDOM.style.removeProperty('overflow-x');
    this.clearChunkButtonStyles();
  }

  private destroyCustomScrollbar(): void {
    this.endDrag();
    if (this.hscrollEl) {
      this.hscrollEl.remove();
      this.hscrollEl = null;
      this.hscrollThumb = null;
    }
  }

  private handleScroll = (): void => {
    if (this.isDragging) return;
    this.schedule();
  };

  private setupResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => {
      this.setChunkButtonsVisibility(false);
      this.resetResizeDebounce();
      this.schedule();
    });
    this.resizeObserver.observe(this.view.scrollDOM, { box: 'content-box' });
  }

  private resetResizeDebounce(): void {
    if (this.resizeDebounceTimer !== null) {
      clearTimeout(this.resizeDebounceTimer);
    }
    this.resizeDebounceTimer = setTimeout(() => {
      if (this.isDragging || this.isPointerDown) return;
      this.resizeDebounceTimer = null;
      const scrollDOM = this.view.scrollDOM;
      const scrollerStyle = getComputedStyle(scrollDOM);
      const paddingRight = parseFloat(scrollerStyle.paddingRight) || 0;
      this.prepareAndShowChunkButtons(scrollDOM.clientWidth - paddingRight, scrollDOM.scrollLeft);
    }, 100);
  }

  private schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.sync();
    });
  }

  private clearChunkButtonStyles(): void {
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

  private setChunkButtonsVisibility(visible: boolean): void {
    const buttons = this.view.dom.querySelectorAll('.cm-deletedChunk .cm-chunkButtons');
    for (const btn of buttons) {
      (btn as HTMLElement).style.visibility = visible ? '' : 'hidden';
    }
  }

  private prepareAndShowChunkButtons(visibleWidth: number, scrollLeft: number): void {
    this.positionChunkButtons(visibleWidth, scrollLeft);
    this.setChunkButtonsVisibility(true);
  }

  private sync(): void {
    const scrollDOM = this.view.scrollDOM;
    const dom = this.view.dom;

    const scrollLeft = scrollDOM.scrollLeft;
    dom.style.setProperty(SCROLL_LEFT_CSS_VAR, formatPx(scrollLeft));
    scrollDOM.style.setProperty(SCROLL_LEFT_CSS_VAR, formatPx(scrollLeft));

    const scrollerStyle = getComputedStyle(scrollDOM);
    const paddingRight = parseFloat(scrollerStyle.paddingRight) || 0;
    const visibleWidth = scrollDOM.clientWidth - paddingRight;
    dom.style.setProperty(VISIBLE_WIDTH_CSS_VAR, formatPx(visibleWidth));
    scrollDOM.style.setProperty(VISIBLE_WIDTH_CSS_VAR, formatPx(visibleWidth));

    const contentWidth = scrollDOM.scrollWidth;
    dom.style.setProperty(CONTENT_WIDTH_CSS_VAR, formatPx(contentWidth));
    scrollDOM.style.setProperty(CONTENT_WIDTH_CSS_VAR, formatPx(contentWidth));

    const gutters = scrollDOM.querySelector('.cm-gutters') as HTMLElement | null;
    const gutterWidth = gutters?.offsetWidth ?? 0;
    dom.style.setProperty(GUTTER_WIDTH_CSS_VAR, formatPx(gutterWidth));
    scrollDOM.style.setProperty(GUTTER_WIDTH_CSS_VAR, formatPx(gutterWidth));

    this.syncOverflow(scrollDOM);
    this.updateCustomScrollbar();

    if (!this.resizeDebounceTimer) {
      this.positionChunkButtons(visibleWidth, scrollLeft);
    }
  }

  private positionChunkButtons(visibleWidth: number, scrollLeft: number): void {
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
      if (!chunk) continue;
      activeChunks.add(btn);

      const btnEl = btn as HTMLElement;
      const chunkRect = chunk.getBoundingClientRect();

      const targetButtonRight = scrollerRect.left + visibleWidth - gap;
      const offset = Math.max(0, chunkRect.right - targetButtonRight);

      const offsetKey = `${offset}px`;

      if (this.lastChunkPositions.get(btn) === offsetKey) continue;
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

export const scrollLeftSyncExtension = ViewPlugin.fromClass(ScrollLeftSyncPlugin);
