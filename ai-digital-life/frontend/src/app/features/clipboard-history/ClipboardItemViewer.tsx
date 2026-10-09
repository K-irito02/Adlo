import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconClose, IconDownload, IconEye, IconFileImage } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { CustomScrollArea } from '@features/file-tree/CustomScrollArea';
import { useTCopy } from '@i18n/useTCopy';
import type { ClipboardItem } from '@shared/ipc/clipboard';
import { clipboardTextStats } from './clipboardTextStats';
import { getClipboardKindLabel } from './clipboardKind';

interface ClipboardItemViewerProps {
  item: ClipboardItem;
  onClose: () => void;
}

/**
 * 剪贴板条目放大查看覆盖层（createPortal + 遮罩 + 卡片）。
 * - 文本条目：工具栏（字符统计 / 字号缩放 / 自动换行）+ 全文展示，超出卡片高度时滚动查看完整内容
 * - HTML 条目：可安全切换富文本预览（沙箱 iframe，`sandbox=""` 禁用脚本与同源），默认仍显示纯文本
 * - 图片条目：展示后端原图；原图缺失/加载失败时回退缩略图，再退到图标占位
 * - 遮罩点击 / Escape / 关闭按钮均可关闭；关闭后焦点归还打开它的元素
 */
export function ClipboardItemViewer({ item, onClose }: ClipboardItemViewerProps) {
  const { t, formatT } = useTCopy();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const isImage = item.kind === 'image';
  const isHtml = item.kind === 'html';
  const imageUrl = isImage ? window.digitalLife.clipboard.getImageUrl(item.imagePath ?? '') : '';
  const thumbUrl = isImage ? window.digitalLife.clipboard.getThumbUrl(item.thumbPath ?? '') : '';
  // 原图 → 缩略图 → 图标占位，逐级回退（原图 URL 缺失时直接从缩略图起步）
  const [imageStage, setImageStage] = useState<'original' | 'thumb' | 'none'>(() =>
    imageUrl ? 'original' : 'thumb',
  );
  const [fontScale, setFontScale] = useState(1);
  const [wrap, setWrap] = useState(true);
  const [previewRich, setPreviewRich] = useState(false);
  const [htmlText, setHtmlText] = useState('');
  const stats = useMemo(() => clipboardTextStats(item.content ?? ''), [item.content]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  useEffect(() => {
    if (item.kind !== 'html' || !item.htmlPath) {
      return;
    }
    let cancelled = false;
    void fetch(window.digitalLife.clipboard.getHtmlUrl(item.htmlPath))
      .then((r) => r.text())
      .then((text) => {
        if (!cancelled) setHtmlText(text);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [item.id, item.kind, item.htmlPath]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      // 面板内只有关闭按钮可聚焦：把 Tab 圈在面板内，兑现 aria-modal 契约。
      if (event.key === 'Tab') {
        event.preventDefault();
        closeRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  const displayUrl = imageStage === 'original' ? imageUrl : imageStage === 'thumb' ? thumbUrl : '';

  return createPortal(
    <div
      className="adl-clipboard-viewer"
      onClick={(event) => {
        // 仅遮罩自身被点击时关闭：文本中拖选后松手到卡片外不应关闭（与清空确认框一致）。
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="adl-clipboard-viewer__panel"
        role="dialog"
        aria-modal="true"
        aria-label={t.clipboardZoomView}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="adl-clipboard-viewer__header">
          <span className="adl-clipboard-viewer__title">{getClipboardKindLabel(item.kind, t)}</span>
          <a
            className="adl-icon-btn adl-icon-btn--xs"
            href={window.digitalLife.clipboard.exportUrl(item.id)}
            download
            aria-label={t.clipboardExport}
          >
            <IconDownload size={12} decorative />
          </a>
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
          {!isImage && (
            <div className="adl-clipboard-viewer__tools">
              <span className="adl-clipboard-viewer__stats">
                {formatT(t, 'clipboardStatsSummary', {
                  chars: String(stats.chars),
                  noSpace: String(stats.charsNoSpace),
                  lines: String(stats.lines),
                })}
              </span>
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                onClick={() => setFontScale((s) => Math.max(0.5, +(s - 0.1).toFixed(2)))}
                aria-label={t.clipboardZoomOut}
              >
                A-
              </button>
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs adl-clipboard-viewer__zoom"
                onClick={() => setFontScale(1)}
                aria-label={t.clipboardZoomReset}
              >
                {Math.round(fontScale * 100)}%
              </button>
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                onClick={() => setFontScale((s) => Math.min(4, +(s + 0.1).toFixed(2)))}
                aria-label={t.clipboardZoomIn}
              >
                A+
              </button>
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                aria-pressed={wrap ? 'true' : 'false'}
                onClick={() => setWrap((w) => !w)}
                aria-label={t.clipboardWrapToggle}
              >
                ↩
              </button>
              {isHtml && (
                <button
                  type="button"
                  className="adl-icon-btn adl-icon-btn--xs"
                  aria-pressed={previewRich ? 'true' : 'false'}
                  onClick={() => setPreviewRich((v) => !v)}
                  aria-label={t.clipboardPreviewRich}
                >
                  <IconEye size={12} decorative />
                </button>
              )}
            </div>
          )}
          <CustomScrollArea
            shellClassName="adl-clipboard-viewer__scroll-shell"
            scrollClassName="adl-clipboard-viewer__scroll"
            scrollbarClassName="adl-clipboard-viewer__scrollbar"
            thumbClassName="adl-clipboard-viewer__scrollbar-thumb"
          >
            {isImage ? (
              <div className="adl-clipboard-viewer__image-wrap">
                {displayUrl ? (
                  <img
                    className="adl-clipboard-viewer__image"
                    src={displayUrl}
                    alt={t.clipboardImage}
                    onError={() =>
                      setImageStage((prev) => (prev === 'original' ? 'thumb' : 'none'))
                    }
                  />
                ) : (
                  <IconFileImage size={48} decorative />
                )}
              </div>
            ) : previewRich && htmlText ? (
              <iframe
                className="adl-clipboard-viewer__rich"
                sandbox=""
                srcDoc={htmlText}
                title={t.clipboardHtml}
              />
            ) : (
              <pre
                className="adl-clipboard-viewer__text"
                style={{
                  fontSize: `calc(var(--text-sm) * ${fontScale})`,
                  whiteSpace: wrap ? 'pre-wrap' : 'pre',
                }}
              >
                {item.content ?? ''}
              </pre>
            )}
          </CustomScrollArea>
        </div>
      </div>
    </div>,
    document.body,
  );
}
