import React, { useCallback } from 'react';
import { IconAlertTriangle, IconGlobe } from '../../icons';
import { isTauriShell } from '../../../tauri-bridge';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import type { CopyDict, CopyKey } from '../../i18n/types';

export interface ExternalLinkErrorProps {
  errorKey: CopyKey;
  activeTabUrl: string | undefined;
  t: CopyDict;
  variant?: 'active' | 'blocked';
}

export function ExternalLinkError({
  errorKey,
  activeTabUrl,
  t,
  variant = 'blocked',
}: ExternalLinkErrorProps) {
  const handleExternalOpen = useCallback(() => {
    const url = activeTabUrl ?? 'about:blank';
    if (isTauriShell()) {
      shellOpen(url).catch(() => {});
    } else {
      const w = window as { trae?: { openExternal: (url: string) => void } };
      if (w.trae?.openExternal) {
        w.trae.openExternal(url);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    }
  }, [activeTabUrl]);

  const containerClass =
    variant === 'active'
      ? 'adl-browser-error-container adl-browser-error-container--active'
      : 'adl-browser-error-container adl-browser-error-container--blocked';

  return (
    <div className={containerClass}>
      <IconAlertTriangle size={28} decorative className="adl-browser-error__icon" />
      <p className="adl-browser-error-text">{t[errorKey]}</p>
      <button
        type="button"
        className="adl-browser-external-btn adl-browser-external-btn--prominent"
        onClick={handleExternalOpen}
      >
        <IconGlobe size={14} />
        {t.browserOpenExternal}
      </button>
    </div>
  );
}
