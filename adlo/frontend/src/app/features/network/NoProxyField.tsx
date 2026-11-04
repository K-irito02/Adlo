import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { IconChevronDown, IconChevronUp, IconClose, IconExpandVertical } from '@icons';

/** 直连名单条目：唯一分隔符是换行（CR / LF / CRLF），逗号属于条目内容而非分隔符。 */
function splitEntries(value: string): string[] {
  return value
    .split(/[\r\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeText(value: string): string {
  return splitEntries(value).join('\n');
}

const SETTINGS_CONTENT_SELECTOR = '.adl-settings-panel__content';

function contentBounds(anchorEl: HTMLElement): DOMRect | null {
  const container = anchorEl.closest(SETTINGS_CONTENT_SELECTOR);
  return container ? container.getBoundingClientRect() : null;
}

function clampPosition(
  left: number,
  top: number,
  width: number,
  height: number,
  bounds: DOMRect | null,
): { left: number; top: number } {
  const minLeft = (bounds?.left ?? 0) + 4;
  const maxLeft = (bounds?.right ?? window.innerWidth) - width - 4;
  const minTop = (bounds?.top ?? 0) + 4;
  const maxTop = (bounds?.bottom ?? window.innerHeight) - height - 4;
  return {
    left: Math.max(minLeft, Math.min(left, Math.max(minLeft, maxLeft))),
    top: Math.max(minTop, Math.min(top, Math.max(minTop, maxTop))),
  };
}

/**
 * 直连名单编辑（网络 · 代理模式 = 自定义）：
 *
 * - 行内单行翻页：一次显示一条，右侧 `n/total` 与上下箭头只在悬停/聚焦时出现；
 * - 聚焦输入框时按 Enter / Shift+Enter 在当前条目后新增一条（不打开弹层）；
 * - 展开按钮位于输入框与卡片内边距之间，不挤占输入框宽度（三行输入框保持对齐）；
 * - 展开弹层可拖拽标题栏在设置组内容区内移动，关闭后位置不持久化；
 * - 修改通过父级防抖落盘，弹层底部说明「修改会自动保存」。
 */
export function NoProxyField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { t } = useTCopy();
  const countId = useId();
  // 本地草稿保留「刚按 Enter 新增的空条目」；保存值仍过滤空行。
  const [entries, setEntries] = useState<string[]>(() => splitEntries(value));
  const lastValueRef = useRef(value);
  const [index, setIndex] = useState(0);
  const safeIndex = entries.length === 0 ? 0 : Math.min(index, entries.length - 1);
  const current = entries[safeIndex] ?? '';
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const expandRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (lastValueRef.current === value) {
      return;
    }
    lastValueRef.current = value;
    setEntries(splitEntries(value));
  }, [value]);

  const emit = useCallback(
    (next: string[]) => {
      setEntries(next);
      const text = next
        .map((entry) => entry.trim())
        .filter(Boolean)
        .join('\n');
      lastValueRef.current = text;
      onChange(text);
    },
    [onChange],
  );

  const setEntry = useCallback(
    (entryIndex: number, next: string) => {
      if (entries.length === 0) {
        emit([next]);
        return;
      }
      emit(entries.map((entry, idx) => (idx === entryIndex ? next : entry)));
    },
    [emit, entries],
  );

  const insertEntry = useCallback(() => {
    const at = entries.length === 0 ? 0 : safeIndex + 1;
    const next = [...entries];
    next.splice(at, 0, '');
    setEntries(next);
    setIndex(at);
  }, [entries, safeIndex]);

  const step = (delta: number) => {
    if (entries.length <= 1) {
      return;
    }
    setIndex((safeIndex + delta + entries.length) % entries.length);
  };

  const closePopover = useCallback(() => {
    setAnchorEl(null);
    expandRef.current?.focus();
  }, []);

  const countText =
    entries.length === 0
      ? formatT(t, 'dshSettingsNoProxyCount', { current: 0, total: 0 })
      : formatT(t, 'dshSettingsNoProxyCount', {
          current: safeIndex + 1,
          total: entries.length,
        });

  return (
    <span className="adl-network-no-proxy">
      <span className="adl-network-no-proxy__field">
        <input
          type="text"
          className="adl-settings-input adl-network-no-proxy__input"
          aria-label={t.dshSettingsProxyNoProxy}
          aria-describedby={countId}
          placeholder={t.dshSettingsProxyNoProxyPlaceholder}
          value={current}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setEntry(safeIndex, event.target.value)
          }
          onKeyDown={(event) => {
            // Enter / Shift+Enter：在当前条目后新增一条，不打开弹层。IME 上屏不触发。
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.stopPropagation();
              insertEntry();
            }
          }}
        />
        <span className="adl-network-no-proxy__counter" aria-hidden="true">
          {countText}
        </span>
        <span id={countId} className="sr-only">
          {countText}
        </span>
        {entries.length > 1 ? (
          <span className="adl-network-no-proxy__stepper">
            <button
              type="button"
              className="adl-network-no-proxy__step"
              aria-label={t.dshSettingsNoProxyPrev}
              onClick={() => step(-1)}
            >
              <IconChevronUp size={12} decorative />
            </button>
            <button
              type="button"
              className="adl-network-no-proxy__step"
              aria-label={t.dshSettingsNoProxyNext}
              onClick={() => step(1)}
            >
              <IconChevronDown size={12} decorative />
            </button>
          </span>
        ) : null}
      </span>
      <button
        ref={expandRef}
        type="button"
        className={`adl-network-no-proxy__expand${anchorEl ? ' is-open' : ''}`}
        title={t.dshSettingsNoProxyExpand}
        aria-label={t.dshSettingsNoProxyExpand}
        aria-haspopup="dialog"
        aria-expanded={anchorEl !== null}
        onClick={() => {
          if (anchorEl) {
            closePopover();
          } else {
            setAnchorEl(expandRef.current);
          }
        }}
      >
        <IconExpandVertical size={18} decorative />
      </button>
      {anchorEl ? (
        <NoProxyEditorPopover
          anchorEl={anchorEl}
          value={value}
          onChange={onChange}
          onClose={closePopover}
        />
      ) : null}
    </span>
  );
}

