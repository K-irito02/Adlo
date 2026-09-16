import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconClose, IconFileImage } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { CustomScrollArea } from '@features/file-tree/CustomScrollArea';
import { useTCopy } from '@i18n/useTCopy';
import type { ClipboardItem } from '@shared/ipc/clipboard';
import { getClipboardKindLabel } from './clipboardKind';

interface ClipboardItemViewerProps {
  item: ClipboardItem;
  onClose: () => void;
}

/**
 * 剪贴板条目放大查看覆盖层（createPortal + 遮罩 + 卡片）。
 * - 文本条目：全文展示（`white-space: pre-wrap`），超出卡片高度时用 CustomScrollArea 滚动查看完整内容
 * - 图片条目：展示后端原图（`/clipboard/image/<filename>`，非 256px 缩略图）
 * - 遮罩点击 / Escape / 关闭按钮均可关闭
 */
export function ClipboardItemViewer({ item, onClose }: ClipboardItemViewerProps) {
  const { t } = useTCopy();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const isImage = item.kind === 'image';
  const imageUrl = isImage ? window.digitalLife.clipboard.getImageUrl(item.imagePath ?? '') : '';

  return createPortal(
    <div className="adl-clipboard-viewer" onClick={onClose}>
      <div
        className="adl-clipboard-viewer__panel"
        role="dialog"
        aria-modal="true"
        aria-label={t.clipboardZoomView}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="adl-clipboard-viewer__header">
          <span className="adl-clipboard-viewer__title">{getClipboardKindLabel(item.kind, t)}</span>
          <TooltipSimple content={t.close} placement="left">
            <button
              ref={closeRef}
              type="button"
              className="adl-icon-btn adl-icon-btn--xs"
              onClick={onClose}
              aria-label={t.close}
            >
              <IconClose size={14} decorative />
            </button>
          </TooltipSimple>
        </div>

        <div className="adl-clipboard-viewer__body">
          <CustomScrollArea
            shellClassName="adl-clipboard-viewer__scroll-shell"
            scrollClassName="adl-clipboard-viewer__scroll"
            scrollbarClassName="adl-clipboard-viewer__scrollbar"
            thumbClassName="adl-clipboard-viewer__scrollbar-thumb"
          >
            {isImage ? (
              <div className="adl-clipboard-viewer__image-wrap">
                {imageUrl ? (
                  <img className="adl-clipboard-viewer__image" src={imageUrl} alt="" />
                ) : (
                  <IconFileImage size={48} decorative />
                )}
              </div>
            ) : (
              <pre className="adl-clipboard-viewer__text">{item.content ?? ''}</pre>
            )}
          </CustomScrollArea>
        </div>
      </div>
    </div>,
    document.body,
  );
}
