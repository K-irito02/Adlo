import React from "react";
import type { CopyDict } from "../../i18n";
import { IconCheckCircle, IconAlertTriangle } from "../../icons";

interface ValidationSummaryBarProps {
  t: CopyDict;
  passed: number;
  warnings: number;
  errors: number;
  onClickErrors?: () => void;
  onClickWarnings?: () => void;
}

export function ValidationSummaryBar({ t, passed, warnings, errors, onClickErrors, onClickWarnings }: ValidationSummaryBarProps) {
  if (passed === 0 && warnings === 0 && errors === 0) return null;

  return (
    <div className="adl-validation-bar">
      <span className="adl-validation-bar__title">{t.validationSummary}</span>
      {errors > 0 && (
        <button
          type="button"
          className="adl-chip adl-chip--xs adl-chip--danger adl-validation-bar__count"
          onClick={onClickErrors}
        >
          <IconAlertTriangle size={12} decorative />
          {t.validationErrors}: {errors}
        </button>
      )}
      {warnings > 0 && (
        <button
          type="button"
          className="adl-chip adl-chip--xs adl-chip--warning adl-validation-bar__count"
          onClick={onClickWarnings}
        >
          <IconAlertTriangle size={12} decorative />
          {t.validationWarnings}: {warnings}
        </button>
      )}
      {passed > 0 && (
        <span className="adl-chip adl-chip--xs adl-chip--success">
          <IconCheckCircle size={12} decorative />
          {t.validationPassed}: {passed}
        </span>
      )}
    </div>
  );
}
