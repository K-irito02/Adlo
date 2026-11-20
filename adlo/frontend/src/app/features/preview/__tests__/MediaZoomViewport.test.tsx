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
});
