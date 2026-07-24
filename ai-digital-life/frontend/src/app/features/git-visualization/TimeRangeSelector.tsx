import React, { useCallback, useState, useRef, useEffect } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import type { TimeRangeState } from '@stores/slices/gitVisSlice';
import { IconCheck, IconChevronRight, IconArrowLeft, IconArrowRight } from '@app/icons';
import { MiniDatePicker } from './MiniDatePicker';

interface TimeRangeSelectorProps {
  value: TimeRangeState;
  onChange: (range: TimeRangeState) => void;
}

export const TimeRangeSelector = React.memo(function TimeRangeSelector({
  value,
  onChange,
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
      const now = new Date();
      now.setHours(23, 59, 59, 999);
      const nowStr = now.toISOString().substring(0, 10);
      let sinceStr: string | undefined;

      switch (preset) {
        case 'week': {
          const d = new Date(now);
          d.setDate(d.getDate() - 7);
          sinceStr = d.toISOString().substring(0, 10);
          break;
        }
        case 'month': {
          const d = new Date(now);
          d.setMonth(d.getMonth() - 1);
          sinceStr = d.toISOString().substring(0, 10);
          break;
        }
        case 'year': {
          const d = new Date(now);
          d.setFullYear(d.getFullYear() - 1);
          sinceStr = d.toISOString().substring(0, 10);
          break;
        }
        case 'all':
        default:
          sinceStr = undefined;
      }
      onChange({ preset, since: sinceStr, until: preset === 'all' ? undefined : nowStr });
      setOpen(false);
    },
    [onChange],
  );

  const handleStep = useCallback(
    (direction: -1 | 1) => {
      if (!value.since || !value.until) {
        return;
      }
      const until = new Date(value.until);
      const since = new Date(value.since);
      const rangeMs = until.getTime() - since.getTime();
      const newUntil = new Date(until.getTime() + direction * rangeMs);
      const newSince = new Date(since.getTime() + direction * rangeMs);
      onChange({
        preset: 'custom',
        since: newSince.toISOString().substring(0, 10),
        until: newUntil.toISOString().substring(0, 10),
      });
    },
    [value, onChange],
  );

  const handleMouseEnterCustom = useCallback(() => {
    clearLeaveTimer();
    if (activeSubMenuId !== 'custom') {
      setCustomSince(value.since || '');
      setCustomUntil(value.until || '');
    }
    setActiveSubMenuId('custom');
  }, [clearLeaveTimer, value, activeSubMenuId]);

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
    if (customSince && customUntil && customSince <= customUntil) {
      lastConfirmedRef.current = { since: customSince, until: customUntil };
      setHasLastConfirmed(true);
      onChange({ preset: 'custom', since: customSince, until: customUntil });
    }
  }, [customSince, customUntil, onChange]);

  const handleRevert = useCallback(() => {
    const last = lastConfirmedRef.current;
    if (last) {
      setCustomSince(last.since);
      setCustomUntil(last.until);
      onChange({ preset: 'custom', since: last.since, until: last.until });
    }
  }, [onChange]);

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
        onClick={() => handleStep(-1)}
        title={t.gitVisTimePrev}
        aria-label={t.gitVisTimePrev}
      >
        <IconArrowLeft size={12} decorative />
      </button>
      <button
        type="button"
        className="adl-git-vis__timerange-btn adl-git-vis__timerange-label"
        onClick={() => setOpen(!open)}
      >
        {getDisplayText()}
      </button>
      {open && (
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
                  <IconChevronRight size={12} decorative />
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
                          onChange={(e) => setCustomSince(e.target.value)}
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
                          onChange={(e) => setCustomUntil(e.target.value)}
                          onFocus={handleOpenUntilPicker}
                          placeholder={t.gitVisTimeSelectDate}
                        />
                      </div>
                      <div className="adl-git-vis__timerange-subcard-actions">
                        <button
                          type="button"
                          className="adl-git-vis__timerange-subcard-btn adl-git-vis__timerange-subcard-btn--revert"
                          onClick={handleRevert}
                          disabled={!hasLastConfirmed}
                        >
                          {t.gitVisTimeRevert}
                        </button>
                        <button
                          type="button"
                          className="adl-git-vis__timerange-subcard-btn adl-git-vis__timerange-subcard-btn--confirm"
                          onClick={handleCustomConfirm}
                        >
                          {t.gitVisTimeConfirm}
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
                            setCustomSince(date);
                          } else {
                            setCustomUntil(date);
                          }
                        }}
                        onClose={() => {
                          setActiveDateField(null);
                        }}
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
      )}
      <button
        type="button"
        className="adl-git-vis__timerange-btn adl-git-vis__timerange-nav"
        onClick={() => handleStep(1)}
        title={t.gitVisTimeNext}
        aria-label={t.gitVisTimeNext}
      >
        <IconArrowRight size={12} decorative />
      </button>
    </div>
  );
});
