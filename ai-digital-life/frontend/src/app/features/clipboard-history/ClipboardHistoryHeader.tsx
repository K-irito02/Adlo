import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@stores/slicedStore';
import { IconClipboardList, IconTrash } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { SearchInput } from '@components/SearchInput';
import { useTCopy } from '@i18n/useTCopy';

/**
 * 剪贴板历史头部：标题 + 搜索框 + 「清空全部」（二次确认）+ 本地存储说明。
 */
export function ClipboardHistoryHeader() {
  const { t } = useTCopy();
  const clipboardSearch = useAppStore((s) => s.clipboardSearch);
  const setClipboardSearch = useAppStore((s) => s.setClipboardSearch);
  const clearAllClipboard = useAppStore((s) => s.clearAllClipboard);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleClearAll = async () => {
    await clearAllClipboard();
    setConfirmOpen(false);
  };

  return (
    <div className="adl-clipboard__header">
      <div className="adl-workspace-toolbar adl-clipboard__toolbar">
        <div className="adl-section-toolbar__title">
          <IconClipboardList size={14} decorative />
          <span className="adl-section-toolbar__label">{t.clipboardHistory}</span>
        </div>
        <TooltipSimple content={t.clipboardClearAll} placement="right">
          <button
            type="button"
            className="adl-icon-btn adl-icon-btn--xs adl-clipboard__clear"
            onClick={() => setConfirmOpen(true)}
            aria-label={t.clipboardClearAll}
          >
            <IconTrash size={12} decorative />
          </button>
        </TooltipSimple>
      </div>

      <div className="adl-clipboard__search">
        <SearchInput
          value={clipboardSearch}
          onChange={setClipboardSearch}
          placeholder={t.clipboardSearchPlaceholder}
          ariaLabel={t.clipboardSearchPlaceholder}
        />
      </div>

      <p className="adl-clipboard__note">{t.clipboardLocalNote}</p>

      {confirmOpen
        ? createPortal(
            <div
              className="adl-prompt-modal"
              onClick={(e) => (e.target === e.currentTarget ? setConfirmOpen(false) : undefined)}
            >
              <div
                className="adl-prompt-modal__panel"
                role="dialog"
                aria-modal="true"
                aria-label={t.clipboardClearAll}
              >
                <div className="adl-prompt-modal__header">
                  {t.clipboardClearAll}
                  <button
                    type="button"
                    className="adl-prompt-modal__header-close"
                    onClick={() => setConfirmOpen(false)}
                    aria-label={t.close}
                  >
                    ✕
                  </button>
                </div>
                <div className="adl-prompt-modal__item-info">{t.clipboardClearConfirm}</div>
                <div className="adl-prompt-modal__actions adl-prompt-modal__actions--fill">
                  <button
                    type="button"
                    className="adl-btn adl-btn--ghost adl-btn--square"
                    onClick={() => setConfirmOpen(false)}
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    className="adl-btn adl-btn--primary adl-btn--square"
                    onClick={() => void handleClearAll()}
                  >
                    {t.confirm}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
