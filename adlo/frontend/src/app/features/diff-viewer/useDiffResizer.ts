import type { MergeView } from '@codemirror/merge';

export const SAVED_RATIO_KEY = 'adl-diff-resizer-ratio';
export const MIN_WIDTH = 200;

const RESIZER_WIDTH = 6;
const DEFAULT_RATIO = 0.5;

const noop = () => {};

export function setupDiffResizer(mv: MergeView): () => void {
  const editorsContainer = mv.dom.querySelector<HTMLElement>('.cm-mergeViewEditors');
  const wrapperB = mv.b.dom?.parentNode as HTMLElement | null;

  if (!editorsContainer || !wrapperB || !editorsContainer.contains(wrapperB)) {
    return noop;
  }

  const wrapperA = mv.a.dom.parentNode as HTMLElement;
  const resizerEl = document.createElement('div');
  resizerEl.className = 'adl-cm-diff-resizer';
  editorsContainer.insertBefore(resizerEl, wrapperB);

  let ratio = parseFloat(localStorage.getItem(SAVED_RATIO_KEY) ?? String(DEFAULT_RATIO));
  if (Number.isNaN(ratio) || ratio <= 0 || ratio >= 1) {
    ratio = DEFAULT_RATIO;
  }

  const applyRatio = (totalWidth: number) => {
    const avail = totalWidth - RESIZER_WIDTH;
    const widthA = Math.max(MIN_WIDTH, Math.min(avail - MIN_WIDTH, avail * ratio));
    wrapperA.style.flex = 'none';
    wrapperA.style.width = `${widthA}px`;
    wrapperB.style.flex = '1 1 0';
    wrapperB.style.width = 'auto';
  };

  const applyCurrentRatio = () => {
    applyRatio(editorsContainer.offsetWidth);
  };

  applyCurrentRatio();

  const startResize = (clientX: number) => {
    const startX = clientX;
    const startWidthA = wrapperA.offsetWidth;
    const totalWidth = editorsContainer.offsetWidth;

    resizerEl.classList.add('adl-cm-diff-resizer--dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (currentX: number) => {
      const deltaX = currentX - startX;
      const avail = totalWidth - RESIZER_WIDTH;
      const newWidthA = Math.max(MIN_WIDTH, Math.min(avail - MIN_WIDTH, startWidthA + deltaX));
      ratio = newWidthA / avail;
      localStorage.setItem(SAVED_RATIO_KEY, ratio.toString());
      wrapperA.style.flex = 'none';
      wrapperA.style.width = `${newWidthA}px`;
      wrapperB.style.flex = '1 1 0';
      wrapperB.style.width = 'auto';
    };

    const onEnd = () => {
      resizerEl.classList.remove('adl-cm-diff-resizer--dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };

    const onMouseMove = (moveEvent: MouseEvent) => {
      onMove(moveEvent.clientX);
    };
    const onMouseUp = () => onEnd();

    const onTouchMove = (touchEvent: TouchEvent) => {
      onMove(touchEvent.touches[0].clientX);
    };
    const onTouchEnd = () => onEnd();

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
  };

  const onResizerMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    startResize(e.clientX);
  };

  const onResizerTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    startResize(e.touches[0].clientX);
  };

  resizerEl.addEventListener('mousedown', onResizerMouseDown);
  resizerEl.addEventListener('touchstart', onResizerTouchStart, { passive: false });

  const resizeObserver = new ResizeObserver(applyCurrentRatio);
  resizeObserver.observe(editorsContainer);

  return () => {
    resizerEl.removeEventListener('mousedown', onResizerMouseDown);
    resizerEl.removeEventListener('touchstart', onResizerTouchStart);
    resizeObserver.disconnect();
  };
}
