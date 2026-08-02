import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MiniDatePicker } from './MiniDatePicker';

const mockOnBoundary = vi.fn();

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      gitVisDatePickerPrevYear: 'Previous Year',
      gitVisDatePickerNextYear: 'Next Year',
      gitVisDatePickerPrevMonth: 'Previous Month',
      gitVisDatePickerNextMonth: 'Next Month',
      gitVisDatePickerSun: 'Sun',
      gitVisDatePickerMon: 'Mon',
      gitVisDatePickerTue: 'Tue',
      gitVisDatePickerWed: 'Wed',
      gitVisDatePickerThu: 'Thu',
      gitVisDatePickerFri: 'Fri',
      gitVisDatePickerSat: 'Sat',
      close: 'Close',
    },
    locale: 'en-US',
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MiniDatePicker year bounds', () => {
  it('blocks prev year button at min year', () => {
    render(
      <MiniDatePicker
        value="2025-06-15"
        onChange={vi.fn()}
        onClose={vi.fn()}
        yearBounds={{ min: 2025, max: 2026 }}
        onBoundary={mockOnBoundary}
      />,
    );
    const prevYearBtn = screen.getByRole('button', { name: 'Previous Year' });
    fireEvent.click(prevYearBtn);
    expect(mockOnBoundary).toHaveBeenCalledWith('earliest');
  });

  it('blocks next year button at max year', () => {
    render(
      <MiniDatePicker
        value="2026-06-15"
        onChange={vi.fn()}
        onClose={vi.fn()}
        yearBounds={{ min: 2025, max: 2026 }}
        onBoundary={mockOnBoundary}
      />,
    );
    const nextYearBtn = screen.getByRole('button', { name: 'Next Year' });
    fireEvent.click(nextYearBtn);
    expect(mockOnBoundary).toHaveBeenCalledWith('latest');
  });

  it('allows prev year within bounds', () => {
    const onChange = vi.fn();
    render(
      <MiniDatePicker
        value="2026-06-15"
        onChange={onChange}
        onClose={vi.fn()}
        yearBounds={{ min: 2025, max: 2026 }}
        onBoundary={mockOnBoundary}
      />,
    );
    const prevYearBtn = screen.getByRole('button', { name: 'Previous Year' });
    fireEvent.click(prevYearBtn);
    const day15 = screen.getByText('15');
    fireEvent.click(day15);
    expect(onChange).toHaveBeenCalledWith('2025-06-15');
    expect(mockOnBoundary).not.toHaveBeenCalled();
  });
});

describe('MiniDatePicker nav icons', () => {
  it('renders double-left chevrons in the prev year button', () => {
    render(<MiniDatePicker value="2026-06-15" onChange={vi.fn()} onClose={vi.fn()} />);
    const btn = screen.getByRole('button', { name: 'Previous Year' });
    const paths = btn.querySelectorAll('path');
    expect(paths.length).toBe(2);
    expect(paths[0]?.getAttribute('d')).toBe('M11 6L5 12L11 18');
    expect(paths[1]?.getAttribute('d')).toBe('M19 6L13 12L19 18');
  });

  it('renders double-right chevrons in the next year button', () => {
    render(<MiniDatePicker value="2026-06-15" onChange={vi.fn()} onClose={vi.fn()} />);
    const btn = screen.getByRole('button', { name: 'Next Year' });
    const paths = btn.querySelectorAll('path');
    expect(paths.length).toBe(2);
    expect(paths[0]?.getAttribute('d')).toBe('M13 6L19 12L13 18');
    expect(paths[1]?.getAttribute('d')).toBe('M5 6L11 12L5 18');
  });

  it('renders single left chevron in the prev month button', () => {
    render(<MiniDatePicker value="2026-06-15" onChange={vi.fn()} onClose={vi.fn()} />);
    const btn = screen.getByRole('button', { name: 'Previous Month' });
    const path = btn.querySelector('path');
    expect(path?.getAttribute('d')).toBe('M14 7L9 12L14 17');
  });

  it('renders single right chevron in the next month button', () => {
    render(<MiniDatePicker value="2026-06-15" onChange={vi.fn()} onClose={vi.fn()} />);
    const btn = screen.getByRole('button', { name: 'Next Month' });
    const path = btn.querySelector('path');
    expect(path?.getAttribute('d')).toBe('M10 17L15 12L10 7');
  });

  it('renders the nav icons with a 1.5 stroke width', () => {
    render(<MiniDatePicker value="2026-06-15" onChange={vi.fn()} onClose={vi.fn()} />);
    const btn = screen.getByRole('button', { name: 'Previous Year' });
    const svg = btn.querySelector('svg');
    expect(svg?.getAttribute('stroke-width')).toBe('1.5');
  });
});
