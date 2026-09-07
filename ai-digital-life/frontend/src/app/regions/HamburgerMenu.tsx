import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { CopyDict } from '../i18n/types';
import type { MenuItem } from './titleBarMenus';
import { IconChevronRight, IconMenu } from '../icons';
import { useAppStore } from '../stores/slicedStore';

const HOVER_DELAY_MS = 120;

interface CategoryItem {
  id: 'file' | 'view' | 'help' | 'command';
  label: string;
  items?: MenuItem[];
  action?: () => void;
}

function useViewportFlip(ref: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  const [flipUp, setFlipUp] = useState(false);

  useEffect(() => {
    if (!enabled || !ref.current) {
      setFlipUp(false);
      return;
    }
    const el = ref.current;
    const rect = el.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    if (rect.bottom > viewportHeight - 8) {
      setFlipUp(true);
    } else {
      setFlipUp(false);
    }
  }, [ref, enabled]);

  return flipUp;
}

export function HamburgerMenu({
  t,
  fileItems,
  viewItems,
  helpItems,
  onOpenCommandPalette,
}: {
  t: CopyDict;
  fileItems: MenuItem[];
  viewItems: MenuItem[];
  helpItems: MenuItem[];
  onOpenCommandPalette: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [focusedIndex, setFocusedIndex] = useState(-1);

  const {
    hamburgerOpen,
    hoveredMenuCategory,
    setHamburgerOpen,
    setHoveredMenuCategory,
    closeAllMenus,
  } = useAppStore(
    useShallow((state) => ({
      hamburgerOpen: state.hamburgerOpen,
      hoveredMenuCategory: state.hoveredMenuCategory,
      setHamburgerOpen: state.setHamburgerOpen,
      setHoveredMenuCategory: state.setHoveredMenuCategory,
      closeAllMenus: state.closeAllMenus,
    })),
  );

  const flipUp = useViewportFlip(submenuRef, !!hoveredMenuCategory);

  const categories: CategoryItem[] = useMemo(
    () => [
      { id: 'file', label: t.menuFile, items: fileItems },
      { id: 'view', label: t.menuView, items: viewItems },
      { id: 'help', label: t.menuHelp, items: helpItems },
      { id: 'command', label: t.menuCommandPalette, action: onOpenCommandPalette },
    ],
    [t, fileItems, viewItems, helpItems, onOpenCommandPalette],
  );

  useEffect(() => {
    if (!hamburgerOpen) {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      return;
    }
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeAllMenus();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [hamburgerOpen, closeAllMenus]);

  useEffect(() => {
    if (!hamburgerOpen) {
      setFocusedIndex(-1);
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAllMenus();
        triggerRef.current?.focus();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev < categories.length - 1 ? prev + 1 : 0;
          return next;
        });
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev > 0 ? prev - 1 : categories.length - 1;
          return next;
        });
      }
      if (event.key === 'ArrowRight' && focusedIndex >= 0) {
        const cat = categories[focusedIndex];
        if (cat.items && cat.items.length > 0) {
          setHoveredMenuCategory(cat.id as 'file' | 'view' | 'help');
        }
      }
      if (event.key === 'ArrowLeft' && hoveredMenuCategory) {
        setHoveredMenuCategory(null);
      }
      if (event.key === 'Enter' && focusedIndex >= 0) {
        const cat = categories[focusedIndex];
        if (cat.action) {
          cat.action();
          closeAllMenus();
        }
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        closeAllMenus();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [
    hamburgerOpen,
    closeAllMenus,
    focusedIndex,
    hoveredMenuCategory,
    setHoveredMenuCategory,
    categories,
  ]);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (hamburgerOpen && focusedIndex >= 0 && focusRefs.current[focusedIndex]) {
      focusRefs.current[focusedIndex]?.focus();
    }
  }, [hamburgerOpen, focusedIndex]);

  const handleCategoryEnter = useCallback(
    (category: 'file' | 'view' | 'help') => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      setHoveredMenuCategory(category);
    },
    [setHoveredMenuCategory],
  );

  const handleCategoryLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredMenuCategory(null);
    }, HOVER_DELAY_MS);
  }, [setHoveredMenuCategory]);

  const handleSubmenuEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  const handleSubmenuLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredMenuCategory(null);
    }, HOVER_DELAY_MS);
  }, [setHoveredMenuCategory]);

  return (
    <div ref={containerRef} className="adl-hamburger">
      <button
        ref={triggerRef}
        type="button"
        className={`adl-hamburger__trigger adl-iconstrip__button${hamburgerOpen ? ' is-open' : ''}`}
        onClick={() => setHamburgerOpen(!hamburgerOpen)}
        aria-haspopup="menu"
        aria-expanded={hamburgerOpen}
        aria-label={t.appMenu}
      >
        <IconMenu size={16} decorative />
      </button>
      {hamburgerOpen ? (
        <div ref={dropdownRef} className="adl-hamburger__dropdown" role="menu">
          {categories.map((cat, index) => {
            const hasSubmenu = cat.items && cat.items.length > 0;
            return (
              <div
                key={cat.id}
                className="adl-hamburger__item-wrap"
                onMouseEnter={() => {
                  if (hasSubmenu) {
                    handleCategoryEnter(cat.id as 'file' | 'view' | 'help');
                  }
                }}
                onMouseLeave={() => {
                  if (hasSubmenu) {
                    handleCategoryLeave();
                  }
                }}
              >
                <button
                  ref={(el) => {
                    focusRefs.current[index] = el;
                  }}
                  type="button"
                  role="menuitem"
                  aria-haspopup={hasSubmenu ? 'true' : undefined}
                  aria-expanded={hasSubmenu ? hoveredMenuCategory === cat.id : undefined}
                  tabIndex={focusedIndex === index ? 0 : -1}
                  className={`adl-hamburger__item${hoveredMenuCategory === cat.id || focusedIndex === index ? ' is-hovered' : ''}`}
                  onClick={() => {
                    if (cat.action) {
                      cat.action();
                      closeAllMenus();
                    }
                  }}
                  onFocus={() => setFocusedIndex(index)}
                >
                  <span>{cat.label}</span>
                  {hasSubmenu ? <IconChevronRight size={12} decorative /> : null}
                </button>
                {hasSubmenu && hoveredMenuCategory === cat.id ? (
                  <div
                    ref={submenuRef}
                    className={`adl-hamburger__submenu${flipUp ? ' adl-hamburger__submenu--flip' : ''}`}
                    role="menu"
                    onMouseEnter={handleSubmenuEnter}
                    onMouseLeave={handleSubmenuLeave}
                  >
                    {cat.items!.map((item, idx) => {
                      if (item.separator) {
                        return (
                          <div key={`sep-${idx}`} className="adl-hamburger__sep" role="separator" />
                        );
                      }
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitem"
                          tabIndex={-1}
                          className="adl-hamburger__subitem"
                          disabled={item.disabled}
                          onClick={() => {
                            item.action?.();
                            closeAllMenus();
                          }}
                        >
                          <span>{item.label}</span>
                          {item.shortcut ? (
                            <span className="adl-hamburger__shortcut">{item.shortcut}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
