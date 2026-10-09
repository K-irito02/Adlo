import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconClose, IconDownload, IconEdit, IconEye, IconFileImage } from '@icons';
import { CopyButton } from '@components/CopyButton';
import { TooltipSimple } from '@components/Tooltip';
import { CustomScrollArea } from '@features/file-tree/CustomScrollArea';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import type { ClipboardItem } from '@shared/ipc/clipboard';
import { clipboardTextStats } from './clipboardTextStats';
import { formatClipboardBytes } from './clipboardBytes';
import { getClipboardKindLabel } from './clipboardKind';
import { createUndoStack } from './clipboardUndoStack';

interface ClipboardItemViewerProps {
  item: ClipboardItem;
  onClose: () => void;
}

/** 图片缩放比例范围与步长（与文本字号缩放同为 0.1 步长）。 */
const IMAGE_ZOOM_MIN = 0.25;
const IMAGE_ZOOM_MAX = 4;
const ZOOM_STEP = 0.1;
/** 存储的图片原图恒为 PNG。 */
const IMAGE_FORMAT = 'PNG';
/**
 * 单次保存任务内最多写入轮数（首轮 + 若干次补写）。封顶以防写入失败时死循环；
 * 若达到上限时草稿仍未落盘，保存任务会**保持编辑态**（不静默丢弃新输入），
 * 由后续 Ctrl+S / 关闭继续保存。
 */
const MAX_SAVE_ROUNDS = 8;

/**
 * 剪贴板条目放大查看覆盖层（createPortal + 遮罩 + 卡片）。
 * - 文本条目：工具栏（字符统计 / 字号缩放 / 自动换行 / 编辑）+ 全文展示，超出卡片高度时滚动查看完整内容
 * - 文本条目可进入编辑模式：Ctrl+Z 撤回 / Ctrl+Y 重做 / Ctrl+S 保存 / Esc 取消更改
 * - HTML 条目：可安全切换富文本预览（沙箱 iframe，`sandbox=""` 禁用脚本与同源），默认仍显示纯文本
 * - 图片条目：工具栏展示尺寸/格式/体积读数与 25%~400% 缩放（适应窗口复位到 100%），
 *   原图缺失/加载失败时回退缩略图，再退到图标占位
 * - 头部对所有类型提供"复制"（走 `writeClipboardItem` 写回系统剪贴板）与保存为文件、关闭
 * - 遮罩点击 / Escape / 关闭按钮均可关闭；关闭即保存（含卸载时的未落盘改动）；关闭后焦点归还打开它的元素
 */
