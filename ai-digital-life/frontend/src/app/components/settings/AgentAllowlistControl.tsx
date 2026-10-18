import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AgentSiteAllowEntry, SettingItem } from '@shared/ipc';
import type { CopyDict } from '../../i18n';
import { normalizeAgentSiteEntries, normalizeOrigin } from '@shared/originWhitelist';

interface AgentAllowlistControlProps {
  item: SettingItem;
  t: CopyDict;
  onChange: (value: AgentSiteAllowEntry[]) => void;
}

/** 设置行展示用的白名单：与保存路径同源归一（字符串残留不丢、path/query 变体不重复渲染）。 */
function asAllowlist(value: SettingItem['value']): AgentSiteAllowEntry[] {
  return normalizeAgentSiteEntries(value);
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
      const raf = requestAnimationFrame(() => {
        siteRef.current?.focus();
      });
      return () => cancelAnimationFrame(raf);
    }
    return undefined;
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

  // Enter 仅在文本框内确认：焦点落在取消/确认按钮上时，按钮原生 click
  // 已能完成对应动作，不再经冒泡重复触发（事项 5 复审 R2-02：否则在取消按钮
  // 上按 Enter 会同时走确认分支把条目加上）。Escape 保持全局关闭。
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
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
                aria-label={`${t.settingsAgentAllowRemove} ${entry.alias ? `${entry.alias} ${entry.origin}` : entry.origin}`}
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
                  <label className="adl-settings-allowlist__label" htmlFor="adl-allow-alias">
                    {t.settingsAgentAllowAlias}
                  </label>
                  <input
                    id="adl-allow-alias"
                    className="adl-prompt-modal__input"
                    type="text"
                    value={alias}
                    placeholder={t.settingsAgentAllowAliasPlaceholder}
                    onChange={(e) => setAlias(e.currentTarget.value)}
                  />
                </div>
                <div>
                  <label className="adl-settings-allowlist__label" htmlFor="adl-allow-site">
                    {t.settingsAgentAllowOrigin}
                  </label>
                  <input
                    id="adl-allow-site"
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
