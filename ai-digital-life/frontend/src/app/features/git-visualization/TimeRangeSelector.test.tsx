import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TimeRangeSelector } from './TimeRangeSelector';
import type { TimeRangeState } from '@stores/slices/gitVisSlice';

const mockShowToast = vi.fn();

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      gitVisCalendarYearPrev: 'Previous Year',
      gitVisCalendarYearNext: 'Next Year',
      gitVisCalendarYearLatest: 'Already the latest year',
      gitVisCalendarYearEarliest: 'Already the earliest year',
      gitVisCalendarSelectYear: 'Select Year',
      gitVisTimePrev: 'Earlier Period',
      gitVisTimeNext: 'Later Period',
      gitVisTimeWeek: 'Past Week',
      gitVisTimeMonth: 'Past Month',
      gitVisTimeYear: 'Past Year',
      gitVisTimeAll: 'All Time',
      gitVisTimeCustom: 'Custom',
      gitVisTimeStartDate: 'Start Date',
      gitVisTimeEndDate: 'End Date',
      gitVisTimeConfirm: 'Confirm',
      gitVisTimeRevert: 'Revert',
      gitVisTimeSelectDate: 'Select',
      gitVisDatePickerSun: 'Sun',
      gitVisDatePickerMon: 'Mon',
      gitVisDatePickerTue: 'Tue',
      gitVisDatePickerWed: 'Wed',
      gitVisDatePickerThu: 'Thu',
      gitVisDatePickerFri: 'Fri',
      gitVisDatePickerSat: 'Sat',
    },
    locale: 'en-US',
  }),
}));

vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get: () => (p: Record<string, unknown>) => {
        const R = require('react');
        const { children, ...rest } = p;
        return R.createElement('div', { className: rest.className, key: rest.key }, children);
      },
    },
  ),
  animate: () => ({ stop: () => {}, then: () => Promise.resolve(), cancel: () => {} }),
  useMotionValue: <T,>(v: T) => ({ get: () => v as number, set: () => {}, stop: () => {} }),
  useTransform: () => ({ get: () => 0, set: () => {}, stop: () => {} }),
  useSpring: () => ({ get: () => 0, set: () => {}, stop: () => {} }),
  useReducedMotion: () => true,
  useAnimation: () => ({ start: () => Promise.resolve(), stop: () => {}, set: () => {} }),
}));

