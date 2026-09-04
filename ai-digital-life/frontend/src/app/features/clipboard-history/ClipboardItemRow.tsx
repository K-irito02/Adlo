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
 * - kind==='image'：缩略图占位 + 「图片」徽章
 * - 整行点击：把内容回写系统剪贴板（文本写正文；图片因暂无文件写入 IPC，先回写路径占位）
 * - 悬停显示删除按钮
 */
export const ClipboardItemRow = memo(function ClipboardItemRow({ item }: ClipboardItemRowProps) {
  const { t } = useTCopy();
  const removeClipboardItem = useAppStore((s) => s.removeClipboardItem);
  const showToast = useAppStore((s) => s.showToast);

  const handleCopy = async () => {
    // image 需要把图片文件写入系统剪贴板，当前无对应 IPC 命令，先回写路径字符串占位。
    // TODO: 接入 ad-server / Tauri 图片写剪贴板命令后再用真实文件写入。
    const payload = item.kind === 'image' ? (item.imagePath ?? '') : (item.content ?? '');
    if (item.kind === 'text' && !payload) {
      return;
    }
    try {
      await navigator.clipboard.writeText(payload);
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
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      void handleCopy();
    }
  };

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
              <IconFileImage size={20} decorative />
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
