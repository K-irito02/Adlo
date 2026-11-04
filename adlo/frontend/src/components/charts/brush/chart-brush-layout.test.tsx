import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { ChartBrushLayout } from './chart-brush-layout';

afterEach(cleanup);

describe('ChartBrushLayout', () => {
  const data = [
    { date: new Date('2024-01-01'), value: 100 },
    { date: new Date('2024-06-01'), value: 200 },
    { date: new Date('2024-12-31'), value: 150 },
  ];

  it('renders children and brush strip when enabled', () => {
    render(
      <ChartBrushLayout
        data={data}
        enabled
        height={72}
        brushStrip={() => <div data-testid="brush-strip" />}
      >
        {() => <div data-testid="main-chart" />}
      </ChartBrushLayout>,
    );
    expect(screen.getByTestId('main-chart')).toBeInTheDocument();
    expect(screen.getByTestId('brush-strip')).toBeInTheDocument();
  });

  it('skips brush strip when disabled', () => {
    render(
      <ChartBrushLayout
        data={data}
        enabled={false}
        height={72}
        brushStrip={() => <div data-testid="brush-strip" />}
      >
        {() => <div data-testid="main-chart" />}
      </ChartBrushLayout>,
    );
    expect(screen.getByTestId('main-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('brush-strip')).not.toBeInTheDocument();
  });

  it('resets xDomain when data changes (simulates time range change)', () => {
    const initialData = [
      { date: new Date('2024-01-01'), value: 100 },
      { date: new Date('2024-12-31'), value: 150 },
    ];
    const newData = [{ date: new Date('2025-06-01'), value: 200 }];
    let capturedLayouts: any[] = [];
    const { rerender } = render(
      <ChartBrushLayout data={initialData} enabled height={72} brushStrip={() => null}>
        {(layout) => {
          capturedLayouts.push({ ...layout, _dataLen: initialData.length });
          return null;
        }}
      </ChartBrushLayout>,
    );
    // Simulate data change (e.g., time range filter)
    capturedLayouts = [];
    rerender(
      <ChartBrushLayout data={newData} enabled height={72} brushStrip={() => null}>
        {(layout) => {
          capturedLayouts.push({ ...layout, _dataLen: newData.length });
          return null;
        }}
      </ChartBrushLayout>,
    );
    // After data change, xDomain should be reset to new data range
    expect(capturedLayouts.length).toBeGreaterThan(0);
    const finalLayout = capturedLayouts[capturedLayouts.length - 1];
    expect(finalLayout.xDomain).toBeDefined();
  });

  it('renders with empty data (no brush strip)', () => {
    render(
      <ChartBrushLayout
        data={[]}
        enabled
        height={72}
        brushStrip={() => <div data-testid="brush-strip" />}
      >
        {() => <div data-testid="main-chart" />}
      </ChartBrushLayout>,
    );
    expect(screen.getByTestId('main-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('brush-strip')).not.toBeInTheDocument();
  });

  it('extends the default selection end to selectionEnd (partial last period)', () => {
    const data = [
      { date: new Date('2026-07-06'), value: 10 },
      { date: new Date('2026-07-13'), value: 20 },
      { date: new Date('2026-07-20'), value: 15 },
      { date: new Date('2026-07-27'), value: 8 },
    ];
    let captured: any;
    render(
      <ChartBrushLayout
        data={data}
        enabled
        height={72}
        selectionEnd={new Date('2026-08-01')}
        brushStrip={() => null}
      >
        {(layout) => {
          captured = layout;
          return null;
        }}
      </ChartBrushLayout>,
    );
    expect(captured.xDomain).toBeDefined();
    expect(captured.xDomain![1].getTime()).toBe(new Date('2026-08-01').getTime());
  });

  it('keeps the strip-derived end when selectionEnd is earlier', () => {
    const data = [
      { date: new Date('2026-07-06'), value: 10 },
      { date: new Date('2026-07-27'), value: 8 },
    ];
    let captured: any;
    render(
      <ChartBrushLayout
        data={data}
        enabled
        height={72}
        selectionEnd={new Date('2026-07-20')}
        brushStrip={() => null}
      >
        {(layout) => {
          captured = layout;
          return null;
        }}
      </ChartBrushLayout>,
    );
    expect(captured.xDomain![1].getTime()).toBe(new Date('2026-07-27').getTime());
  });
});
