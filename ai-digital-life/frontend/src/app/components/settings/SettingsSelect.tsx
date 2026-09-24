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
  /** 向下打开：菜单顶边相对视口（与 bottom 互斥） */
  top?: number;
  /** 向上打开：菜单底边锚定触发器上边缘，与实际菜单高度无关（与 top 互斥） */
  bottom?: number;
  /** 向上打开且可用高度不足时收窄菜单盒（不大于 MENU_MAX_HEIGHT；向下打开为 undefined，走 CSS 上限） */
  maxHeight?: number;
  left: number;
  width: number;
}

const MENU_OFFSET = 4;
// 与 settings.css `.adl-settings-dropdown__menu max-height` 同步修改。
const MENU_MAX_HEIGHT = 240;
const VIEWPORT_MARGIN = 8;
// 菜单盒上下 padding（space-1×2）= 8：列表区上限 = 菜单盒上限 − 8（与 CSS `240−8=232` 同口径）。
const MENU_LIST_VERTICAL_PADDING = 8;
// 向上收窄时的最小菜单高：低于此值菜单不可用，宁可溢出不断臂。
const MENU_MIN_HEIGHT = 80;

/**
 * 设置面板可复用自定义下拉（替代原生 select）。
 * 视觉对齐项目 adl-menu 菜单语言 + 设置灰底直角（--bg-muted / --radius-sm），
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
    const fitsBelow = belowTop + MENU_MAX_HEIGHT <= window.innerHeight - VIEWPORT_MARGIN;
    // 向下：顶边贴触发器底缘。向上：底边锚定触发器上缘（用 CSS bottom，
    // 不按固定 MENU_MAX_HEIGHT 推 top——短菜单会整体上浮、与触发器脱节），
    // 同时按触发器上方可用高度收窄菜单（补回旧上缘钳制的保护，改动态 maxHeight 实现）。
    const next: MenuGeometry = fitsBelow
      ? { top: belowTop, left, width }
      : {
          bottom: window.innerHeight - rect.top + MENU_OFFSET,
          maxHeight: Math.min(
            MENU_MAX_HEIGHT,
            Math.max(MENU_MIN_HEIGHT, rect.top - MENU_OFFSET - VIEWPORT_MARGIN),
          ),
          left,
          width,
        };
    const prev = geometryRef.current;
    if (
      prev &&
      prev.top === next.top &&
      prev.bottom === next.bottom &&
      prev.maxHeight === next.maxHeight &&
      prev.left === next.left &&
      prev.width === next.width
    ) {
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
      // 菜单卸载后焦点无处可去，回落触发器（Esc 路径同理，见下方）。
      triggerRef.current?.focus();
      if (v !== value) {
        onChange(v);
      }
    },
    [onChange, onHoverOption, value],
  );

  // 打开时把高亮同步到已选项并置滚动旗：首帧即滚入可见（block nearest，可见则不动）。
  const openMenu = useCallback(() => {
    const idx = options.findIndex((o) => o.value === value);
    if (idx >= 0) {
      setActiveIndex(idx);
    }
    keyboardNavRef.current = true;
    setOpen(true);
  }, [options, value]);

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
        // updater 内禁止副作用（StrictMode 可双调用）：闭包 activeIndex 是新鲜的，直接计算。
        const next = Math.min(options.length - 1, activeIndex + 1);
        onHoverOption?.(options[next]?.value ?? null);
        setActiveIndex(next);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        keyboardNavRef.current = true;
        const next = Math.max(0, activeIndex - 1);
        onHoverOption?.(options[next]?.value ?? null);
        setActiveIndex(next);
      } else if (e.key === 'Tab') {
        // Tab 移出即关闭（不 preventDefault，放行焦点自然移动）。
        // 方向键无焦点门控依赖于此：焦点离场必先经过 Tab 关闭，故方向键可直接处理、无需先校验焦点位置。
        close();
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

  // 仅键盘导航/打开同步滚入高亮项（jsdom 无该 API，守卫）。
  // 注意 deps 禁止带 scrollbar 对象（每次渲染新身份，会引发无限循环）。
  useEffect(() => {
    if (!open || !keyboardNavRef.current) {
      return;
    }
    const list = listRef.current;
    // 首开时菜单 DOM 尚未挂载（等 menuGeometry 落定）：保留旗标，等 geometry 就绪的下一轮再滚。
    if (!list) {
      return;
    }
    keyboardNavRef.current = false;
    const active = list.querySelector('[data-active="true"]');
    if (active && typeof (active as Element).scrollIntoView === 'function') {
      (active as Element).scrollIntoView({ block: 'nearest' });
    }
  }, [open, activeIndex, listRef, menuGeometry]);

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) {
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open) {
        close();
      } else {
        openMenu();
      }
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
        aria-controls={open ? listId : undefined}
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          if (disabled) {
            return;
          }
          if (open) {
            close();
          } else {
            openMenu();
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
              bottom: menuGeometry.bottom,
              left: menuGeometry.left,
              width: menuGeometry.width,
              maxHeight: menuGeometry.maxHeight,
            }}
            {...scrollbar.hoverProps}
            // 后写获胜会覆盖 hook 的 onMouseLeave（显现状态卡死），故合并调用。
            onMouseLeave={() => {
              scrollbar.hoverProps.onMouseLeave();
              onHoverOption?.(null);
            }}
          >
            <ul
              id={listId}
              role="listbox"
              aria-label={label}
              className="adl-settings-dropdown__list adl-reveal-scroll"
              ref={scrollbar.scrollRef as unknown as React.Ref<HTMLUListElement>}
              style={
                menuGeometry.maxHeight != null
                  ? { maxHeight: menuGeometry.maxHeight - MENU_LIST_VERTICAL_PADDING }
                  : undefined
              }
            >
              {options.map((opt, idx) => {
                const isSelected = opt.value === value;
                return (
                  <li key={opt.value || `__empty_${idx}`} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      data-active={idx === activeIndex || undefined}
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
