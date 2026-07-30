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

  it('provides xDomain when selection is set', () => {
    let capturedLayout: any;
    render(
      <ChartBrushLayout
        data={data}
        enabled
        height={72}
        brushStrip={() => null}
      >
        {(layout) => {
          capturedLayout = layout;
          return null;
        }}
      </ChartBrushLayout>
    );
    expect(capturedLayout.xDomain).toBeDefined();
    expect(capturedLayout.xDomainSlotCount).toBe(3);
    expect(capturedLayout.brushSelection).toBeDefined();
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
