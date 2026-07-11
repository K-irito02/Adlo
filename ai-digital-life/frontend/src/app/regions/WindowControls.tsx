import { useCallback, useEffect, useState } from 'react';
import { IconClose, IconCopy, IconMinus, IconSquare } from '../icons';
import { isTauriShell } from '../../tauri-bridge';
import { TooltipSimple } from '../components/Tooltip';
import type { CopyDict } from '../i18n';

interface WindowControlsProps {
  t: CopyDict;
  onClose: () => void;
}

export function WindowControls({ t, onClose }: WindowControlsProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isTauriShell()) {
      return;
    }
    let cancelled = false;
    const syncMaximized = async () => {
      try {
        const next = await window.digitalLife.window.isMaximized();
        if (!cancelled) {
          setIsMaximized(next);
        }
      } catch {
        console.warn('Failed to sync window maximized state');
      }
    };
    void syncMaximized();
    const unsub = window.digitalLife.window.onResized(syncMaximized);
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const handleMinimize = useCallback(() => {
    if (!isTauriShell()) {
      return;
    }
    void window.digitalLife.window.minimize();
  }, []);

  const handleMaximize = useCallback(async () => {
    if (!isTauriShell()) {
      return;
    }
    await window.digitalLife.window.maximize();
    try {
      setIsMaximized(await window.digitalLife.window.isMaximized());
    } catch {
      console.warn('Failed to check window maximized state after maximize');
    }
  }, []);

  return (
    <div
      className="adl-titlebar__window-group adl-iconstrip"
      role="group"
      aria-label="Window controls"
    >
      <TooltipSimple content={t.windowMinimize} placement="bottom">
        <button
          type="button"
          className="adl-icon-btn adl-iconstrip__button adl-iconstrip__button--window adl-window-btn"
          onClick={handleMinimize}
          aria-label={t.windowMinimize}
        >
          <IconMinus size={14} decorative />
        </button>
      </TooltipSimple>
      <TooltipSimple content={isMaximized ? t.windowRestore : t.windowMaximize} placement="bottom">
        <button
          type="button"
          className="adl-icon-btn adl-iconstrip__button adl-iconstrip__button--window adl-window-btn"
          onClick={handleMaximize}
          aria-label={isMaximized ? t.windowRestore : t.windowMaximize}
        >
          {isMaximized ? <IconCopy size={14} decorative /> : <IconSquare size={12} decorative />}
        </button>
      </TooltipSimple>
      <TooltipSimple content={t.windowClose} placement="bottom">
        <button
          type="button"
          className="adl-icon-btn adl-iconstrip__button adl-iconstrip__button--window adl-window-btn adl-window-btn--close"
          onClick={onClose}
          aria-label={t.windowClose}
        >
          <IconClose size={14} decorative />
        </button>
      </TooltipSimple>
    </div>
  );
}
