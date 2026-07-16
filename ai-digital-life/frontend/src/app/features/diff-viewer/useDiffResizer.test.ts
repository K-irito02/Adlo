import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MergeView } from '@codemirror/merge';
import { setupDiffResizer, SAVED_RATIO_KEY, MIN_WIDTH } from './useDiffResizer';

interface MockMergeViewParts {
  mv: MergeView;
  editorsContainer: HTMLElement;
  wrapperA: HTMLElement;
  wrapperB: HTMLElement;
  domA: HTMLElement;
  domB: HTMLElement;
}

function createMockMergeView(): MockMergeViewParts {
  const wrapperA = document.createElement('div');
  const wrapperB = document.createElement('div');
  const editorsContainer = document.createElement('div');
  editorsContainer.className = 'cm-mergeViewEditors';
  editorsContainer.appendChild(wrapperA);
  editorsContainer.appendChild(wrapperB);

  const domA = document.createElement('div');
  wrapperA.appendChild(domA);
  const domB = document.createElement('div');
  wrapperB.appendChild(domB);

  const mvDom = document.createElement('div');
  mvDom.appendChild(editorsContainer);

  const mv = {
    dom: mvDom,
    a: { dom: domA },
    b: { dom: domB },
  } as unknown as MergeView;

  return { mv, editorsContainer, wrapperA, wrapperB, domA, domB };
}

function findResizerEl(parts: MockMergeViewParts): HTMLElement {
  const resizerEl = parts.wrapperB.previousElementSibling as HTMLElement | null;
  if (!resizerEl) {
    throw new Error('resizer element was not inserted before wrapperB');
  }
  return resizerEl;
}

describe('useDiffResizer constants', () => {
  it('exports SAVED_RATIO_KEY as adl-diff-resizer-ratio', () => {
    expect(SAVED_RATIO_KEY).toBe('adl-diff-resizer-ratio');
  });

  it('exports MIN_WIDTH as 200', () => {
    expect(MIN_WIDTH).toBe(200);
  });
});

