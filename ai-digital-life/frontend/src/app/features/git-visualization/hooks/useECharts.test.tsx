import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { useECharts } from './useECharts';
import { init } from '../echartsSetup';

vi.mock('echarts/core', () => ({
  init: vi.fn(() => ({
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  })),
  use: vi.fn(),
}));

function TestComponent({ option }: { option: Record<string, unknown> }) {
  const ref = useECharts(option as never);
  return <div ref={ref} style={{ width: 400, height: 300 }} data-testid="chart-container" />;
}

describe('useECharts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('initializes chart on mount', () => {
    render(<TestComponent option={{ title: { text: 'Test' } }} />);
    expect(init).toHaveBeenCalled();
  });

  it('disposes chart on unmount', () => {
    const { unmount } = render(<TestComponent option={{}} />);
    const initCall = vi.mocked(init).mock.results[0]?.value as
      | { dispose: ReturnType<typeof vi.fn> }
      | undefined;
    unmount();
    expect(initCall?.dispose).toHaveBeenCalled();
  });

  it('updates option when option changes', () => {
    const { rerender } = render(<TestComponent option={{ title: { text: 'A' } }} />);
    const chartInstance = vi.mocked(init).mock.results[0]?.value as
      | { setOption: ReturnType<typeof vi.fn> }
      | undefined;
    const initialCallCount = chartInstance?.setOption.mock.calls.length ?? 0;

    rerender(<TestComponent option={{ title: { text: 'B' } }} />);
    expect(chartInstance?.setOption.mock.calls.length).toBeGreaterThan(initialCallCount);
  });
});
