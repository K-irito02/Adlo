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