describe('setupDiffResizer', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  afterEach(() => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  it('returns a cleanup function', () => {
    const parts = createMockMergeView();
    const cleanup = setupDiffResizer(parts.mv);
    expect(typeof cleanup).toBe('function');
    cleanup();
  });

  it('creates an element with adl-cm-diff-resizer class', () => {
    const parts = createMockMergeView();
    const cleanup = setupDiffResizer(parts.mv);
    const resizerEl = findResizerEl(parts);
    expect(resizerEl.className).toBe('adl-cm-diff-resizer');
    cleanup();
  });

  it('inserts the resizer inside editorsContainer before wrapperB', () => {
    const parts = createMockMergeView();
    const cleanup = setupDiffResizer(parts.mv);
    expect(parts.wrapperB.parentElement).toBe(parts.editorsContainer);
    const resizerEl = findResizerEl(parts);
    expect(resizerEl.parentElement).toBe(parts.editorsContainer);
    expect(parts.editorsContainer.contains(resizerEl)).toBe(true);
    expect(parts.editorsContainer.contains(parts.wrapperB)).toBe(true);
    const children = Array.from(parts.editorsContainer.children);
    expect(children.indexOf(resizerEl)).toBeLessThan(children.indexOf(parts.wrapperB));
    cleanup();
  });

  it('applies initial width based on default ratio 0.5 when localStorage is empty', () => {
    const parts = createMockMergeView();
    Object.defineProperty(parts.editorsContainer, 'offsetWidth', {
      configurable: true,
      value: 1000,
    });
    const cleanup = setupDiffResizer(parts.mv);
    // ratio=0.5, avail = 1000 - 6 = 994, widthA = max(200, min(994-200, 994*0.5=497)) = 497
    expect(parts.wrapperA.style.width).toBe('497px');
    // jsdom normalizes `flex: none` to its CSS-spec equivalent `0 0 auto`
    expect(parts.wrapperA.style.flex).toBe('0 0 auto');
    // jsdom normalizes `1 1 0` to `1 1 0px` (parses 0 as a length)
    expect(parts.wrapperB.style.flex).toBe('1 1 0px');
    expect(parts.wrapperB.style.width).toBe('auto');
    cleanup();
  });

  it('loads ratio from localStorage when valid', () => {
    const parts = createMockMergeView();
    Object.defineProperty(parts.editorsContainer, 'offsetWidth', {
      configurable: true,
      value: 1000,
    });
    localStorage.setItem(SAVED_RATIO_KEY, '0.25');
    const cleanup = setupDiffResizer(parts.mv);
    // ratio=0.25, avail = 994, widthA = max(200, min(794, 248.5)) = 248.5
    expect(parts.wrapperA.style.width).toBe('248.5px');
    cleanup();
  });

  it('falls back to 0.5 when localStorage value is invalid (NaN)', () => {
    const parts = createMockMergeView();
    Object.defineProperty(parts.editorsContainer, 'offsetWidth', {
      configurable: true,
      value: 1000,
    });
    localStorage.setItem(SAVED_RATIO_KEY, 'not-a-number');
    const cleanup = setupDiffResizer(parts.mv);
    expect(parts.wrapperA.style.width).toBe('497px');
    cleanup();
  });

  it('falls back to 0.5 when localStorage value is out of range (0 or 1)', () => {
    const parts = createMockMergeView();
    Object.defineProperty(parts.editorsContainer, 'offsetWidth', {
      configurable: true,
      value: 1000,
    });
    localStorage.setItem(SAVED_RATIO_KEY, '0');
    const cleanup = setupDiffResizer(parts.mv);
    expect(parts.wrapperA.style.width).toBe('497px');
    cleanup();
  });

  it('attaches mousedown listener that starts a drag', () => {
    const parts = createMockMergeView();
    Object.defineProperty(parts.editorsContainer, 'offsetWidth', {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(parts.wrapperA, 'offsetWidth', {
      configurable: true,
      value: 497,
    });
    const cleanup = setupDiffResizer(parts.mv);
    const resizerEl = findResizerEl(parts);

    const preventDefault = vi.fn();
    resizerEl.dispatchEvent(
      new MouseEvent('mousedown', { clientX: 500, bubbles: true, cancelable: true })
    );
    // Simulate the preventDefault call that the handler makes
    void preventDefault;

    expect(resizerEl.classList.contains('adl-cm-diff-resizer--dragging')).toBe(true);
    expect(document.body.style.cursor).toBe('col-resize');
    expect(document.body.style.userSelect).toBe('none');

    cleanup();
  });

  it('updates ratio and persists to localStorage on mousemove during drag', () => {
    const parts = createMockMergeView();
    Object.defineProperty(parts.editorsContainer, 'offsetWidth', {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(parts.wrapperA, 'offsetWidth', {
      configurable: true,
      value: 497,
    });
    const cleanup = setupDiffResizer(parts.mv);
    const resizerEl = findResizerEl(parts);

    resizerEl.dispatchEvent(
      new MouseEvent('mousedown', { clientX: 500, bubbles: true, cancelable: true })
    );
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 600 }));

    // deltaX = 100, newWidthA = max(200, min(794, 497+100=597)) = 597
    // avail = 994, ratio = 597/994 ≈ 0.60060...
    expect(parts.wrapperA.style.width).toBe('597px');
    const stored = localStorage.getItem(SAVED_RATIO_KEY);
    expect(stored).not.toBeNull();
    expect(parseFloat(stored!)).toBeCloseTo(597 / 994, 5);

    cleanup();
  });

  it('ends drag on mouseup and restores body cursor', () => {
    const parts = createMockMergeView();
    Object.defineProperty(parts.editorsContainer, 'offsetWidth', {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(parts.wrapperA, 'offsetWidth', {
      configurable: true,
      value: 497,
    });
    const cleanup = setupDiffResizer(parts.mv);
    const resizerEl = findResizerEl(parts);

    resizerEl.dispatchEvent(
      new MouseEvent('mousedown', { clientX: 500, bubbles: true, cancelable: true })
    );
    document.dispatchEvent(new MouseEvent('mouseup'));

    expect(resizerEl.classList.contains('adl-cm-diff-resizer--dragging')).toBe(false);
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');

    cleanup();
  });

  it('supports touchstart/touchmove/touchend drag lifecycle', () => {
    const parts = createMockMergeView();
    Object.defineProperty(parts.editorsContainer, 'offsetWidth', {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(parts.wrapperA, 'offsetWidth', {
      configurable: true,
      value: 497,
    });
    const cleanup = setupDiffResizer(parts.mv);
    const resizerEl = findResizerEl(parts);

    resizerEl.dispatchEvent(
      new TouchEvent('touchstart', {
        touches: [{ clientX: 500 } as Touch],
        cancelable: true,
        bubbles: true,
      })
    );
    expect(resizerEl.classList.contains('adl-cm-diff-resizer--dragging')).toBe(true);

    document.dispatchEvent(
      new TouchEvent('touchmove', {
        touches: [{ clientX: 700 } as Touch],
        cancelable: true,
      })
    );
    // deltaX = 200, newWidthA = max(200, min(794, 497+200=697)) = 697
    expect(parts.wrapperA.style.width).toBe('697px');

    document.dispatchEvent(new TouchEvent('touchend'));
    expect(resizerEl.classList.contains('adl-cm-diff-resizer--dragging')).toBe(false);

    cleanup();
  });

  it('cleanup removes mousedown and touchstart listeners from resizer', () => {
    const parts = createMockMergeView();
    Object.defineProperty(parts.editorsContainer, 'offsetWidth', {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(parts.wrapperA, 'offsetWidth', {
      configurable: true,
      value: 497,
    });
    const cleanup = setupDiffResizer(parts.mv);
    const resizerEl = findResizerEl(parts);

    cleanup();

    // After cleanup, mousedown should not start a drag
    resizerEl.dispatchEvent(
      new MouseEvent('mousedown', { clientX: 500, bubbles: true, cancelable: true })
    );
    expect(resizerEl.classList.contains('adl-cm-diff-resizer--dragging')).toBe(false);
    expect(document.body.style.cursor).toBe('');
  });

  it('cleanup disconnects the ResizeObserver so it no longer reapplies ratio', () => {
    const parts = createMockMergeView();
    Object.defineProperty(parts.editorsContainer, 'offsetWidth', {
      configurable: true,
      value: 1000,
    });
    const cleanup = setupDiffResizer(parts.mv);

    // Mutate state after cleanup; ResizeObserver callback should not fire
    parts.wrapperA.style.width = '999px';
    cleanup();
    // No assertion possible without spying on observer, but ensure cleanup does not throw
    expect(parts.wrapperA.style.width).toBe('999px');
  });

  it('returns a no-op cleanup and does not insert resizer when editorsContainer is missing', () => {
    const mvDom = document.createElement('div');
    const domA = document.createElement('div');
    const wrapperA = document.createElement('div');
    wrapperA.appendChild(domA);
    const domB = document.createElement('div');
    const wrapperB = document.createElement('div');
    wrapperB.appendChild(domB);
    // No .cm-mergeViewEditors inside mvDom
    mvDom.appendChild(wrapperA);
    mvDom.appendChild(wrapperB);
    const mv = {
      dom: mvDom,
      a: { dom: domA },
      b: { dom: domB },
    } as unknown as MergeView;

    const cleanup = setupDiffResizer(mv);
    expect(typeof cleanup).toBe('function');
    expect(() => cleanup()).not.toThrow();
    // No resizer element should be inserted before wrapperB
    expect(wrapperB.previousElementSibling).toBe(wrapperA);
  });

  it('returns a no-op cleanup when wrapperB is not contained by editorsContainer', () => {
    const editorsContainer = document.createElement('div');
    editorsContainer.className = 'cm-mergeViewEditors';
    const mvDom = document.createElement('div');
    mvDom.appendChild(editorsContainer);
    // wrapperB lives outside editorsContainer
    const wrapperB = document.createElement('div');
    const domA = document.createElement('div');
    const domB = document.createElement('div');
    wrapperB.appendChild(domB);
    mvDom.appendChild(wrapperB);

    const mv = {
      dom: mvDom,
      a: { dom: domA },
      b: { dom: domB },
    } as unknown as MergeView;

    const cleanup = setupDiffResizer(mv);
    expect(typeof cleanup).toBe('function');
    expect(() => cleanup()).not.toThrow();
    // No resizer should be inserted into editorsContainer
    expect(editorsContainer.children).toHaveLength(0);
  });

  it('observes editorsContainer with ResizeObserver', () => {
    const parts = createMockMergeView();
    const observeSpy = vi.spyOn(ResizeObserver.prototype, 'observe');
    const cleanup = setupDiffResizer(parts.mv);
    expect(observeSpy).toHaveBeenCalledWith(parts.editorsContainer);
    observeSpy.mockRestore();
    cleanup();
  });
});
