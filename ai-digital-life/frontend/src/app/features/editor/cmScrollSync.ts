import { ViewPlugin, type EditorView, type PluginValue, type ViewUpdate } from '@codemirror/view';
import { HorizontalScrollManager } from './cmHorizontalScroll';
import { ChunkButtonManager } from './cmLintHighlights';

const SCROLL_LEFT_CSS_VAR = '--adl-editor-scroll-left';
const VISIBLE_WIDTH_CSS_VAR = '--adl-editor-visible-width';
const CONTENT_WIDTH_CSS_VAR = '--adl-editor-content-width';
const NO_HSCROLL_CLASS = 'adl-cm-scroller--no-hscroll';
const GUTTER_WIDTH_CSS_VAR = '--adl-editor-gutter-width';

function formatPx(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0px';
  }
  return `${value}px`;
}

class ScrollLeftSyncPlugin implements PluginValue {
  private frame = 0;
  private lastChunkPositions = new Map<Element, string>();
  private resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private isPointerDown = false;
  private hscrollMgr: HorizontalScrollManager;
  private chunkBtnMgr: ChunkButtonManager;

  private boundOnDocumentPointerDown: () => void;
  private boundOnDocumentPointerUp: () => void;
  private boundHandleScroll: () => void;

  constructor(private readonly view: EditorView) {
    this.hscrollMgr = new HorizontalScrollManager(view);
    this.chunkBtnMgr = new ChunkButtonManager(view);

    this.boundOnDocumentPointerDown = this.onDocumentPointerDown.bind(this);
    this.boundOnDocumentPointerUp = this.onDocumentPointerUp.bind(this);
    this.boundHandleScroll = this.handleScroll.bind(this);

    this.hscrollMgr.onSetChunkButtonsVisible = (v) => this.chunkBtnMgr.setChunkButtonsVisibility(v);
    this.hscrollMgr.onDragEnd = () => {
      if (!this.resizeDebounceTimer) {
        const scrollDOM = this.view.scrollDOM;
        const scrollerStyle = getComputedStyle(scrollDOM);
        const paddingRight = parseFloat(scrollerStyle.paddingRight) || 0;
        this.chunkBtnMgr.prepareAndShowChunkButtons(
          scrollDOM.clientWidth - paddingRight,
          scrollDOM.scrollLeft
        );
      }
    };
    this.hscrollMgr.onPointerUpComplete = () => {
      this.schedule();
    };
    this.hscrollMgr.onEditorScroll = (scrollDOM) => {
      const mergeView = scrollDOM.closest('.cm-mergeView');
      if (mergeView) {
        const editors = mergeView.querySelectorAll('.cm-mergeViewEditor .cm-scroller');
        for (const scroller of editors) {
          if (scroller !== scrollDOM) {
            const otherScroll = scroller as HTMLElement;
            const otherMax = Math.max(0, otherScroll.scrollWidth - otherScroll.clientWidth);
            if (otherMax > 0) {
              const scrollLeft = scrollDOM.scrollLeft;
              const maxScrollLeft = Math.max(0, scrollDOM.scrollWidth - scrollDOM.clientWidth);
              const ratio = Math.min(1, scrollLeft / maxScrollLeft);
              otherScroll.scrollLeft = ratio * otherMax;
            }
          }
        }
      }
    };

    this.hscrollMgr.createCustomScrollbar();
    this.syncCssPropsOnly();
    this.schedule();
    this.view.scrollDOM.addEventListener('scroll', this.boundHandleScroll, { passive: true });
    this.view.scrollDOM.addEventListener('wheel', this.hscrollMgr.onWheel, { passive: false });
    this.view.scrollDOM.addEventListener('pointermove', this.hscrollMgr.onScrollDOMPointerMove);
    document.addEventListener('pointerdown', this.boundOnDocumentPointerDown);
    document.addEventListener('pointerup', this.boundOnDocumentPointerUp);
    this.setupResizeObserver();
  }

  private onDocumentPointerDown(): void {
    this.isPointerDown = true;
  }

  private onDocumentPointerUp(): void {
    this.isPointerDown = false;
    this.hscrollMgr.stopEdgeScroll();
    if (this.resizeDebounceTimer !== null) {
      clearTimeout(this.resizeDebounceTimer);
      this.resizeDebounceTimer = null;
      const scrollDOM = this.view.scrollDOM;
      const scrollerStyle = getComputedStyle(scrollDOM);
      const paddingRight = parseFloat(scrollerStyle.paddingRight) || 0;
      this.chunkBtnMgr.prepareAndShowChunkButtons(
        scrollDOM.clientWidth - paddingRight,
        scrollDOM.scrollLeft
      );
    }
  }

  private handleScroll(): void {
    if (this.hscrollMgr.isDragging) {
      return;
    }
    this.schedule();
  }

  private syncCssPropsOnly(): void {
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

  private setupResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    this.resizeObserver = new ResizeObserver(() => {
      this.chunkBtnMgr.setChunkButtonsVisibility(false);
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
      if (this.hscrollMgr.isDragging || this.isPointerDown) {
        return;
      }
      this.resizeDebounceTimer = null;
      const scrollDOM = this.view.scrollDOM;
      const scrollerStyle = getComputedStyle(scrollDOM);
      const paddingRight = parseFloat(scrollerStyle.paddingRight) || 0;
      this.chunkBtnMgr.prepareAndShowChunkButtons(
        scrollDOM.clientWidth - paddingRight,
        scrollDOM.scrollLeft
      );
    }, 100);
  }

  private schedule(): void {
    if (this.frame) {
      return;
    }
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.sync();
    });
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
    this.hscrollMgr.updateCustomScrollbar();

    if (!this.resizeDebounceTimer) {
      this.chunkBtnMgr.prepareAndShowChunkButtons(visibleWidth, scrollLeft);
    }
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
    this.view.scrollDOM.removeEventListener('scroll', this.boundHandleScroll);
    this.view.scrollDOM.removeEventListener('wheel', this.hscrollMgr.onWheel);
    this.view.scrollDOM.removeEventListener('pointermove', this.hscrollMgr.onScrollDOMPointerMove);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    this.hscrollMgr.destroyCustomScrollbar();
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
    this.chunkBtnMgr.clearChunkButtonStyles();
  }
}

export const scrollLeftSyncExtension = ViewPlugin.fromClass(ScrollLeftSyncPlugin);