export function ClipboardItemViewer({ item, onClose }: ClipboardItemViewerProps) {
  const { t, formatT } = useTCopy();
  const updateClipboardItem = useAppStore((s) => s.updateClipboardItem);
  const writeClipboardItem = useAppStore((s) => s.writeClipboardItem);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const canEdit = item.kind === 'text';
  const isImage = item.kind === 'image';
  const isHtml = item.kind === 'html';
  const imageUrl = isImage ? window.digitalLife.clipboard.getImageUrl(item.imagePath ?? '') : '';
  const thumbUrl = isImage ? window.digitalLife.clipboard.getThumbUrl(item.thumbPath ?? '') : '';
  // 保存为文件链接：mock / 离线回退模式下 `exportUrl` 返回空串，此时不渲染为可用链接，
  // 以免 href="" 被解析为当前文档而触发导航/刷新。
  const exportHref = window.digitalLife.clipboard.exportUrl(item.id);
  // 原图 → 缩略图 → 图标占位，逐级回退（原图 URL 缺失时直接从缩略图起步）
  const [imageStage, setImageStage] = useState<'original' | 'thumb' | 'none'>(() =>
    imageUrl ? 'original' : 'thumb',
  );
  const [fontScale, setFontScale] = useState(1);
  const [imageScale, setImageScale] = useState(1);
  const [wrap, setWrap] = useState(true);
  const [previewRich, setPreviewRich] = useState(false);
  const [htmlText, setHtmlText] = useState('');
  const [editing, setEditing] = useState(false);
  // 本查看器会话内的当前文本：编辑时实时更新；撤回到此前的基线即「取消更改」。
  const [draft, setDraft] = useState(item.content ?? '');
  // 始终持有最新草稿（状态更新是异步的），供保存流程在 await 之后判断是否需要补写。
  const draftRef = useRef(item.content ?? '');
  const baselineRef = useRef(item.content ?? '');
  const stackRef = useRef(createUndoStack(item.content ?? ''));
  // 单飞：同一时刻至多一个保存任务在途（任务内部逐轮串行写入），避免并发/重复写入。
  const savingRef = useRef<Promise<void> | null>(null);
  const stats = useMemo(() => clipboardTextStats(draft), [draft]);
  // 文本与草稿同步推进：ref 用于异步保存读取，state 用于渲染。
  const updateDraft = useCallback((next: string) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  // 条目变化时重置草稿/撤销栈并退出编辑，保证 Esc 撤回到该条目的最新文本，且不会复用编辑态。
  useEffect(() => {
    const initial = item.content ?? '';
    updateDraft(initial);
    setEditing(false);
    baselineRef.current = initial;
    stackRef.current = createUndoStack(initial);
  }, [item.id, item.content, updateDraft]);

  useEffect(() => {
    if (item.kind !== 'html' || !item.htmlPath) {
      return;
    }
    // 空 URL 不可 fetch：`fetch('')` 会相对当前文档解析，抓取 SPA 自身的 HTML 作为 srcDoc。
    const url = window.digitalLife.clipboard.getHtmlUrl(item.htmlPath);
    if (!url) {
      return;
    }
    let cancelled = false;
    void fetch(url)
      .then((r) => r.text())
      .then((text) => {
        if (!cancelled) setHtmlText(text);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [item.id, item.kind, item.htmlPath]);

  /**
   * 若正在编辑且有改动则落盘，然后退出编辑模式；空白内容不可保存。
   * 单飞：同一时刻至多一个保存任务在途；已有在途任务时直接返回它，供调用方（关闭路径）等待其落盘。
   * 保存任务内部逐轮串行写入：每写完一轮，若"实时草稿"（`draftRef`）已不同于刚落盘的内容，
   * 再补写一轮；轮数封顶（`MAX_SAVE_ROUNDS`），达上限仍未落盘则保持编辑态交由后续保存，
   * 失败（返回 `false`）也不会死循环。
   */
  const commitIfEditing = useCallback(async () => {
    if (!editing) {
      return;
    }
    if (savingRef.current) {
      return savingRef.current;
    }
    const saving = (async () => {
      try {
        for (let round = 0; round < MAX_SAVE_ROUNDS; round += 1) {
          const target = draftRef.current;
          if (!target.trim() || target === baselineRef.current) {
            break;
          }
          const ok = await updateClipboardItem(item.id, target);
          if (!ok) {
            // 保存失败：不推进基线、保持编辑态，让用户可重试（关闭时会再次尝试落盘）。
            return;
          }
          // 更新基线：既让下一轮判断"是否还有新改动"，也让随后的 Esc 撤回到已保存内容。
          baselineRef.current = target;
        }
        // 仅当草稿已完全落盘（保存期间无新输入）时才退出编辑；否则保持编辑态，
        // 让后续 Ctrl+S / 关闭继续保存 —— 避免达到轮数上限时静默丢弃最后的新输入。
        if (draftRef.current === baselineRef.current) {
          setEditing(false);
        }
      } finally {
        savingRef.current = null;
      }
    })();
    savingRef.current = saving;
    return saving;
  }, [editing, item.id, updateClipboardItem]);

  const commitIfEditingRef = useRef(commitIfEditing);
  useEffect(() => {
    commitIfEditingRef.current = commitIfEditing;
  }, [commitIfEditing]);

  // 关闭即保存：所有关闭路径先落盘再关闭。
  const closeAndMaybeSave = async () => {
    if (editing) {
      await commitIfEditing();
    }
    onClose();
  };

  // 卸载时仍在编辑则把未落盘的改动保存下来。
  useEffect(
    () => () => {
      void commitIfEditingRef.current();
    },
    [],
  );

  const startEditing = () => {
    baselineRef.current = draftRef.current;
    stackRef.current = createUndoStack(draftRef.current);
    setEditing(true);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (editing) {
        if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
          event.preventDefault();
          updateDraft(stackRef.current.undo());
          return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key === 'y') {
          event.preventDefault();
          updateDraft(stackRef.current.redo());
          return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
          event.preventDefault();
          void commitIfEditingRef.current();
          return;
        }
        if (event.key === 'Escape') {
          // 编辑中 Esc = 取消更改：撤回到本次编辑开始前的文本，弹窗保持打开。
          event.preventDefault();
          updateDraft(baselineRef.current);
          stackRef.current = createUndoStack(baselineRef.current);
          setEditing(false);
          return;
        }
      } else if (event.key === 'Escape') {
        onClose();
        return;
      }
      // 焦点循环：Tab / Shift+Tab 在面板内的可聚焦控件间环绕（兑现 aria-modal 契约）。
      // 此前一律聚焦关闭按钮，会让复制/导出/缩放/编辑/预览/iframe 等控件键盘不可达。
      if (event.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) {
          return;
        }
        const focusables = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusables.length === 0) {
          return;
        }
        event.preventDefault();
        const current = document.activeElement as HTMLElement | null;
        const idx = current ? focusables.indexOf(current) : -1;
        const step = event.shiftKey ? -1 : 1;
        const next =
          idx === -1
            ? event.shiftKey
              ? focusables.length - 1
              : 0
            : (idx + step + focusables.length) % focusables.length;
        focusables[next].focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [editing, onClose, updateDraft]);
  const displayUrl = imageStage === 'original' ? imageUrl : imageStage === 'thumb' ? thumbUrl : '';
  // 图片读数：尺寸 / 格式 / 体积，未知项整体省略（不打印占位符）。
  const imageMetaParts: string[] = [];
  if (item.imageWidth != null && item.imageHeight != null) {
    imageMetaParts.push(
      formatT(t, 'clipboardImageDimensions', {
        width: String(item.imageWidth),
        height: String(item.imageHeight),
      }),
    );
  }
  imageMetaParts.push(formatT(t, 'clipboardImageFormat', { format: IMAGE_FORMAT }));
  const imageBytes = item.imageBytes != null ? formatClipboardBytes(item.imageBytes) : '';
  if (imageBytes) {
    imageMetaParts.push(formatT(t, 'clipboardImageByteSize', { size: imageBytes }));
  }
  const imageMeta = imageMetaParts.join(t.clipboardImageMetaSeparator);
  // 显示宽度 = 原始宽度 × 比例，放大时放开 max-width 让滚动容器可横向滚动；100% 时回到 max-width:100% 自适应。
  const imageStyle =
    item.imageWidth != null
      ? { width: Math.round(item.imageWidth * imageScale), maxWidth: imageScale > 1 ? 'none' : '100%' }
      : undefined;

  return createPortal(
    <div
      className="adl-clipboard-viewer"
      onClick={(event) => {
        // 仅遮罩自身被点击时关闭：文本中拖选后松手到卡片外不应关闭（与清空确认框一致）。
        if (event.target === event.currentTarget) {
          void closeAndMaybeSave();
        }
      }}
    >
      <div
        ref={panelRef}
        className="adl-clipboard-viewer__panel"
        role="dialog"
        aria-modal="true"
        aria-label={t.clipboardZoomView}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="adl-clipboard-viewer__header">
          <span className="adl-clipboard-viewer__title">{getClipboardKindLabel(item.kind, t)}</span>
          <CopyButton
            onCopy={() => writeClipboardItem(item.id)}
            size={12}
            className="adl-clipboard-viewer__copy"
            tooltip={t.clipboardCopy}
          />
          <a
            className="adl-icon-btn adl-icon-btn--xs"
            href={exportHref || undefined}
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
              onClick={() => void closeAndMaybeSave()}
              aria-label={t.close}
            >
              <IconClose size={14} decorative />
            </button>
          </TooltipSimple>
        </div>

        <div className="adl-clipboard-viewer__body">
          <div className="adl-clipboard-viewer__tools">
            {isImage ? (
              <>
                <span className="adl-clipboard-viewer__stats">{imageMeta}</span>
                <button
                  type="button"
                  className="adl-icon-btn adl-icon-btn--xs"
                  onClick={() => setImageScale((s) => Math.max(IMAGE_ZOOM_MIN, +(s - ZOOM_STEP).toFixed(2)))}
                  aria-label={t.clipboardImageZoomOut}
                >
                  −
                </button>
                <span className="adl-clipboard-viewer__zoom-readout">
                  {Math.round(imageScale * 100)}%
                </span>
                <button
                  type="button"
                  className="adl-icon-btn adl-icon-btn--xs"
                  onClick={() => setImageScale((s) => Math.min(IMAGE_ZOOM_MAX, +(s + ZOOM_STEP).toFixed(2)))}
                  aria-label={t.clipboardImageZoomIn}
                >
                  +
                </button>
                <button
                  type="button"
                  className="adl-icon-btn adl-icon-btn--xs adl-clipboard-viewer__fit"
                  onClick={() => setImageScale(1)}
                  aria-label={t.clipboardImageFitWindow}
                >
                  {t.clipboardImageFitWindow}
                </button>
              </>
            ) : (
              <>
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
                {canEdit && (
                  <button
                    type="button"
                    className="adl-icon-btn adl-icon-btn--xs"
                    aria-pressed={editing ? 'true' : 'false'}
                    onClick={startEditing}
                    aria-label={t.clipboardEdit}
                  >
                    <IconEdit size={12} decorative />
                  </button>
                )}
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
              </>
            )}
          </div>
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
                    style={imageStyle}
                    onError={() =>
                      setImageStage((prev) => (prev === 'original' ? 'thumb' : 'none'))
                    }
                  />
                ) : (
                  <IconFileImage size={48} decorative />
                )}
              </div>
            ) : editing ? (
              <textarea
                className="adl-clipboard-viewer__editor"
                value={draft}
                onChange={(event) => {
                  const next = event.target.value;
                  stackRef.current.push(next);
                  updateDraft(next);
                }}
                style={{
                  fontSize: `calc(var(--text-sm) * ${fontScale})`,
                  whiteSpace: wrap ? 'pre-wrap' : 'pre',
                }}
              />
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
                {draft}
              </pre>
            )}
          </CustomScrollArea>
        </div>
      </div>
    </div>,
    document.body,
  );
}
