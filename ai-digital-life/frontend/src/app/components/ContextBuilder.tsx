import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type IconName } from '../../design-system/icons';
import { TooltipSimple } from './Tooltip';
import { Icon } from './Icon';
import { useTCopy } from '../i18n/useTCopy';
import { useClickOutside } from '../hooks/useClickOutside';

interface ContextBuilderProps {
  onAddContext: (type: string, value?: string) => void;
  activeContexts?: Array<{ type: string; label: string; removable: boolean }>;
}

interface ContextItem {
  type: string;
  label: string;
  icon: IconName;
  section: 'mode' | 'model' | 'reference';
}

export function ContextBuilder({ onAddContext, activeContexts = [] }: ContextBuilderProps) {
  const { t, formatT } = useTCopy();

  const CONTEXT_ITEMS: ContextItem[] = useMemo(
    () => [
      { type: 'plan', label: t.contextPlanMode, icon: 'clipboard-list' as const, section: 'mode' },
      { type: 'debug', label: t.contextDebugMode, icon: 'bug' as const, section: 'mode' },
      {
        type: 'ask',
        label: t.contextQAMode,
        icon: 'message-circle-question' as const,
        section: 'mode',
      },
      { type: 'model', label: t.contextModelSelect, icon: 'cpu' as const, section: 'model' },
      { type: 'skills', label: t.contextSkillLibrary, icon: 'sparkles' as const, section: 'model' },
      { type: 'mcp', label: t.contextMCPService, icon: 'plug' as const, section: 'model' },
      {
        type: '@file',
        label: t.contextReferenceFile,
        icon: 'file-text' as const,
        section: 'reference',
      },
      {
        type: '@doc',
        label: t.contextReferenceDoc,
        icon: 'book-open' as const,
        section: 'reference',
      },
      { type: '@url', label: t.contextReferenceLink, icon: 'link' as const, section: 'reference' },
      {
        type: '@codebase',
        label: t.contextCodebaseContext,
        icon: 'database' as const,
        section: 'reference',
      },
    ],
    [t]
  );

  const SECTION_LABELS: Record<string, string> = {
    mode: t.contextSectionMode,
    model: t.contextSectionModel,
    reference: t.contextSectionReference,
  };

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  useClickOutside(containerRef, isOpen, {
    onOutsideClick: () => {
      setIsOpen(false);
      setSearchQuery('');
      setFocusedIndex(-1);
    },
    onEscape: () => {
      setIsOpen(false);
      setSearchQuery('');
      setFocusedIndex(-1);
      buttonRef.current?.focus();
    },
  });

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) {
      return CONTEXT_ITEMS;
    }
    const q = searchQuery.toLowerCase();
    return CONTEXT_ITEMS.filter(
      (item) => item.label.toLowerCase().includes(q) || item.type.toLowerCase().includes(q)
    );
  }, [searchQuery, CONTEXT_ITEMS]);

  const groupedItems = useMemo(() => {
    const groups: Record<string, ContextItem[]> = {};
    for (const item of filteredItems) {
      if (!groups[item.section]) {
        groups[item.section] = [];
      }
      groups[item.section].push(item);
    }
    return groups;
  }, [filteredItems]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
    if (!isOpen) {
      setSearchQuery('');
      setFocusedIndex(-1);
    }
  }, [isOpen]);

  const handleSelectItem = useCallback(
    (item: ContextItem) => {
      onAddContext(item.type);
      setIsOpen(false);
      setSearchQuery('');
      setFocusedIndex(-1);
      buttonRef.current?.focus();
    },
    [onAddContext]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const flatItems = filteredItems;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((prev) => (prev < flatItems.length - 1 ? prev + 1 : prev));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((prev) => (prev > 0 ? prev - 1 : -1));
          break;
        case 'Enter':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < flatItems.length) {
            handleSelectItem(flatItems[focusedIndex]);
          }
          break;
        case 'Home':
          e.preventDefault();
          setFocusedIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setFocusedIndex(flatItems.length - 1);
          break;
      }
    },
    [filteredItems, focusedIndex, handleSelectItem]
  );

  useEffect(() => {
    if (focusedIndex >= 0) {
      itemRefs.current.get(focusedIndex)?.focus();
    }
  }, [focusedIndex]);

  return (
    <div className="context-builder" ref={containerRef}>
      <TooltipSimple content={t.contextAddContext} placement="top">
        <button
          ref={buttonRef}
          type="button"
          className={`context-builder__trigger${isOpen ? ' context-builder__trigger--open' : ''}`}
          onClick={handleToggle}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <Icon name="plus" size="sm" />
        </button>
      </TooltipSimple>

      {isOpen && (
        <div
          ref={menuRef}
          className="context-builder__popover"
          role="listbox"
          aria-label={t.contextAddContextAria}
          onKeyDown={handleKeyDown}
        >
          <div className="context-builder__search">
            <Icon name="search" size="xs" />
            <input
              ref={searchInputRef}
              type="text"
              className="context-builder__search-input"
              placeholder={t.contextSearchPlaceholder}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setFocusedIndex(0);
              }}
              aria-label={t.contextSearchAria}
            />
          </div>

          <div className="context-builder__items">
            {Object.entries(groupedItems).map(([section, items]) => (
              <div key={section} className="context-builder__group">
                <span className="context-builder__group-label">{SECTION_LABELS[section]}</span>
                {items.map((item, _idx) => (
                  <button
                    key={item.type}
                    ref={(el) => {
                      if (el) {
                        const globalIdx = filteredItems.indexOf(item);
                        itemRefs.current.set(globalIdx, el);
                      }
                    }}
                    type="button"
                    className="context-builder__item"
                    onClick={() => handleSelectItem(item)}
                    role="option"
                    tabIndex={-1}
                    data-context-type={item.type}
                  >
                    <span className="context-builder__item-icon">
                      <Icon name={item.icon} size="sm" />
                    </span>
                    <span className="context-builder__item-label">{item.label}</span>
                    <span className="context-builder__item-type">{item.type}</span>
                  </button>
                ))}
              </div>
            ))}

            {filteredItems.length === 0 && (
              <p className="context-builder__empty">{t.contextNoMatch}</p>
            )}
          </div>
        </div>
      )}

      {activeContexts.length > 0 && !isOpen && (
        <div className="context-builder__active-list">
          {activeContexts.map((ctx) => (
            <span key={ctx.type} className="context-builder__chip">
              {ctx.label}
              {ctx.removable && (
                <button
                  type="button"
                  className="context-builder__chip-remove"
                  onClick={() => onAddContext(ctx.type)}
                  aria-label={formatT(t, 'contextRemoveAria', { label: ctx.label })}
                >
                  <Icon name="close" size="xs" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default ContextBuilder;
export type { ContextBuilderProps };
