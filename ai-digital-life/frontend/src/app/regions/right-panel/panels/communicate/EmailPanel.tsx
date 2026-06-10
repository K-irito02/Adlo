import React from 'react';
import { workspaceSelectors } from '../../../../stores/selectors';
import { getAppCopy } from '../../../../i18n';

export function EmailPanel() {
  const appInfo = workspaceSelectors.useAppInfo();
  const copy = getAppCopy(appInfo);
  return (
    <div className="adl-communicate__primary-scroll">
      <div className="adl-communicate__placeholder">
        <div className="adl-communicate__placeholder-icon">
          <svg viewBox="0 0 32 32" width="32" height="32" fill="currentColor" opacity="0.4">
            <path d="M.1 7.11A4 4 0 0 1 4 4h24a4 4 0 0 1 3.9 3.11L16 16.83.1 7.11zM0 9.4v14.2l11.6-7.12L0 9.4zm13.52 9.46l-13.14 8.05A4 4 0 0 0 4 28h24a4 4 0 0 0 3.62-2.29l-13.14-8.05L16 19.17l-2.48-1.52zm6.88-1.17L32 23.6V9.4l-11.6 7.09z" />
          </svg>
        </div>
        <h3 className="adl-communicate__placeholder-title">{copy.communicateEmailTitle}</h3>
        <p className="adl-communicate__placeholder-desc">{copy.communicateEmailDesc}</p>
      </div>
    </div>
  );
}
