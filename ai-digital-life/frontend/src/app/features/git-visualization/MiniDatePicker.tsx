import React, { useState, useCallback } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { IconArrowLeft, IconArrowRight, IconClose } from '@app/icons';

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstWeekday(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

interface MiniDatePickerProps {
  value: string;
  onChange: (date: string) => void;
  onClose: () => void;
}

export const MiniDatePicker = React.memo(function MiniDatePicker({
  value,
  onChange,
  onClose,
}: MiniDatePickerProps) {
  const { t } = useTCopy();

  const WEEKDAYS = [
    t.gitVisDatePickerSun,
    t.gitVisDatePickerMon,
    t.gitVisDatePickerTue,
    t.gitVisDatePickerWed,
    t.gitVisDatePickerThu,
    t.gitVisDatePickerFri,
    t.gitVisDatePickerSat,
  ];

  const today = new Date();
  const initialDate = value ? new Date(value + 'T00:00:00') : today;
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstWeekday = getFirstWeekday(viewYear, viewMonth);

  const handlePrevMonth = useCallback(() => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }, [viewMonth]);

  const handleNextMonth = useCallback(() => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }, [viewMonth]);

  const handlePrevYear = useCallback(() => {
    setViewYear((y) => y - 1);
  }, []);

  const handleNextYear = useCallback(() => {
    setViewYear((y) => y + 1);
  }, []);

  const handleSelect = useCallback(
    (day: number) => {
      const m = String(viewMonth + 1).padStart(2, '0');
      const d = String(day).padStart(2, '0');
      onChange(`${viewYear}-${m}-${d}`);
    },
    [viewYear, viewMonth, onChange],
  );

  const selectedParts = value ? value.split('-') : [];
  const selectedDay = selectedParts.length === 3 ? parseInt(selectedParts[2], 10) : -1;
  const selectedMonth = selectedParts.length === 3 ? parseInt(selectedParts[1], 10) - 1 : -1;
  const selectedYear = selectedParts.length === 3 ? parseInt(selectedParts[0], 10) : -1;

  return (
    <div className="adl-git-vis__date-picker">
      <div className="adl-git-vis__date-picker-header">
        <button
          type="button"
          className="adl-git-vis__date-picker-nav"
          onClick={handlePrevYear}
          aria-label={t.gitVisDatePickerPrevYear}
        >
          <span className="adl-git-vis__date-picker-nav-dbl">{'«'}</span>
        </button>
        <button
          type="button"
          className="adl-git-vis__date-picker-nav"
          onClick={handlePrevMonth}
          aria-label={t.gitVisDatePickerPrevMonth}
        >
          <IconArrowLeft size={12} decorative />
        </button>
        <span className="adl-git-vis__date-picker-title">
          {viewYear}/{String(viewMonth + 1).padStart(2, '0')}
        </span>
        <button
          type="button"
          className="adl-git-vis__date-picker-nav"
          onClick={handleNextMonth}
          aria-label={t.gitVisDatePickerNextMonth}
        >
          <IconArrowRight size={12} decorative />
        </button>
        <button
          type="button"
          className="adl-git-vis__date-picker-nav"
          onClick={handleNextYear}
          aria-label={t.gitVisDatePickerNextYear}
        >
          <span className="adl-git-vis__date-picker-nav-dbl">{'»'}</span>
        </button>
        <button
          type="button"
          className="adl-git-vis__date-picker-close"
          onClick={onClose}
          aria-label={t.close}
        >
          <IconClose size={12} decorative />
        </button>
      </div>
      <div className="adl-git-vis__date-picker-weekdays">
        {WEEKDAYS.map((d) => (
          <span key={d} className="adl-git-vis__date-picker-weekday">
            {d}
          </span>
        ))}
      </div>
      <div className="adl-git-vis__date-picker-grid">
        {Array.from({ length: firstWeekday }, (_, i) => (
          <span
            key={`empty-${i}`}
            className="adl-git-vis__date-picker-cell adl-git-vis__date-picker-cell--empty"
          />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const isSel =
            day === selectedDay && viewMonth === selectedMonth && viewYear === selectedYear;
          const isTod =
            day === today.getDate() &&
            viewMonth === today.getMonth() &&
            viewYear === today.getFullYear();
          return (
            <button
              key={day}
              type="button"
              className={`adl-git-vis__date-picker-cell${isSel ? ' is-selected' : ''}${isTod ? ' is-today' : ''}`}
              onClick={() => handleSelect(day)}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
});
