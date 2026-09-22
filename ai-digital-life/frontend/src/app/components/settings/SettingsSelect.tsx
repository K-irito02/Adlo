import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconChevronDown } from '../../icons';
import { useRevealScrollbar } from '../../hooks/useRevealScrollbar';
import { RevealScrollbar } from '../RevealScrollbar';

export interface SettingsSelectOption {
  value: string;
  label: string;
}

interface SettingsSelectProps {
  value: string;
  options: SettingsSelectOption[];
  onChange: (v: string) => void;
  /** 悬停/聚焦选项时触发（字体预览用）；离开选项或关闭时传 null */
  onHoverOption?: (v: string | null) => void;
  label: string;
  className?: string;
  disabled?: boolean;
  optionStyle?: (value: string) => React.CSSProperties | undefined;
}

interface MenuGeometry {
  top: number;
  left: number;
  width: number;
}

const MENU_OFFSET = 4;
const MENU_MAX_HEIGHT = 240;
const VIEWPORT_MARGIN = 8;

/**
 * 设置面板可复用自定义下拉（替代原生 select）。
 * 视觉沿用项目 adl-menu 菜单语言 + 设置灰底直角（--bg-muted / --radius-sm），
 * 滚动条复用项目 RevealScrollbar（overlay 悬停显现式，与文件树/剪贴板同源），
 * 菜单经 Portal 挂载到 body（fixed 定位），不受祖先 overflow 裁剪。
 * 支持悬停预览回调、键盘导航（上下/回车/Esc）、点击外部关闭。
 * 纯前端组件，Tauri / 浏览器双端行为一致。
 */
