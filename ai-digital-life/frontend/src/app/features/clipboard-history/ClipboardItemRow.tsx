import { memo } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { IconClose, IconExpandCorners, IconFileImage } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { CopyButton } from '@components/CopyButton';
import { useTCopy } from '@i18n/useTCopy';
import { formatRelativeTime } from '@utils/relativeTime';
import type { ClipboardItem } from '@shared/ipc/clipboard';
import { getClipboardKindLabel } from './clipboardKind';

interface ClipboardItemRowProps {
  item: ClipboardItem;
  onZoom: (item: ClipboardItem) => void;
}

/**
 * 单行剪贴板历史条目（固定行高，不随内容多少 / 图片大小变化）。
 * - kind==='text'：单行截断的内容预览
 * - kind==='image'：固定尺寸缩略图（ad-server `/clipboard/thumb` 静态图）
 * - 徽章行：左侧类型徽章，右端相对时间戳
 * - 行尾操作：复制（CopyButton，含复制动画）/ 放大查看 / 关闭（删除本条）
 * - 整行点击：放大查看（不再触发复制），完整内容在查看器中阅读
 */
export const ClipboardItemRow = memo(function ClipboardItemRow({
  item,
  onZoom,
}: ClipboardItemRowProps) {
  const { t } = useTCopy();
  const removeClipboardItem = useAppStore((s) => s.removeClipboardItem);
  const writeClipboardItem = useAppStore((s) => s.writeClipboardItem);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    void removeClipboardItem(item.id);
  };

  const handleZoom = () => {
    onZoom(item);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) {
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleZoom();
    }
  };

  // 图片条目把后端落盘的 thumbPath 通过桥接转成 ad-server 静态图 URL。
  const thumbUrl =
    item.kind === 'image' ? window.digitalLife.clipboard.getThumbUrl(item.thumbPath ?? '') : '';

  // 所有类型均走后端写回：CopyButton 调 writeClipboardItem，由后端按 kind 把 text/html/rtf/图片写回系统剪贴板。
  const isImage = item.kind === 'image';
  const copyProps = { onCopy: () => writeClipboardItem(item.id) };
  const canCopy = isImage
    ? Boolean(item.imagePath)
    : item.kind === 'html'
      ? Boolean(item.htmlPath) || Boolean(item.content)
      : item.kind === 'rtf'
        ? Boolean(item.rtfPath) || Boolean(item.content)
        : Boolean(item.content);
  const timestamp = formatRelativeTime(item.createdAt, t);

  return (
    <li>
      <div
        className="adl-clipboard-row"
        role="button"
        tabIndex={0}
        onClick={handleZoom}
        onKeyDown={handleKeyDown}
      >
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
          <span className="adl-clipboard-row__meta">
            <span className="adl-clipboard-row__badge">{getClipboardKindLabel(item.kind, t)}</span>
            {timestamp ? <span className="adl-clipboard-row__time">{timestamp}</span> : null}
          </span>
        </span>

        <span className="adl-clipboard-row__actions">
          <TooltipSimple content={t.clipboardDeleteOne} placement="left">
            <button
              type="button"
              className="adl-icon-btn adl-icon-btn--xs"
              onClick={handleDelete}
              aria-label={t.clipboardDeleteOne}
            >
              <IconClose size={12} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.clipboardZoomView} placement="left">
            <button
              type="button"
              className="adl-icon-btn adl-icon-btn--xs"
              onClick={(e) => {
                e.stopPropagation();
                handleZoom();
              }}
              aria-label={t.clipboardZoomView}
            >
              <IconExpandCorners size={12} decorative />
            </button>
          </TooltipSimple>
          {canCopy ? (
            <CopyButton
              {...copyProps}
              size={12}
              className="adl-clipboard-row__copy"
              tooltip={t.clipboardCopy}
            />
          ) : null}
        </span>
      </div>
    </li>
  );
});
