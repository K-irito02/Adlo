import React, { useCallback, useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { useTCopy } from '@i18n/useTCopy';
import type { TimeRangeState } from '@stores/slices/gitVisSlice';
import { IconCheck, IconChevronLeft, IconChevronRight, REFRESH_ARC_PATH } from '@app/icons';
import { MiniDatePicker } from './MiniDatePicker';
import { resolveRollingRange, resolveTimeRangeForFetch } from './timeRangeUtils';
import { useAppStore } from '@stores/slicedStore';

interface TimeRangeSelectorProps {
  value: TimeRangeState;
  onChange: (range: TimeRangeState) => void | Promise<unknown>;
  mode?: 'preset' | 'year';
  /** Only used when mode='year': bounds for year navigation */
  yearBounds?: { min: number; max: number } | null;
}

export const TimeRangeSelector = React.memo(function TimeRangeSelector({
  value,
  onChange,
  mode = 'preset',
  yearBounds = null,
}: TimeRangeSelectorProps) {
  const { t } = useTCopy();

  const PRESETS: { key: TimeRangeState['preset']; label: string }[] = [
    { key: 'week', label: t.gitVisTimeWeek },
    { key: 'month', label: t.gitVisTimeMonth },
    { key: 'year', label: t.gitVisTimeYear },
    { key: 'all', label: t.gitVisTimeAll },
    { key: 'custom', label: t.gitVisTimeCustom },
  ];

  const [open, setOpen] = useState(false);
  const [activeSubMenuId, setActiveSubMenuId] = useState<string | null>(null);
  const [activeDateField, setActiveDateField] = useState<'since' | 'until' | null>(null);
  const [customSince, setCustomSince] = useState(value.since || '');
  const [customUntil, setCustomUntil] = useState(value.until || '');
  const [hasLastConfirmed, setHasLastConfirmed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastConfirmedRef = useRef<{ since: string; until: string } | null>(null);
  const customSinceRef = useRef(customSince);
  const customUntilRef = useRef(customUntil);

  const updateCustomSince = useCallback((val: string) => {
    setCustomSince(val);
    customSinceRef.current = val;
  }, []);

  const updateCustomUntil = useCallback((val: string) => {
    setCustomUntil(val);
    customUntilRef.current = val;
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveSubMenuId(null);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activeSubMenuId !== 'custom') {
      setActiveDateField(null);
    }
  }, [activeSubMenuId]);

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const getDisplayText = useCallback(() => {
    switch (value.preset) {
      case 'week':
        return t.gitVisTimeWeek;
      case 'month':
        return t.gitVisTimeMonth;
      case 'year':
        return t.gitVisTimeYear;
      case 'all':
        return t.gitVisTimeAll;
      case 'custom': {
        const s = value.since || '?';
        const u = value.until || '?';
        return `${s} ~ ${u}`;
      }
      default:
        return t.gitVisTimeYear;
    }
  }, [value, t]);

  const handlePreset = useCallback(
    (preset: Exclude<TimeRangeState['preset'], 'custom'>) => {
      const resolved = preset === 'all' ? undefined : resolveRollingRange(preset);
      void Promise.resolve(
        onChange({ preset, since: resolved?.since, until: resolved?.until }),
      ).catch(() => {});
      setOpen(false);
    },
    [onChange],
  );

  const showToast = useAppStore((s) => s.showToast);

  const [buttonAnim, setButtonAnim] = useState<'idle' | 'loading' | 'success'>('idle');
  const buttonAnimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonAnimRef: React.MutableRefObject<'idle' | 'loading' | 'success'> = useRef('idle');
  buttonAnimRef.current = buttonAnim;

  useEffect(() => {
    return () => {
      if (buttonAnimTimerRef.current) {
        clearTimeout(buttonAnimTimerRef.current);
      }
    };
  }, []);

  const triggerLoadThenSuccess = useCallback(async (action: () => unknown) => {
    if (buttonAnimRef.current !== 'idle') {
      return;
    }
    setButtonAnim('loading');
    try {
      const result = action();
      if (result instanceof Promise) {
        await result;
      }
      setButtonAnim('success');
      buttonAnimTimerRef.current = setTimeout(() => setButtonAnim('idle'), 800);
    } catch {
      // Refresh failed — reset the button so the user can retry.
      setButtonAnim('idle');
    }
  }, []);

  const handleStep = useCallback(
    (direction: -1 | 1) => {
      if (!value.since || !value.until) {
        return;
      }
      const resolvedAnchor = resolveTimeRangeForFetch(value);
      const until = new Date(resolvedAnchor.until as string);
      const since = new Date(resolvedAnchor.since as string);
      const rangeMs = until.getTime() - since.getTime();
      const newUntil = new Date(until.getTime() + direction * rangeMs);
      const newSince = new Date(since.getTime() + direction * rangeMs);
      // Date-only strings parse as UTC midnight and the step offset is a whole
      // number of days, so toISOString() round-trips the same UTC date. Must NOT
      // use local field formatting here: in a negative-offset timezone it would
      // shift UTC midnight back to the previous local day.
      const newSinceStr = newSince.toISOString().substring(0, 10);
      const newUntilStr = newUntil.toISOString().substring(0, 10);
      if (yearBounds) {
        const newSinceYear = parseInt(newSinceStr.substring(0, 4), 10);
        const newUntilYear = parseInt(newUntilStr.substring(0, 4), 10);
        if (newSinceYear < yearBounds.min) {
          showToast(t.gitVisCalendarYearEarliest, 'warning', 'git-vis-year-nav');
          return;
        }
        if (newUntilYear > yearBounds.max) {
          showToast(t.gitVisCalendarYearLatest, 'warning', 'git-vis-year-nav');
          return;
        }
      }
      void Promise.resolve(
        onChange({
          preset: 'custom',
          since: newSinceStr,
          until: newUntilStr,
        }),
      ).catch(() => {});
    },
    [value, onChange, yearBounds, showToast, t],
  );

  const isYearMode = mode === 'year';
  const currentYear = new Date().getFullYear();
  const selectedYear = value.since ? parseInt(value.since.substring(0, 4)) : currentYear;
  const minYear = yearBounds?.min ?? currentYear - 10;
  const maxYear = yearBounds?.max ?? currentYear;

  const yearOptions: number[] = [];
  for (let y = maxYear; y >= minYear; y--) {
    yearOptions.push(y);
  }

  const handleYearChange = useCallback(
    (year: number) => {
      void Promise.resolve(
        onChange({
          preset: 'custom',
          since: `${year}-01-01`,
          until: `${year}-12-31`,
        }),
      ).catch(() => {});
      setOpen(false);
    },
    [onChange],
  );

  const handleMiniDatePickerBoundary = useCallback(
    (type: 'earliest' | 'latest') => {
      showToast(
        type === 'earliest' ? t.gitVisCalendarYearEarliest : t.gitVisCalendarYearLatest,
        'warning',
        'git-vis-year-nav',
      );
    },
    [showToast, t],
  );

  const handleMouseEnterCustom = useCallback(() => {
    clearLeaveTimer();
    if (activeSubMenuId !== 'custom') {
      updateCustomSince(value.since || '');
      updateCustomUntil(value.until || '');
    }
    setActiveSubMenuId('custom');
  }, [clearLeaveTimer, value, activeSubMenuId, updateCustomSince, updateCustomUntil]);

  const handleMouseLeaveCustom = useCallback(() => {
    leaveTimerRef.current = setTimeout(() => {
      setActiveSubMenuId(null);
    }, 200);
  }, []);

  const handleMouseEnterSubCard = useCallback(() => {
    clearLeaveTimer();
  }, [clearLeaveTimer]);

  const handleOpenSincePicker = useCallback(() => {
    setActiveDateField('since');
  }, []);

  const handleOpenUntilPicker = useCallback(() => {
    setActiveDateField('until');
  }, []);

  const handleCustomConfirm = useCallback(() => {
    const since = customSinceRef.current;
    const until = customUntilRef.current;
    if (since && until && since <= until) {
      lastConfirmedRef.current = { since, until };
      setHasLastConfirmed(true);
      triggerLoadThenSuccess(() => onChange({ preset: 'custom', since, until }));
    }
  }, [onChange, triggerLoadThenSuccess]);

  const handleRevert = useCallback(() => {
    const last = lastConfirmedRef.current;
    if (last) {
      updateCustomSince(last.since);
      updateCustomUntil(last.until);
      triggerLoadThenSuccess(() =>
        onChange({ preset: 'custom', since: last.since, until: last.until }),
      );
    }
  }, [onChange, updateCustomSince, updateCustomUntil, triggerLoadThenSuccess]);

  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 12,
      }}
    >
      <button
        type="button"
        className="adl-git-vis__timerange-btn adl-git-vis__timerange-nav"
        onClick={() => {
          if (isYearMode) {
            if (selectedYear <= minYear) {
              showToast(t.gitVisCalendarYearEarliest, 'warning', 'calendar-year-nav');
              return;
            }
            handleYearChange(selectedYear - 1);
          } else {
            handleStep(-1);
          }
        }}
        title={isYearMode ? t.gitVisCalendarYearPrev : t.gitVisTimePrev}
        aria-label={isYearMode ? t.gitVisCalendarYearPrev : t.gitVisTimePrev}
      >
        <IconChevronLeft size={12} strokeWidth={1.5} decorative />
      </button>
      <button
        type="button"
        className="adl-git-vis__timerange-btn adl-git-vis__timerange-label"
        onClick={() => setOpen(!open)}
      >
        {isYearMode ? selectedYear : getDisplayText()}
      </button>
      {open &&
        (isYearMode ? (
          <div className="adl-git-vis__timerange-menu adl-git-vis__year-menu">
            {yearOptions.map((y) => (
              <button
                key={y}
                type="button"
                className={`adl-git-vis__year-menu-item${y === selectedYear ? ' adl-git-vis__year-menu-item--active' : ''}`}
                onClick={() => handleYearChange(y)}
              >
                <span>{y}</span>
                {y === selectedYear && (
                  <span className="adl-git-vis__timerange-menu-check">
                    <IconCheck size={14} decorative />
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="adl-git-vis__timerange-menu">
            {PRESETS.map((p) =>
              p.key === 'custom' ? (
                <div
                  key={p.key}
                  role="menuitem"
                  tabIndex={0}
                  className={`adl-git-vis__timerange-menu-item adl-git-vis__timerange-menu-item--has-sub${value.preset === 'custom' ? ' adl-git-vis__timerange-menu-item--active' : ''}`}
                  onMouseEnter={handleMouseEnterCustom}
                  onMouseLeave={handleMouseLeaveCustom}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveSubMenuId(activeSubMenuId === 'custom' ? null : 'custom');
                    }
                  }}
                >
                  <span>{p.label}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {value.preset === 'custom' && (
                      <span className="adl-git-vis__timerange-menu-check">
                        <IconCheck size={14} decorative />
                      </span>
                    )}
                    <IconChevronRight size={12} strokeWidth={1.5} decorative />
                  </span>
                  {activeSubMenuId === 'custom' && (
                    <div
                      className="adl-git-vis__timerange-subcard"
                      onMouseEnter={handleMouseEnterSubCard}
                    >
                      <div className="adl-git-vis__timerange-subcard-row">
                        <div className="adl-git-vis__timerange-subcard-field">
                          <span className="adl-git-vis__timerange-subcard-field-label">
                            {t.gitVisTimeStartDate}
                          </span>
                          <input
                            type="text"
                            className="adl-git-vis__timerange-date-input"
                            value={customSince || ''}
                            onChange={(e) => updateCustomSince(e.target.value)}
                            onFocus={handleOpenSincePicker}
                            placeholder={t.gitVisTimeSelectDate}
                          />
                        </div>
                        <div className="adl-git-vis__timerange-subcard-field">
                          <span className="adl-git-vis__timerange-subcard-field-label">
                            {t.gitVisTimeEndDate}
                          </span>
                          <input
                            type="text"
                            className="adl-git-vis__timerange-date-input"
                            value={customUntil || ''}
                            onChange={(e) => updateCustomUntil(e.target.value)}
                            onFocus={handleOpenUntilPicker}
                            placeholder={t.gitVisTimeSelectDate}
                          />
                        </div>
                        <div className="adl-git-vis__timerange-subcard-actions">
                          <button
                            type="button"
                            className="adl-git-vis__timerange-subcard-btn adl-git-vis__timerange-subcard-btn--revert"
                            onClick={handleRevert}
                            disabled={!hasLastConfirmed || buttonAnim === 'loading'}
                          >
                            {t.gitVisTimeRevert}
                          </button>
                          <button
                            type="button"
                            className="adl-git-vis__timerange-subcard-btn adl-git-vis__timerange-subcard-btn--confirm"
                            onClick={handleCustomConfirm}
                            disabled={buttonAnim === 'loading'}
                          >
                            {buttonAnim === 'loading' ? (
                              <motion.span
                                style={{ display: 'inline-flex', alignItems: 'center' }}
                                animate={{ rotate: 360 }}
                                transition={{
                                  repeat: Number.POSITIVE_INFINITY,
                                  duration: 0.8,
                                  ease: 'linear',
                                }}
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d={REFRESH_ARC_PATH} />
                                </svg>
                              </motion.span>
                            ) : buttonAnim === 'success' ? (
                              <IconCheck size={16} decorative />
                            ) : (
                              t.gitVisTimeConfirm
                            )}
                          </button>
                        </div>
                      </div>
                      <div
                        className={`adl-git-vis__date-picker-wrap${activeDateField ? ' is-open' : ''}`}
                      >
                        <MiniDatePicker
                          key={activeDateField || 'hidden'}
                          value={activeDateField === 'since' ? customSince : customUntil}
                          onChange={(date) => {
                            if (activeDateField === 'since') {
                              updateCustomSince(date);
                            } else {
                              updateCustomUntil(date);
                            }
                          }}
                          onClose={() => {
                            setActiveDateField(null);
                          }}
                          yearBounds={yearBounds ?? undefined}
                          onBoundary={handleMiniDatePickerBoundary}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  key={p.key}
                  type="button"
                  className={`adl-git-vis__timerange-menu-item${value.preset === p.key ? ' adl-git-vis__timerange-menu-item--active' : ''}`}
                  onClick={() => handlePreset(p.key as Exclude<TimeRangeState['preset'], 'custom'>)}
                >
                  <span>{p.label}</span>
                  {value.preset === p.key && (
                    <span className="adl-git-vis__timerange-menu-check">
                      <IconCheck size={14} decorative />
                    </span>
                  )}
                </button>
              ),
            )}
          </div>
        ))}
      <button
        type="button"
        className="adl-git-vis__timerange-btn adl-git-vis__timerange-nav"
        onClick={() => {
          if (isYearMode) {
            if (selectedYear >= maxYear) {
              showToast(t.gitVisCalendarYearLatest, 'warning', 'calendar-year-nav');
              return;
            }
            handleYearChange(selectedYear + 1);
          } else {
            handleStep(1);
          }
        }}
        title={isYearMode ? t.gitVisCalendarYearNext : t.gitVisTimeNext}
        aria-label={isYearMode ? t.gitVisCalendarYearNext : t.gitVisTimeNext}
      >
        <IconChevronRight size={12} strokeWidth={1.5} decorative />
      </button>
    </div>
  );
});
