import React from 'react';
import { useTCopy } from '@app/i18n/useTCopy';

export function FeishuPanel() {
  const { t } = useTCopy();
  return (
    <div className="adl-communicate__primary-scroll">
      <div className="adl-communicate__placeholder">
        <div className="adl-communicate__placeholder-icon">
          <svg viewBox="0 0 32 32" width="32" height="32" fill="currentColor" opacity="0.4">
            <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3h19A1.5 1.5 0 0 1 27 4.5v23a1.5 1.5 0 0 1-1.5 1.5h-19A1.5 1.5 0 0 1 5 27.5v-23zM7 7v2h18V7H7zm0 5v2h12V12H7zm0 6v2h14v-2H7z" />
          </svg>
        </div>
        <h3 className="adl-communicate__placeholder-title">{t.communicateFeishuTitle}</h3>
        <p className="adl-communicate__placeholder-desc">{t.communicateFeishuDesc}</p>
      </div>
    </div>
  );
}
