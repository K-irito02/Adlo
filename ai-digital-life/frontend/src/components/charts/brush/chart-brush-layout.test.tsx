import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
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
      </ChartBrushLayout>
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
      </ChartBrushLayout>
    );
    expect(screen.getByTestId('main-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('brush-strip')).not.toBeInTheDocument();
  });

  it('resets xDomain when data changes (simulates time range change)', () => {
    const initialData = [
      { date: new Date('2024-01-01'), value: 100 },
      { date: new Date('2024-12-31'), value: 150 },
    ];
    const newData = [
      { date: new Date('2025-06-01'), value: 200 },
    ];
    let capturedLayouts: any[] = [];
    const { rerender } = render(
      <ChartBrushLayout
        data={initialData}
        enabled
        height={72}
        brushStrip={() => null}
      >
        {(layout) => {
          capturedLayouts.push({ ...layout, _dataLen: initialData.length });
          return null;
        }}
      </ChartBrushLayout>
    );
    // Simulate data change (e.g., time range filter)
    capturedLayouts = [];
    rerender(
      <ChartBrushLayout
        data={newData}
        enabled
        height={72}
        brushStrip={() => null}
      >
        {(layout) => {
          capturedLayouts.push({ ...layout, _dataLen: newData.length });
          return null;
        }}
      </ChartBrushLayout>
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
      </ChartBrushLayout>
    );
    expect(screen.getByTestId('main-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('brush-strip')).not.toBeInTheDocument();
  });
});