vi.mock('@stores/slicedStore', () => ({
  useAppStore: (selector: any) => {
    const state = {
      showToast: mockShowToast,
      activeWorkspaceTab: 'workspace-1',
      gitVisLoading: {},
    };
    return selector ? selector(state) : state;
  },
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('TimeRangeSelector year mode', () => {
  const baseValue: TimeRangeState = {
    preset: 'custom',
    since: '2025-01-01',
    until: '2025-12-31',
  };

  it('renders year label in year mode', () => {
    const onChange = vi.fn();
    render(
      <TimeRangeSelector
        value={baseValue}
        onChange={onChange}
        mode="year"
        yearBounds={{ min: 2020, max: 2026 }}
      />,
    );
    expect(screen.getByText('2025')).toBeTruthy();
  });

  it('renders preset label in preset mode', () => {
    const onChange = vi.fn();
    const weekValue: TimeRangeState = { preset: 'week', since: '2026-07-18', until: '2026-07-25' };
    render(<TimeRangeSelector value={weekValue} onChange={onChange} mode="preset" />);
    expect(screen.getByText('Past Week')).toBeTruthy();
  });

  it('shows year dropdown when clicking label in year mode', () => {
    const onChange = vi.fn();
    render(
      <TimeRangeSelector
        value={baseValue}
        onChange={onChange}
        mode="year"
        yearBounds={{ min: 2020, max: 2026 }}
      />,
    );
    fireEvent.click(screen.getByText('2025'));
    expect(screen.getByText('2024')).toBeTruthy();
    expect(screen.getByText('2026')).toBeTruthy();
  });

  it('navigates to previous year on left arrow click', () => {
    const onChange = vi.fn();
    render(
      <TimeRangeSelector
        value={baseValue}
        onChange={onChange}
        mode="year"
        yearBounds={{ min: 2020, max: 2026 }}
      />,
    );
    const leftBtn = screen.getByRole('button', { name: 'Previous Year' });
    fireEvent.click(leftBtn);
    expect(onChange).toHaveBeenCalledWith({
      preset: 'custom',
      since: '2024-01-01',
      until: '2024-12-31',
    });
  });

  it('navigates to next year on right arrow click', () => {
    const onChange = vi.fn();
    render(
      <TimeRangeSelector
        value={baseValue}
        onChange={onChange}
        mode="year"
        yearBounds={{ min: 2020, max: 2026 }}
      />,
    );
    const rightBtn = screen.getByRole('button', { name: 'Next Year' });
    fireEvent.click(rightBtn);
    expect(onChange).toHaveBeenCalledWith({
      preset: 'custom',
      since: '2026-01-01',
      until: '2026-12-31',
    });
  });

  it('shows toast when navigating before min year', () => {
    const onChange = vi.fn();
    const minValue: TimeRangeState = {
      preset: 'custom',
      since: '2020-01-01',
      until: '2020-12-31',
    };
    render(
      <TimeRangeSelector
        value={minValue}
        onChange={onChange}
        mode="year"
        yearBounds={{ min: 2020, max: 2026 }}
      />,
    );
    const leftBtn = screen.getByRole('button', { name: 'Previous Year' });
    fireEvent.click(leftBtn);
    expect(mockShowToast).toHaveBeenCalledWith(
      'Already the earliest year',
      'warning',
      'calendar-year-nav',
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows toast when navigating past max year', () => {
    const onChange = vi.fn();
    const maxValue: TimeRangeState = {
      preset: 'custom',
      since: '2026-01-01',
      until: '2026-12-31',
    };
    render(
      <TimeRangeSelector
        value={maxValue}
        onChange={onChange}
        mode="year"
        yearBounds={{ min: 2020, max: 2026 }}
      />,
    );
    const rightBtn = screen.getByRole('button', { name: 'Next Year' });
    fireEvent.click(rightBtn);
    expect(mockShowToast).toHaveBeenCalledWith(
      'Already the latest year',
      'warning',
      'calendar-year-nav',
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('selects a year from dropdown', () => {
    const onChange = vi.fn();
    render(
      <TimeRangeSelector
        value={baseValue}
        onChange={onChange}
        mode="year"
        yearBounds={{ min: 2020, max: 2026 }}
      />,
    );
    fireEvent.click(screen.getByText('2025'));
    fireEvent.click(screen.getByText('2022'));
    expect(onChange).toHaveBeenCalledWith({
      preset: 'custom',
      since: '2022-01-01',
      until: '2022-12-31',
    });
  });
});

describe('TimeRangeSelector preset mode with yearBounds', () => {
  it('blocks step to earlier period before min year and shows toast', () => {
    const onChange = vi.fn();
    const value: TimeRangeState = {
      preset: 'custom',
      since: '2025-01-01',
      until: '2025-02-01',
    };
    render(
      <TimeRangeSelector
        value={value}
        onChange={onChange}
        mode="preset"
        yearBounds={{ min: 2025, max: 2026 }}
      />,
    );
    const leftBtn = screen.getByRole('button', { name: 'Earlier Period' });
    fireEvent.click(leftBtn);
    expect(mockShowToast).toHaveBeenCalledWith(
      'Already the earliest year',
      'warning',
      'git-vis-year-nav',
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('blocks step to later period after max year and shows toast', () => {
    const onChange = vi.fn();
    const value: TimeRangeState = {
      preset: 'custom',
      since: '2026-12-01',
      until: '2026-12-31',
    };
    render(
      <TimeRangeSelector
        value={value}
        onChange={onChange}
        mode="preset"
        yearBounds={{ min: 2025, max: 2026 }}
      />,
    );
    const rightBtn = screen.getByRole('button', { name: 'Later Period' });
    fireEvent.click(rightBtn);
    expect(mockShowToast).toHaveBeenCalledWith(
      'Already the latest year',
      'warning',
      'git-vis-year-nav',
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('allows step within bounds', () => {
    const onChange = vi.fn();
    const value: TimeRangeState = {
      preset: 'custom',
      since: '2025-06-01',
      until: '2025-07-01',
    };
    render(
      <TimeRangeSelector
        value={value}
        onChange={onChange}
        mode="preset"
        yearBounds={{ min: 2025, max: 2026 }}
      />,
    );
    const rightBtn = screen.getByRole('button', { name: 'Later Period' });
    fireEvent.click(rightBtn);
    expect(onChange).toHaveBeenCalled();
  });

  it('re-resolves the rolling anchor before stepping a relative preset', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 3, 12, 0, 0));
    const onChange = vi.fn();
    const value: TimeRangeState = {
      preset: 'week',
      since: '2026-07-10',
      until: '2026-07-17',
    };
    render(<TimeRangeSelector value={value} onChange={onChange} mode="preset" />);
    const rightBtn = screen.getByRole('button', { name: 'Later Period' });
    fireEvent.click(rightBtn);
    vi.useRealTimers();

    expect(onChange).toHaveBeenCalledTimes(1);
    const call = onChange.mock.calls[0][0] as TimeRangeState;
    expect(call.preset).toBe('custom');
    expect(call.since).toMatch(/^2026-08/);
    const rangeMs =
      new Date(`${call.until}T00:00:00`).getTime() - new Date(`${call.since}T00:00:00`).getTime();
    expect(rangeMs).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('TimeRangeSelector nav arrow icons', () => {
  const value: TimeRangeState = {
    preset: 'custom',
    since: '2025-06-01',
    until: '2025-07-01',
  };

  it('renders the left-pointing chevron in the previous-period button', () => {
    const onChange = vi.fn();
    render(<TimeRangeSelector value={value} onChange={onChange} mode="preset" />);
    const leftBtn = screen.getByRole('button', { name: 'Earlier Period' });
    const path = leftBtn.querySelector('path');
    expect(path?.getAttribute('d')).toBe('M14 7L9 12L14 17');
  });

  it('renders the right-pointing chevron in the next-period button', () => {
    const onChange = vi.fn();
    render(<TimeRangeSelector value={value} onChange={onChange} mode="preset" />);
    const rightBtn = screen.getByRole('button', { name: 'Later Period' });
    const path = rightBtn.querySelector('path');
    expect(path?.getAttribute('d')).toBe('M10 17L15 12L10 7');
  });

  it('renders the nav chevrons with a 1.5 stroke width', () => {
    const onChange = vi.fn();
    render(<TimeRangeSelector value={value} onChange={onChange} mode="preset" />);
    const leftBtn = screen.getByRole('button', { name: 'Earlier Period' });
    const svg = leftBtn.querySelector('svg');
    expect(svg?.getAttribute('stroke-width')).toBe('1.5');
  });
});

describe('TimeRangeSelector custom confirm button state', () => {
  const customValue: TimeRangeState = {
    preset: 'custom',
    since: '2026-07-01',
    until: '2026-08-01',
  };

  it('returns the confirm button to idle after a synchronous onChange (not stuck loading)', async () => {
    const onChange = vi.fn();
    render(<TimeRangeSelector value={customValue} onChange={onChange} mode="preset" />);
    fireEvent.click(screen.getByText('2026-07-01 ~ 2026-08-01'));
    fireEvent.mouseEnter(screen.getByText('Custom'));

    const confirmBtn = screen.getByText('Confirm');
    fireEvent.click(confirmBtn);
    expect(onChange).toHaveBeenCalledWith(customValue);

    // The button must not remain stuck in the loading spinner — the label
    // (idle) must come back shortly after a synchronous onChange.
    await waitFor(
      () => {
        expect(screen.getByText('Confirm')).toBeTruthy();
      },
      { timeout: 2000 },
    );
  });

  it('does not disable the confirm button forever after confirm', async () => {
    const onChange = vi.fn();
    render(<TimeRangeSelector value={customValue} onChange={onChange} mode="preset" />);
    fireEvent.click(screen.getByText('2026-07-01 ~ 2026-08-01'));
    fireEvent.mouseEnter(screen.getByText('Custom'));

    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(
      () => {
        const btn = screen.getByText('Confirm').closest('button') as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
      },
      { timeout: 2000 },
    );
  });
});
