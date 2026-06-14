import { type EditorView } from '@codemirror/view';

const HSCROLL_CLASS = 'adl-cm-hscroll';
const HSCROLL_VISIBLE_CLASS = 'is-visible';
const HSCROLL_DRAGGING_CLASS = 'is-dragging';
const HSCROLL_DOT_OFFSET_VAR = '--adl-hscroll-dot-offset';
const THUMB_MIN_WIDTH = 40;

export class HorizontalScrollManager {
  hscrollEl: HTMLElement | null = null;
  hscrollThumb: HTMLElement | null = null;
  isDragging = false;
  isPointerDown = false;
  dragStartX = 0;
  dragTrackLeft = 0;
  dragTrackWidth = 0;
  dragContentWidth = 0;
  dragVisibleWidth = 0;
  dragThumbWidth = 0;
  dragMaxScrollLeft = 0;
  dragMaxThumbLeft = 0;

  private edgeScrollRafId: number | null = null;
  private edgeScrollDirection = 0;
  private edgeScrollSpeed = 0;

  onSetChunkButtonsVisible: ((visible: boolean) => void) | null = null;
  onDragEnd: (() => void) | null = null;
  onPointerUpComplete: (() => void) | null = null;
  onEditorScroll: ((scrollDOM: HTMLElement) => void) | null = null;

  readonly onThumbPointerDown: (e: PointerEvent) => void;
  readonly onTrackPointerDown: (e: PointerEvent) => void;
  readonly onPointerMove: (e: PointerEvent) => void;
  readonly onPointerUp: (e: PointerEvent) => void;
  readonly onPointerCancel: (e: PointerEvent) => void;
  readonly onWheel: (e: WheelEvent) => void;
  readonly onScrollDOMPointerMove: (e: PointerEvent) => void;

  constructor(private readonly view: EditorView) {
    this.onThumbPointerDown = this._onThumbPointerDown.bind(this);
    this.onTrackPointerDown = this._onTrackPointerDown.bind(this);
    this.onPointerMove = this._onPointerMove.bind(this);
    this.onPointerUp = this._onPointerUp.bind(this);
    this.onPointerCancel = this._onPointerCancel.bind(this);
    this.onWheel = this._onWheel.bind(this);
    this.onScrollDOMPointerMove = this._onScrollDOMPointerMove.bind(this);
  }

  createCustomScrollbar(): void {
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

    thumb.addEventListener('pointerdown', this.onThumbPointerDown);
    track.addEventListener('pointerdown', this.onTrackPointerDown);
  }

  destroyCustomScrollbar(): void {
    this.endDrag();
    if (this.hscrollEl) {
      this.hscrollEl.remove();
      this.hscrollEl = null;
      this.hscrollThumb = null;
    }
  }

  updateCustomScrollbar(): void {
    if (!this.hscrollEl || !this.hscrollThumb) {
      return;
    }

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
    if (trackWidth <= 0) {
      return;
    }

    const maxScrollLeft = Math.max(0, scrollWidth - visibleWidth);
    const thumbWidth = Math.max(THUMB_MIN_WIDTH, (visibleWidth / scrollWidth) * trackWidth);
    const maxThumbLeft = trackWidth - thumbWidth;
    const thumbLeft = maxThumbLeft > 0 ? (scrollLeft / maxScrollLeft) * maxThumbLeft : 0;

    this.hscrollThumb.style.width = `${thumbWidth}px`;
    this.hscrollThumb.style.left = `${thumbLeft}px`;
    this.hscrollThumb.style.setProperty(HSCROLL_DOT_OFFSET_VAR, `${thumbWidth / 2 - 3}px`);
  }

  stopEdgeScroll(): void {
    if (this.edgeScrollRafId !== null) {
      cancelAnimationFrame(this.edgeScrollRafId);
      this.edgeScrollRafId = null;
    }
    this.edgeScrollDirection = 0;
    this.edgeScrollSpeed = 0;
  }