export function SettingsSelect({
  value,
  options,
  onChange,
  onHoverOption,
  label,
  className,
  disabled,
  optionStyle,
}: SettingsSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      options.findIndex((o) => o.value === value),
    ),
  );
  const [menuGeometry, setMenuGeometry] = useState<MenuGeometry | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // geometry 去重：值不变不 setState，避免菜单内滚动/拖拽时逐帧重渲染致跳动。
  const geometryRef = useRef<MenuGeometry | null>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);
  // useRevealScrollbar 每次渲染返回新对象——下游 effect 只允许依赖其中稳定的 ref，
  // 否则每次渲染都重跑（scrollIntoView 回写 scrollTop 又触发 measure 重渲染 = 无限循环，
  // 日志实测 open/scroll 以 ~5ms 交替、scrollTop 被钉死在 75，这就是滚轮/拖拽失效与闪烁的根因）。
  const scrollbar = useRevealScrollbar([open, options.length, menuGeometry !== null]);
  const listRef = scrollbar.scrollRef;
  // 仅键盘上下键导航才把高亮项滚入可见区；鼠标悬停不抢滚动。
  const keyboardNavRef = useRef(false);

  useEffect(() => {
    const idx = options.findIndex((o) => o.value === value);
    if (idx >= 0) {
      setActiveIndex(idx);
    }
  }, [value, options]);

  const close = useCallback(() => {
    setOpen(false);
    onHoverOption?.(null);
  }, [onHoverOption]);

  const updateGeometry = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const width = Math.max(rect.width, 160);
    // 右对齐触发器；钳制在视口内。
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(rect.right - width, window.innerWidth - width - VIEWPORT_MARGIN),
    );
    const belowTop = rect.bottom + MENU_OFFSET;
    const aboveTop = rect.top - MENU_OFFSET - MENU_MAX_HEIGHT;
    const fitsBelow = belowTop + MENU_MAX_HEIGHT <= window.innerHeight - VIEWPORT_MARGIN;
    const top = fitsBelow ? belowTop : Math.max(VIEWPORT_MARGIN, aboveTop);
    const next = { top, left, width };
    const prev = geometryRef.current;
    if (prev && prev.top === next.top && prev.left === next.left && prev.width === next.width) {
      return;
    }
    geometryRef.current = next;
    setMenuGeometry(next);
  }, []);

  useLayoutEffect(() => {
    if (open) {
      updateGeometry();
    }
  }, [open, updateGeometry]);

  const commit = useCallback(
    (v: string) => {
      onHoverOption?.(null);
      setOpen(false);
      if (v !== value) {
        onChange(v);
      }
    },
    [onChange, onHoverOption, value],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      close();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        triggerRef.current?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        keyboardNavRef.current = true;
        setActiveIndex((i) => {
          const next = Math.min(options.length - 1, i + 1);
          onHoverOption?.(options[next]?.value ?? null);
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        keyboardNavRef.current = true;
        setActiveIndex((i) => {
          const next = Math.max(0, i - 1);
          onHoverOption?.(options[next]?.value ?? null);
          return next;
        });
      } else if (e.key === 'Enter') {
        const opt = options[activeIndex];
        if (
          menuRef.current?.contains(document.activeElement) ||
          document.activeElement === triggerRef.current ||
          document.activeElement === document.body
        ) {
          e.preventDefault();
          if (opt) {
            commit(opt.value);
          }
        }
      }
    };
    // 祖先滚动/视口变化时跟随触发器（capture 捕获面板内滚动）。
    // 菜单自身内部滚动（滚轮/滑块拖拽）不重定位，否则逐帧重渲染致跳动闪烁。
    const handleReposition = (e: Event) => {
      if (e.target instanceof Node && menuRef.current?.contains(e.target)) {
        return;
      }
      updateGeometry();
    };
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    document.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [open, close, commit, options, activeIndex, onHoverOption, updateGeometry]);

  // 仅键盘导航滚入高亮项（jsdom 无该 API，守卫）。
  // 注意 deps 禁止带 scrollbar 对象（每次渲染新身份，会引发无限循环）。
  useEffect(() => {
    if (!open || !keyboardNavRef.current) {
      return;
    }
    keyboardNavRef.current = false;
    const list = listRef.current;
    const active = list?.querySelector('[data-active="true"]');
    if (active && typeof (active as Element).scrollIntoView === 'function') {
      (active as Element).scrollIntoView({ block: 'nearest' });
    }
  }, [open, activeIndex, listRef]);

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) {
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen((v) => !v);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`adl-settings-dropdown${open ? ' is-open' : ''} ${className ?? ''}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className="adl-settings-dropdown__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          if (disabled) {
            return;
          }
          if (open) {
            close();
          } else {
            setOpen(true);
          }
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="adl-settings-dropdown__value">{selected?.label ?? value}</span>
        <IconChevronDown size={14} decorative />
      </button>
      {open &&
        menuGeometry &&
        createPortal(
          <div
            ref={menuRef}
            className="adl-settings-dropdown__menu"
            style={{
              top: menuGeometry.top,
              left: menuGeometry.left,
              width: menuGeometry.width,
            }}
            {...scrollbar.hoverProps}
            onMouseLeave={() => onHoverOption?.(null)}
          >
            <ul
              id={listId}
              role="listbox"
              aria-label={label}
              className="adl-settings-dropdown__list adl-reveal-scroll"
              ref={scrollbar.scrollRef as unknown as React.Ref<HTMLUListElement>}
            >
              {options.map((opt, idx) => {
                const isSelected = opt.value === value;
                return (
                  <li key={opt.value || `__empty_${idx}`} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      data-active={idx === activeIndex}
                      className={`adl-settings-dropdown__item${isSelected ? ' is-selected' : ''}${idx === activeIndex ? ' is-active' : ''}`}
                      style={optionStyle?.(opt.value)}
                      onClick={() => commit(opt.value)}
                      onMouseEnter={() => {
                        setActiveIndex(idx);
                        onHoverOption?.(opt.value);
                      }}
                      onFocus={() => {
                        setActiveIndex(idx);
                        onHoverOption?.(opt.value);
                      }}
                    >
                      <span>{opt.label}</span>
                      {isSelected && <IconCheck size={14} decorative />}
                    </button>
                  </li>
                );
              })}
            </ul>
            <RevealScrollbar
              controller={scrollbar.scrollable ? { ...scrollbar, visible: true } : scrollbar}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
