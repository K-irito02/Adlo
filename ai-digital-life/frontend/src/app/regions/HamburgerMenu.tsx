import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { CopyDict } from '../i18n/types';
import type { MenuItem } from './titleBarMenus';
import { IconChevronRight } from '../icons';
import { useAppStore } from '../stores/slicedStore';

const HOVER_DELAY_MS = 120;

interface CategoryItem {
  id: 'file' | 'view' | 'help' | 'command';
  label: string;
  items?: MenuItem[];
  action?: () => void;
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
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAllMenus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [hamburgerOpen, closeAllMenus]);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

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

  const categories: CategoryItem[] = useMemo(
    () => [
      { id: 'file', label: t.menuFile, items: fileItems },
      { id: 'view', label: t.menuView, items: viewItems },
      { id: 'help', label: t.menuHelp, items: helpItems },
      { id: 'command', label: t.menuCommandPalette, action: onOpenCommandPalette },
    ],
    [t, fileItems, viewItems, helpItems, onOpenCommandPalette],
  );

  return (
    <div ref={containerRef} className="adl-hamburger">
      <button
        type="button"
        className={`adl-hamburger__trigger adl-iconstrip__button${hamburgerOpen ? ' is-open' : ''}`}
        onClick={() => setHamburgerOpen(!hamburgerOpen)}
        aria-haspopup="menu"
        aria-expanded={hamburgerOpen}
        aria-label={t.appMenu}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 6h18" />
          <path d="M3 12h18" />
          <path d="M3 18h18" />
        </svg>
      </button>
      {hamburgerOpen ? (
        <div className="adl-hamburger__dropdown" role="menu">
          {categories.map((cat) => {
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
                  type="button"
                  role="menuitem"
                  aria-haspopup={hasSubmenu ? 'true' : undefined}
                  aria-expanded={hasSubmenu ? hoveredMenuCategory === cat.id : undefined}
                  className={`adl-hamburger__item${hoveredMenuCategory === cat.id ? ' is-hovered' : ''}`}
                  onClick={() => {
                    if (cat.action) {
                      cat.action();
                      closeAllMenus();
                    }
                  }}
                >
                  <span>{cat.label}</span>
                  {hasSubmenu ? <IconChevronRight size={12} decorative /> : null}
                </button>
                {hasSubmenu && hoveredMenuCategory === cat.id ? (
                  <div
                    className="adl-hamburger__submenu"
                    role="menu"
                    onMouseEnter={handleSubmenuEnter}
                    onMouseLeave={handleSubmenuLeave}
                  >
                    {cat.items!.map((item, index) => {
                      if (item.separator) {
                        return (
                          <div
                            key={`sep-${index}`}
                            className="adl-hamburger__sep"
                            role="separator"
                          />
                        );
                      }
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitem"
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
