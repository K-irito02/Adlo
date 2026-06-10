import React from 'react';
import { workspaceSelectors } from '../../../../stores/selectors';
import { getAppCopy } from '../../../../i18n';

export function QQPanel() {
  const appInfo = workspaceSelectors.useAppInfo();
  const copy = getAppCopy(appInfo);
  return (
    <div className="adl-communicate__primary-scroll">
      <div className="adl-communicate__placeholder">
        <div className="adl-communicate__placeholder-icon">
          <svg viewBox="0 0 32 32" width="32" height="32" fill="currentColor" opacity="0.4">
            <path d="M8 4a4 4 0 0 0-4 4v10a4 4 0 0 0 4 4h3v5a1 1 0 0 0 1.7.72L18.42 22H24a4 4 0 0 0 4-4V8a4 4 0 0 0-4-4H8z" />
          </svg>
        </div>
        <h3 className="adl-communicate__placeholder-title">{copy.communicateQQTitle}</h3>
        <p className="adl-communicate__placeholder-desc">{copy.communicateQQDesc}</p>
      </div>
    </div>
  );
}
