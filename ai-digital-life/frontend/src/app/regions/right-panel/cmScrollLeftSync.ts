import { ViewPlugin, type EditorView, type PluginValue, type ViewUpdate } from "@codemirror/view";

const SCROLL_LEFT_CSS_VAR = "--adl-editor-scroll-left";
const VISIBLE_WIDTH_CSS_VAR = "--adl-editor-visible-width";
const CONTENT_WIDTH_CSS_VAR = "--adl-editor-content-width";
const NO_HSCROLL_CLASS = "adl-cm-scroller--no-hscroll";

function formatPx(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0px";
  return `${value}px`;
}

class ScrollLeftSyncPlugin implements PluginValue {
  private frame = 0;
  private lastOverflowX: string | null = null;
  private lastChunkPositions = new Map<Element, string>();

  constructor(private readonly view: EditorView) {
    this.sync();
    this.view.scrollDOM.addEventListener("scroll", this.handleScroll, { passive: true });
  }

  update(update: ViewUpdate): void {
    if (update.geometryChanged || update.viewportChanged || update.docChanged) {
      this.schedule();
    }
  }

  destroy(): void {
    this.view.scrollDOM.removeEventListener("scroll", this.handleScroll);
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    const dom = this.view.dom;
    const scrollDOM = this.view.scrollDOM;
    for (const prop of [SCROLL_LEFT_CSS_VAR, VISIBLE_WIDTH_CSS_VAR, CONTENT_WIDTH_CSS_VAR]) {
      dom.style.removeProperty(prop);
      scrollDOM.style.removeProperty(prop);
    }
    scrollDOM.classList.remove(NO_HSCROLL_CLASS);
    this.lastOverflowX = null;
    this.clearChunkButtonStyles();
  }

  private handleScroll = (): void => {
    this.schedule();
  };

  private schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.sync();
    });
  }

  private clearChunkButtonStyles(): void {
    const buttons = this.view.dom.querySelectorAll(".cm-chunkButtons");
    for (const btn of buttons) {
      const s = (btn as HTMLElement).style;
      s.removeProperty("position");
      s.removeProperty("top");
      s.removeProperty("transform");
      s.removeProperty("right");
      s.removeProperty("inset-inline-end");
    }
    this.lastChunkPositions.clear();
  }

  private sync(): void {
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

    const contentWidth = contentDOM.offsetWidth;
    dom.style.setProperty(CONTENT_WIDTH_CSS_VAR, formatPx(contentWidth));
    scrollDOM.style.setProperty(CONTENT_WIDTH_CSS_VAR, formatPx(contentWidth));

    const hasHorizontalOverflow = contentWidth > visibleWidth + 1;
    const targetOverflowX = hasHorizontalOverflow ? "auto" : "hidden";
    if (this.lastOverflowX !== targetOverflowX) {
      this.lastOverflowX = targetOverflowX;
      if (hasHorizontalOverflow) {
        scrollDOM.classList.remove(NO_HSCROLL_CLASS);
      } else {
        scrollDOM.classList.add(NO_HSCROLL_CLASS);
      }
    }

    this.positionChunkButtons(visibleWidth, scrollLeft);
  }

  private positionChunkButtons(visibleWidth: number, scrollLeft: number): void {
    const isNoWrap = this.view.dom.closest(".adl-cm-no-word-wrap") !== null;
    const isInlineDiff = this.view.dom.closest(".adl-cm-diff-viewer--inline") !== null;

    const buttons = this.view.dom.querySelectorAll(".cm-deletedChunk .cm-chunkButtons");

    if (!isNoWrap || !isInlineDiff) {
      if (this.lastChunkPositions.size > 0) {
        for (const btn of buttons) {
          const s = (btn as HTMLElement).style;
          s.removeProperty("position");
          s.removeProperty("top");
          s.removeProperty("transform");
          s.removeProperty("right");
          s.removeProperty("inset-inline-end");
          s.removeProperty("left");
          s.removeProperty("margin-top");
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

      // Horizontal: compute right-offset so button pins to scroller's right edge
      const targetButtonRight = scrollerRect.left + visibleWidth - gap;
      const offset = Math.max(0, chunkRect.right - targetButtonRight);

      const offsetKey = `${offset}px`;

      if (this.lastChunkPositions.get(btn) === offsetKey) continue;
      this.lastChunkPositions.set(btn, offsetKey);

      // Vertical: position button top edge so its center aligns with line center
      // The chunk (0-height) sits at the line's top edge.
      // Button center = chunkTop + topOffset + btnHeight/2 = chunkTop + lineHeight/2
      // Therefore: topOffset = (lineHeight - btnHeight) / 2
      const btnHeight = btnEl.offsetHeight;
      const topOffset = (lineHeight - btnHeight) / 2;

      const s = btnEl.style;
      s.setProperty("position", "absolute", "important");
      s.setProperty("top", `${topOffset}px`, "important");
      s.removeProperty("transform");
      s.removeProperty("margin-top");
      s.setProperty("right", `${offset}px`, "important");
      s.setProperty("inset-inline-end", `${offset}px`, "important");
      s.removeProperty("left");
    }

    for (const [btn] of this.lastChunkPositions) {
      if (!activeChunks.has(btn)) {
        const s = (btn as HTMLElement).style;
        s.removeProperty("position");
        s.removeProperty("top");
        s.removeProperty("transform");
        s.removeProperty("right");
        s.removeProperty("inset-inline-end");
        s.removeProperty("left");
        s.removeProperty("margin-top");
        this.lastChunkPositions.delete(btn);
      }
    }
  }
}

export const scrollLeftSyncExtension = ViewPlugin.fromClass(ScrollLeftSyncPlugin);
