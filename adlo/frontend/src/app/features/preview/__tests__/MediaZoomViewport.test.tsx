import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MediaZoomViewport } from '../MediaZoomViewport';
import { ZOOM_STEP_BUTTON, clampZoom } from '../mediaZoomLimits';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      mediaZoomIn: 'Zoom in',
      mediaZoomOut: 'Zoom out',
      mediaZoomReset: 'Reset to 100%',
      mediaZoomHint: 'Ctrl + wheel to zoom',
    },
    formatT: (dict: Record<string, string>, key: string) => dict[key] ?? key,
  }),
}));

const SRC = 'http://127.0.0.1:1/workspace/media?path=pic.png&v=1';

function percentText(): string {
  return screen.getByRole('button', { name: /%/u }).textContent ?? '';
}

describe('MediaZoomViewport（Q13–Q15）', () => {
  it('starts at 100% and steps ×1.25 with the capsule buttons', () => {
    render(<MediaZoomViewport kind="image" src={SRC} alt="pic.png" onRenderError={() => {}} />);
    expect(percentText()).toBe('100%');

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(percentText()).toBe('125%');

    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(percentText()).toBe('100%');
  });

  it('resets to 100% when the percentage button is clicked', () => {
    render(<MediaZoomViewport kind="image" src={SRC} alt="pic.png" onRenderError={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(percentText()).toBe('156%');

    fireEvent.click(screen.getByRole('button', { name: /%/u }));
    expect(percentText()).toBe('100%');
  });

  it('zooms only with Ctrl/⌘ + wheel (plain wheel keeps default behaviour)', () => {
    render(<MediaZoomViewport kind="image" src={SRC} alt="pic.png" onRenderError={() => {}} />);
    const viewport = screen.getByTestId('media-zoom-viewport');

    fireEvent.wheel(viewport, { deltaY: -100 });
    expect(percentText()).toBe('100%');

    fireEvent.wheel(viewport, { deltaY: -100, ctrlKey: true });
    expect(percentText()).toBe('110%');
  });

  it('clamps the zoom range to 10%–800% and disables the step buttons at the edges', () => {
    expect(clampZoom(0.001)).toBe(0.1);
    expect(clampZoom(99)).toBe(8);

    render(<MediaZoomViewport kind="image" src={SRC} alt="pic.png" onRenderError={() => {}} />);
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' });
    for (let index = 0; index < 40; index += 1) {
      fireEvent.click(zoomOut);
    }
    expect(percentText()).toBe('10%');
    expect((zoomOut as HTMLButtonElement).disabled).toBe(true);
  });

  it('resets zoom when the file (src) changes', () => {
    const { rerender } = render(
      <MediaZoomViewport kind="image" src={SRC} alt="pic.png" onRenderError={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(percentText()).toBe('125%');

    rerender(
      <MediaZoomViewport
        kind="image"
        src="http://127.0.0.1:1/workspace/media?path=other.png&v=2"
        alt="other.png"
        onRenderError={() => {}}
      />,
    );
    expect(percentText()).toBe('100%');
  });

  it('uses the button step constant for both directions', () => {
    expect(ZOOM_STEP_BUTTON).toBe(1.25);
  });

  it('drag pans the zoomed stage within the rendered media box', () => {
    render(<MediaZoomViewport kind="image" src={SRC} alt="pic.png" onRenderError={() => {}} />);
    const viewport = installLayout({
      viewportWidth: 800,
      viewportHeight: 500,
      contentWidth: 2000,
      contentHeight: 1000,
    });

    // 放大到 >100% 才允许拖拽。
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(offsets().x).toBe(0);

    fireEvent.pointerDown(viewport, { button: 0, clientX: 400, clientY: 250 });
    fireEvent.pointerMove(viewport, { clientX: 300, clientY: 210 });
    fireEvent.pointerUp(viewport);

    const panned = offsets();
    expect(panned.x).toBeCloseTo(-100, 0);
    expect(panned.y).toBeCloseTo(-40, 0);
  });

  it('keeps the pan offset consistent when zooming after a drag (center anchor)', () => {
    render(<MediaZoomViewport kind="image" src={SRC} alt="pic.png" onRenderError={() => {}} />);
    const viewport = installLayout({
      viewportWidth: 800,
      viewportHeight: 500,
      contentWidth: 2000,
      contentHeight: 1000,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.pointerDown(viewport, { button: 0, clientX: 400, clientY: 250 });
    fireEvent.pointerMove(viewport, { clientX: 300, clientY: 210 });
    fireEvent.pointerUp(viewport);
    const before = offsets();

    // 按钮按视区中心缩放：off₂ = off₁ · r（不应丢掉已有平移量）。
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    const after = offsets();
    const ratio = after.zoom / before.zoom;
    expect(after.x).toBeCloseTo(before.x * ratio, 0);
    expect(after.y).toBeCloseTo(before.y * ratio, 0);
  });

  it('does not let a narrow/tall image be panned out of the viewport', () => {
    render(<MediaZoomViewport kind="image" src={SRC} alt="pic.png" onRenderError={() => {}} />);
    const viewport = installLayout({
      viewportWidth: 800,
      viewportHeight: 500,
      contentWidth: 100,
      contentHeight: 3000,
    });
    for (let index = 0; index < 4; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    }
    const zoom = offsets().zoom;

    fireEvent.pointerDown(viewport, { button: 0, clientX: 400, clientY: 250 });
    fireEvent.pointerMove(viewport, { clientX: 4000, clientY: 4100 });
    fireEvent.pointerUp(viewport);

    const panned = offsets();
    // 横向：画面（100×zoom）仍小于视区 800 → 只能居中。
    expect(panned.x).toBe(0);
    // 纵向：最多移动到 (3000·zoom − 500) / 2，不能把画面拖出视区。
    const maxY = (3000 * zoom - 500) / 2;
    expect(panned.y).toBeCloseTo(maxY, 0);
  });

  it('anchors Ctrl+wheel zoom at the pointer and prevents the page zoom', () => {
    render(<MediaZoomViewport kind="image" src={SRC} alt="pic.png" onRenderError={() => {}} />);
    const viewport = installLayout({
      viewportWidth: 800,
      viewportHeight: 500,
      contentWidth: 2000,
      contentHeight: 1000,
      left: 120,
      top: 80,
    });

    // 普通滚轮：不缩放，也不阻止默认滚动。
    expect(fireEvent.wheel(viewport, { deltaY: -100 })).toBe(true);
    expect(percentText()).toBe('100%');

    // Ctrl+滚轮：preventDefault（fireEvent 返回 false）并按指针锚定。
    // 视区原点 (120,80)：锚点 = (600-120, 150-80) = (480,70)，中心 (400,250)。
    expect(
      fireEvent.wheel(viewport, { deltaY: -100, ctrlKey: true, clientX: 600, clientY: 150 }),
    ).toBe(false);
    expect(percentText()).toBe('110%');
    const anchored = offsets();
    expect(anchored.x).toBeCloseTo(-8, 0);
    expect(anchored.y).toBeCloseTo(18, 0);
  });

  it('disables the zoom-in button at 800%', () => {
    render(<MediaZoomViewport kind="image" src={SRC} alt="pic.png" onRenderError={() => {}} />);
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' }) as HTMLButtonElement;
    for (let index = 0; index < 20; index += 1) {
      fireEvent.click(zoomIn);
    }
    expect(percentText()).toBe('800%');
    expect(zoomIn.disabled).toBe(true);
  });
});

/** 在 jsdom 中补齐布局：视区尺寸 + 画面盒子的 `getBoundingClientRect`（随当前 zoom 缩放）。 */
function installLayout(options: {
  viewportWidth: number;
  viewportHeight: number;
  contentWidth: number;
  contentHeight: number;
  /** 视区在页面中的原点（非零才能验证 wheel 锚点减去了 rect 偏移）。 */
  left?: number;
  top?: number;
}) {
  const left = options.left ?? 0;
  const top = options.top ?? 0;
  const viewport = screen.getByTestId('media-zoom-viewport');
  Object.defineProperty(viewport, 'clientWidth', {
    value: options.viewportWidth,
    configurable: true,
  });
  Object.defineProperty(viewport, 'clientHeight', {
    value: options.viewportHeight,
    configurable: true,
  });
  viewport.getBoundingClientRect = () =>
    ({
      left,
      top,
      width: options.viewportWidth,
      height: options.viewportHeight,
    }) as DOMRect;
  Object.assign(viewport, {
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    hasPointerCapture: () => false,
  });

  const image = viewport.querySelector('img') as HTMLImageElement;
  image.getBoundingClientRect = () => {
    const currentZoom = offsets().zoom;
    return {
      left: 0,
      top: 0,
      width: options.contentWidth * currentZoom,
      height: options.contentHeight * currentZoom,
    } as DOMRect;
  };
  return viewport;
}

function offsets(): { x: number; y: number; zoom: number } {
  const stage = document.querySelector('.adl-media-zoom__stage') as HTMLElement;
  const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(
    stage.style.transform,
  );
  if (!match) {
    throw new Error(`unexpected stage transform: ${stage.style.transform}`);
  }
  return { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) };
}