  private _onThumbPointerDown(e: PointerEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.isDragging = true;
    const thumbRect = this.hscrollThumb!.getBoundingClientRect();
    this.dragStartX = e.clientX - thumbRect.left;
    this.hscrollThumb!.classList.add(HSCROLL_DRAGGING_CLASS);
    this.cacheDragLayout();
    this.onSetChunkButtonsVisible?.(false);
    this.hscrollThumb!.setPointerCapture(e.pointerId);
    this.hscrollThumb!.addEventListener('pointermove', this.onPointerMove);
    this.hscrollThumb!.addEventListener('pointerup', this.onPointerUp);
    this.hscrollThumb!.addEventListener('pointercancel', this.onPointerCancel);
  }

  private cacheDragLayout(): void {
    if (!this.hscrollEl || !this.hscrollThumb) {
      return;
    }
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

  private _onPointerMove(e: PointerEvent): void {
    if (!this.isDragging || !this.hscrollThumb) {
      return;
    }
    if (this.dragMaxThumbLeft <= 0) {
      return;
    }

    const thumbLeft = Math.max(
      0,
      Math.min(this.dragMaxThumbLeft, e.clientX - this.dragTrackLeft - this.dragStartX)
    );

    const scrollLeft = (thumbLeft / this.dragMaxThumbLeft) * this.dragMaxScrollLeft;
    this.view.scrollDOM.scrollLeft = scrollLeft;

    this.hscrollThumb.style.left = `${thumbLeft}px`;

    this.onEditorScroll?.(this.view.scrollDOM);
  }

  private _onPointerUp(): void {
    if (!this.isDragging) {
      return;
    }
    this.stopEdgeScroll();
    this.endDrag();
    this.onPointerUpComplete?.();
  }

  private _onPointerCancel(): void {
    if (!this.isDragging) {
      return;
    }
    this.endDrag();
  }

  private endDrag(): void {
    this.isDragging = false;
    if (this.hscrollThumb) {
      this.hscrollThumb.classList.remove(HSCROLL_DRAGGING_CLASS);
      this.hscrollThumb.removeEventListener('pointermove', this.onPointerMove);
      this.hscrollThumb.removeEventListener('pointerup', this.onPointerUp);
      this.hscrollThumb.removeEventListener('pointercancel', this.onPointerCancel);
    }
    this.onDragEnd?.();
  }

  private _onTrackPointerDown(e: PointerEvent): void {
    if (e.target === this.hscrollThumb || !this.hscrollEl) {
      return;
    }
    const trackRect = this.hscrollEl.getBoundingClientRect();
    const clickX = e.clientX - trackRect.left;
    const scrollDOM = this.view.scrollDOM;
    const scrollWidth = scrollDOM.scrollWidth;
    const visibleWidth = scrollDOM.clientWidth;
    const maxScrollLeft = Math.max(0, scrollWidth - visibleWidth);
    const ratio = clickX / trackRect.width;
    scrollDOM.scrollLeft = ratio * maxScrollLeft;
  }

  private _onWheel(e: WheelEvent): void {
    const wrapper = this.view.dom.closest('.adl-cm-editor-wrapper, .adl-cm-diff-viewer-wrapper');
    const isNoWordWrap = wrapper?.classList.contains('adl-cm-no-word-wrap');
    if (!isNoWordWrap) {
      return;
    }

    const scrollDOM = this.view.scrollDOM;
    const contentWidth = scrollDOM.scrollWidth;
    const visibleWidth = scrollDOM.clientWidth;
    if (contentWidth <= visibleWidth) {
      return;
    }

    let delta = 0;
    if (e.deltaX !== 0) {
      delta = e.deltaX;
    } else if (e.shiftKey && e.deltaY !== 0) {
      delta = e.deltaY;
    }

    if (delta === 0) {
      return;
    }

    e.preventDefault();
    scrollDOM.scrollLeft += delta;
  }

  private _onScrollDOMPointerMove(e: PointerEvent): void {
    if (document.querySelector('.adl-cm-diff-resizer--dragging')) {
      return;
    }
    if (!(e.buttons & 1)) {
      this.stopEdgeScroll();
      return;
    }
    if (this.isDragging) {
      return;
    }

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
    if (this.edgeScrollRafId !== null) {
      return;
    }
    this.edgeScrollRafId = requestAnimationFrame(this.tickEdgeScroll);
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

    this.onEditorScroll?.(scrollDOM);

    if (this.edgeScrollRafId !== null) {
      this.edgeScrollRafId = requestAnimationFrame(this.tickEdgeScroll);
    }
  };
}