function NoProxyEditorPopover({
  anchorEl,
  value,
  onChange,
  onClose,
}: {
  anchorEl: HTMLElement;
  value: string;
  onChange: (next: string) => void;
  onClose: () => void;
}) {
  const { t } = useTCopy();
  const titleId = useId();
  const popoverRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(() => normalizeText(value));
  const [geom, setGeom] = useState<{ left: number; top: number; width: number } | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    left: number;
    top: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const count = splitEntries(draft).length;

  useLayoutEffect(() => {
    const anchorRect = anchorEl.getBoundingClientRect();
    const bounds = contentBounds(anchorEl);
    const width = Math.min(380, Math.max(240, (bounds?.width ?? window.innerWidth) - 8));
    const height = popoverRef.current?.offsetHeight ?? 300;
    const position = clampPosition(
      anchorRect.right - width,
      anchorRect.bottom + 6,
      width,
      height,
      bounds,
    );
    setGeom({ ...position, width });
  }, [anchorEl]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [draft, geom]);

  // 首帧高度按 300 兜底，真实高度可能更高：渲染后用实际高度再夹一次。
  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el || !geom) {
      return;
    }
    const next = clampPosition(
      geom.left,
      geom.top,
      geom.width,
      el.offsetHeight,
      contentBounds(anchorEl),
    );
    if (next.left !== geom.left || next.top !== geom.top) {
      setGeom({ ...geom, ...next });
    }
  }, [anchorEl, geom]);

  // 设置内容区滚动 / 窗口尺寸变化时把弹层夹回内容区，避免与锚点视觉脱离。
  useEffect(() => {
    if (!geom) {
      return;
    }
    const reposition = () => {
      const el = popoverRef.current;
      if (!el) {
        return;
      }
      setGeom((prev) => {
        if (!prev) {
          return prev;
        }
        const next = clampPosition(
          prev.left,
          prev.top,
          prev.width,
          el.offsetHeight,
          contentBounds(anchorEl),
        );
        return next.left === prev.left && next.top === prev.top ? prev : { ...prev, ...next };
      });
    };
    document.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [anchorEl, geom]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || anchorEl.contains(target)) {
        return;
      }
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [anchorEl, onClose]);

  const onHeaderPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button') || !geom) {
      return;
    }
    event.preventDefault();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      left: geom.left,
      top: geom.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onHeaderPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !geom) {
      return;
    }
    const height = popoverRef.current?.offsetHeight ?? 300;
    const position = clampPosition(
      drag.left + (event.clientX - drag.startX),
      drag.top + (event.clientY - drag.startY),
      geom.width,
      height,
      contentBounds(anchorEl),
    );
    setGeom({ ...position, width: geom.width });
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) {
      return;
    }
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  if (!geom) {
    return null;
  }

  return createPortal(
    <div
      ref={popoverRef}
      className="adl-network-no-proxy__popover"
      style={{ left: geom.left, top: geom.top, width: geom.width }}
      role="dialog"
      aria-labelledby={titleId}
      aria-modal="false"
    >
      <div
        className={`adl-network-no-proxy__popover-head${dragging ? ' is-dragging' : ''}`}
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <span id={titleId} className="adl-network-no-proxy__popover-title">
          {t.dshSettingsProxyNoProxy}
        </span>
        <span className="adl-network-no-proxy__popover-count">
          {formatT(t, 'dshSettingsNoProxyItemCount', { count })}
        </span>
        <span className="adl-network-no-proxy__popover-spacer" />
        <button
          type="button"
          className="adl-network-no-proxy__popover-close"
          title={t.dshSettingsNoProxyClose}
          aria-label={t.dshSettingsNoProxyClose}
          onClick={onClose}
        >
          <IconClose size={14} decorative />
        </button>
      </div>
      <div className="adl-network-no-proxy__scroll">
        <textarea
          ref={textareaRef}
          className="adl-network-no-proxy__textarea"
          aria-label={t.dshSettingsProxyNoProxy}
          value={draft}
          spellCheck={false}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
            setDraft(event.target.value);
            onChange(event.target.value);
          }}
        />
      </div>
      <div className="adl-network-no-proxy__footer">{t.dshSettingsNoProxyEditorHint}</div>
    </div>,
    document.body,
  );
}
