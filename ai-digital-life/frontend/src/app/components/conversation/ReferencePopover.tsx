import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReferenceItem, ReferenceKind } from '@shared/ipc/reference';
import type { CopyDict } from '../../i18n';
import { IconFileText, IconHash, IconTerminal, IconSearch } from '../../icons';

interface ReferencePopoverProps {
  t: CopyDict;
  open: boolean;
  items: ReferenceItem[];
  onSelect: (item: ReferenceItem) => void;
  onClose: () => void;
}

function kindIcon(kind: ReferenceKind) {
  switch (kind) {
    case 'file':
      return <IconFileText size={14} decorative />;
    case 'symbol':
      return <IconHash size={14} decorative />;
    case 'terminal':
      return <IconTerminal size={14} decorative />;
    case 'selection':
      return <IconFileText size={14} decorative />;
  }
}

function kindLabel(t: CopyDict, kind: ReferenceKind): string {
  const map: Record<ReferenceKind, keyof CopyDict> = {
    file: 'refFile',
    symbol: 'refSymbol',
    terminal: 'refTerminal',
    selection: 'refSelection',
  };
  return t[map[kind]] as string;
}

export function ReferencePopover({ t, open, items, onSelect, onClose }: ReferencePopoverProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) {
      return items;
    }
    const lower = query.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(lower) || item.detail?.toLowerCase().includes(lower),
    );
  }, [items, query]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        setQuery('');
        setActiveIndex(0);
      });
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filtered[activeIndex]) {
        e.preventDefault();
        onSelect(filtered[activeIndex]);
        onClose();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [activeIndex, filtered, onClose, onSelect],
  );

  if (!open) {
    return null;
  }

  return (
    <div ref={ref} className="adl-reference-popover" role="listbox" onKeyDown={handleKeyDown}>
      <div className="adl-reference-popover__search">
        <IconSearch size={14} decorative />
        <input
          ref={inputRef}
          type="text"
          className="adl-reference-popover__input"
          placeholder={t.refSearchPlaceholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
        />
      </div>
      <ul className="adl-reference-popover__list">
        {filtered.map((item, idx) => (
          <li
            key={item.id}
            role="option"
            aria-selected={idx === activeIndex}
            className={`adl-reference-popover__item${idx === activeIndex ? ' is-active' : ''}`}
            onClick={() => {
              onSelect(item);
              onClose();
            }}
            onMouseEnter={() => setActiveIndex(idx)}
          >
            {kindIcon(item.kind)}
            <span className="adl-reference-popover__label">{item.label}</span>
            {item.detail && <span className="adl-reference-popover__detail">{item.detail}</span>}
            <span className="adl-chip adl-chip--xs adl-chip--muted">{kindLabel(t, item.kind)}</span>
          </li>
        ))}
        {filtered.length === 0 && <li className="adl-reference-popover__empty">{t.noResults}</li>}
      </ul>
    </div>
  );
}
