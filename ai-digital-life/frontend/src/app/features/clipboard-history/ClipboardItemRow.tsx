import { memo } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { IconFileImage, IconPlus, IconTrash } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { useTCopy } from '@i18n/useTCopy';
import type { ClipboardItem } from '@shared/ipc/clipboard';

interface ClipboardItemRowProps {
  item: ClipboardItem;
}

function getKindLabel(kind: string, t: { clipboardText: string; clipboardImage: string }): string {
  return kind === 'image' ? t.clipboardImage : t.clipboardText;
}

/**
 * 单行剪贴板历史条目。
 * - kind==='text'：多行（line-clamp）截断的内容预览 + 「文本」徽章
 * - kind==='image'：缩略图（ad-server `/clipboard/thumb` 静态图）+ 「图片」徽章
 * - 整行点击：把内容回写系统剪贴板（文本走 `navigator.clipboard.writeText`，判空守卫；
 *   图片走后端 `/clipboard/write-image` 写回落盘的 PNG）
 * - 悬停显示删除按钮
 */
export const ClipboardItemRow = memo(function ClipboardItemRow({ item }: ClipboardItemRowProps) {
  const { t } = useTCopy();
  const removeClipboardItem = useAppStore((s) => s.removeClipboardItem);
  const writeClipboardItem = useAppStore((s) => s.writeClipboardItem);
  const showToast = useAppStore((s) => s.showToast);

  const handleCopy = async () => {
    // image：走后端 `/clipboard/write-image` 把落盘的 PNG 写回系统剪贴板。
    if (item.kind === 'image') {
      if (!item.imagePath) {
        return;
      }
      const ok = await writeClipboardItem(item.id);
      if (ok) {
        showToast(t.copySuccessClipboard, 'success');
      }
      return;
    }
    // text：判空守卫避免 `writeText('')` 清空用户剪辑板。
    const content = item.content ?? '';
    if (!content) {
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      showToast(t.copySuccessClipboard, 'success');
    } catch (err) {
      console.warn('[clipboard-history] copy back failed', err);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    void removeClipboardItem(item.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) {
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      void handleCopy();
    }
  };

  // 图片条目把后端落盘的 thumbPath 通过桥接转成 ad-server 静态图 URL。
  const thumbUrl =
    item.kind === 'image' ? window.digitalLife.clipboard.getThumbUrl(item.thumbPath ?? '') : '';

  return (
    <li className="adl-clipboard__row-item">
      <div
        className="adl-clipboard-row"
        role="button"
        tabIndex={0}
        onClick={() => void handleCopy()}
        onKeyDown={handleKeyDown}
      >
        <span className="adl-clipboard-row__icon" aria-hidden="true">
          {item.kind === 'image' ? (
            <IconFileImage size={14} decorative />
          ) : (
            <IconPlus size={12} decorative />
          )}
        </span>

        <span className="adl-clipboard-row__body">
          {item.kind === 'image' ? (
            <span className="adl-clipboard-row__thumb" aria-hidden="true">
              {thumbUrl ? (
                <img
                  className="adl-clipboard-row__thumb-img"
                  src={thumbUrl}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <IconFileImage size={20} decorative />
              )}
            </span>
          ) : (
            <span className="adl-clipboard-row__preview">{item.content ?? ''}</span>
          )}
          <span className="adl-clipboard-row__badge">{getKindLabel(item.kind, t)}</span>
        </span>

        <span className="adl-clipboard-row__actions">
          <TooltipSimple content={t.clipboardDeleteOne} placement="right">
            <button
              type="button"
              className="adl-icon-btn adl-icon-btn--xs adl-clipboard-row__delete"
              onClick={handleDelete}
              aria-label={t.clipboardDeleteOne}
            >
              <IconTrash size={12} decorative />
            </button>
          </TooltipSimple>
        </span>
      </div>
    </li>
  );
});
