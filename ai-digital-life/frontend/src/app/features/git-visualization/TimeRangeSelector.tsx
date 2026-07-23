import React, { useCallback, useState, useRef, useEffect } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import type { TimeRangeState } from '@stores/slices/gitVisSlice';

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
  const [customOpen, setCustomOpen] = useState(false);
  const [customSince, setCustomSince] = useState(value.since || '');
  const [customUntil, setCustomUntil] = useState(value.until || '');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCustomOpen(false);
      }
    };
    if (open || customOpen) {
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [open, customOpen]);

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
      case 'custom':
        return `${value.since || ''} ~ ${value.until || ''}`;
      default:
        return t.gitVisTimeYear;
    }
  }, [value, t]);

  const handlePreset = useCallback(
    (preset: TimeRangeState['preset']) => {
      if (preset === 'custom') {
        setCustomOpen(true);
        setCustomSince(value.since || '');
        setCustomUntil(value.until || '');
        return;
      }
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
    [onChange, value],
  );

  const handleStep = useCallback(
    (direction: -1 | 1) => {
      const now = new Date();
      now.setHours(23, 59, 59, 999);
      const until = new Date(value.until || now.toISOString().substring(0, 10));
      const since = new Date(value.since || '2000-01-01');
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

  const handleCustomConfirm = useCallback(() => {
    if (customSince && customUntil) {
      onChange({ preset: 'custom', since: customSince, until: customUntil });
    }
    setCustomOpen(false);
    setOpen(false);
  }, [customSince, customUntil, onChange]);

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
        className="adl-git-vis__timerange-btn"
        onClick={() => handleStep(-1)}
        title={t.gitVisTimePrev}
        aria-label={t.gitVisTimePrev}
      >
        {'<'}
      </button>
      <button
        type="button"
        className="adl-git-vis__timerange-btn adl-git-vis__timerange-label"
        onClick={() => setOpen(!open)}
      >
        {getDisplayText()}
      </button>
      {open && !customOpen && (
        <div className="adl-git-vis__timerange-menu">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`adl-git-vis__timerange-menu-item${value.preset === p.key ? ' adl-git-vis__timerange-menu-item--active' : ''}`}
              onClick={() => handlePreset(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      {customOpen && (
        <div className="adl-git-vis__timerange-menu">
          <div style={{ padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11 }}>
              {t.gitVisTimeStartDate}
              <input
                type="date"
                value={customSince}
                onChange={(e) => setCustomSince(e.target.value)}
                style={{ marginLeft: 4, fontSize: 11 }}
              />
            </label>
            <label style={{ fontSize: 11 }}>
              {t.gitVisTimeEndDate}
              <input
                type="date"
                value={customUntil}
                onChange={(e) => setCustomUntil(e.target.value)}
                style={{ marginLeft: 4, fontSize: 11 }}
              />
            </label>
            <button
              type="button"
              onClick={handleCustomConfirm}
              style={{ marginTop: 4, fontSize: 11 }}
            >
              {t.gitVisTimeConfirm}
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        className="adl-git-vis__timerange-btn"
        onClick={() => handleStep(1)}
        title={t.gitVisTimeNext}
        aria-label={t.gitVisTimeNext}
      >
        {'>'}
      </button>
    </div>
  );
});
