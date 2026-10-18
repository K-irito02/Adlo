import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AgentSiteAllowEntry, SettingItem } from '@shared/ipc';
import type { CopyDict } from '../../i18n';
import { normalizeOrigin } from '@shared/originWhitelist';

interface AgentAllowlistControlProps {
  item: SettingItem;
  t: CopyDict;
  onChange: (value: AgentSiteAllowEntry[]) => void;
}

function asAllowlist(value: SettingItem['value']): AgentSiteAllowEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: AgentSiteAllowEntry[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const origin = (entry as { origin?: unknown }).origin;
    if (typeof origin !== 'string' || !origin) {
      continue;
    }
    const alias = (entry as { alias?: unknown }).alias;
    entries.push(
      typeof alias === 'string' && alias.trim() ? { alias: alias.trim(), origin } : { origin },
    );
  }
  return entries;
}

/**
 * 智能体网址白名单：卡片式新增（别称选填/站点必填），已保存条目支持移除。
 * 交互复用浏览器落地页添加对话框的 `adl-prompt-modal` 卡片语言。
 */
export function AgentAllowlistControl({ item, t, onChange }: AgentAllowlistControlProps) {
  const entries = asAllowlist(item.value);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [alias, setAlias] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [error, setError] = useState('');
  const siteRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (dialogOpen) {
      setAlias('');
      setSiteUrl('');
      setError('');
      requestAnimationFrame(() => {
        siteRef.current?.focus();
      });
    }
  }, [dialogOpen]);

  const handleOpen = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const handleCancel = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const handleConfirm = useCallback(() => {
    const rawSite = siteUrl.trim();
    if (!rawSite) {
      setError(t.settingsAgentAllowOriginRequired);
      return;
    }
    const origin = normalizeOrigin(rawSite);
    if (!origin) {
      setError(t.settingsAgentAllowOriginInvalid);
      return;
    }
    const trimmedAlias = alias.trim();
    const exists = entries.some((entry) => entry.origin === origin);
    const next = exists
      ? entries.map((entry) =>
          entry.origin === origin
            ? trimmedAlias
              ? { alias: trimmedAlias, origin }
              : { origin }
            : entry,
        )
      : [...entries, ...(trimmedAlias ? [{ alias: trimmedAlias, origin }] : [{ origin }])];
    onChange(next);
    setDialogOpen(false);
  }, [alias, entries, onChange, siteUrl, t]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleConfirm();
      } else if (e.key === 'Escape') {
        handleCancel();
      }
    },
    [handleCancel, handleConfirm],
  );

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        handleCancel();
      }
    },
    [handleCancel],
  );

  const handleRemove = useCallback(
    (origin: string) => {
      onChange(entries.filter((entry) => entry.origin !== origin));
    },
    [entries, onChange],
  );

  return (
    <div className="adl-settings-allowlist">
      {entries.length === 0 ? (
        <p className="adl-settings-allowlist__empty">{t.settingsAgentAllowEmpty}</p>
      ) : (
        <ul className="adl-settings-allowlist__list">
          {entries.map((entry) => (
            <li key={entry.origin} className="adl-settings-allowlist__item">
              <span className="adl-settings-allowlist__origin" title={entry.origin}>
                {entry.alias ? `${entry.alias} · ${entry.origin}` : entry.origin}
              </span>
              <button
                type="button"
                className="adl-btn adl-btn--ghost adl-btn--square adl-settings-allowlist__remove"
                onClick={() => handleRemove(entry.origin)}
                disabled={item.disabled}
                aria-label={`${t.settingsAgentAllowRemove} ${entry.alias ?? entry.origin}`}
              >
                {t.settingsAgentAllowRemove}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="adl-btn adl-btn--ghost adl-btn--square"
        onClick={handleOpen}
        disabled={item.disabled}
      >
        {t.settingsAgentAllowAdd}
      </button>
      {dialogOpen &&
        createPortal(
          <div className="adl-prompt-modal" onKeyDown={handleKeyDown} onClick={handleBackdrop}>
            <div
              className="adl-prompt-modal__panel"
              role="dialog"
              aria-modal="true"
              aria-label={t.settingsAgentAllowTitle}
            >
              <div className="adl-prompt-modal__header">
                {t.settingsAgentAllowTitle}
                <button
                  type="button"
                  className="adl-prompt-modal__header-close"
                  onClick={handleCancel}
                  aria-label={t.close}
                >
                  ✕
                </button>
              </div>
              <div className="adl-prompt-modal__body adl-prompt-modal__body--compact">
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: 'var(--text-secondary)',
                      marginBottom: 4,
                    }}
                  >
                    {t.settingsAgentAllowAlias}
                  </div>
                  <input
                    className="adl-prompt-modal__input"
                    type="text"
                    value={alias}
                    placeholder={t.settingsAgentAllowAliasPlaceholder}
                    onChange={(e) => setAlias(e.currentTarget.value)}
                  />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: 'var(--text-secondary)',
                      marginBottom: 4,
                    }}
                  >
                    {t.settingsAgentAllowOrigin}
                  </div>
                  <input
                    ref={siteRef}
                    className="adl-prompt-modal__input"
                    type="text"
                    value={siteUrl}
                    placeholder={t.settingsAgentAllowOriginPlaceholder}
                    onChange={(e) => {
                      setSiteUrl(e.currentTarget.value);
                      if (error) {
                        setError('');
                      }
                    }}
                  />
                </div>
                {error && <p className="adl-prompt-modal__error">{error}</p>}
              </div>
              <div className="adl-prompt-modal__actions adl-prompt-modal__actions--fill">
                <button
                  type="button"
                  className="adl-btn adl-btn--ghost adl-btn--square"
                  onClick={handleCancel}
                >
                  {t.cancel}
                </button>
                <button
                  type="button"
                  className="adl-btn adl-btn--primary adl-btn--square"
                  onClick={handleConfirm}
                >
                  {t.settingsAgentAllowAdd}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
