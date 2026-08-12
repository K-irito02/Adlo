import React, { useRef, useEffect } from 'react';
import { HINT_CLOSE_DELAY_MS } from '../../components/HintCardTrigger';
import { renderHintCard } from '../../utils/renderHintCard';

interface BrowserMenuHintItemProps {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  hint?: string;
  action?: () => void;
  onClose: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
}

export function BrowserMenuHintItem({
  id,
  label,
  icon,
  disabled,
  hint,
  action,
  onClose,
  menuRef,
}: BrowserMenuHintItemProps) {
  const hintElementsRef = useRef<HTMLElement[]>([]);
  const closeTimerRef = useRef<number | undefined>(undefined);

  const hideHint = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
    hintElementsRef.current.forEach((el) => el.remove());
    hintElementsRef.current = [];
  };

  const scheduleHideHint = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(hideHint, HINT_CLOSE_DELAY_MS);
  };

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
      hintElementsRef.current.forEach((el) => el.remove());
      hintElementsRef.current = [];
    };
  }, []);

  const showHint = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
    const button = (e.target as HTMLElement).closest('button');
    const originalTitle = button?.getAttribute('title');
    if (originalTitle) {
      button?.setAttribute('data-original-title', originalTitle);
      button?.removeAttribute('title');
    }

    const menuEl = menuRef.current;
    if (!menuEl) {
      return;
    }

    const btnRect = button?.getBoundingClientRect();
    if (!btnRect) {
      return;
    }

    const dropdownEl = menuEl.querySelector('.adl-menu__dropdown') as HTMLElement | null;
    const anchorRect = dropdownEl?.getBoundingClientRect() ?? menuEl.getBoundingClientRect();

    hideHint();
    hintElementsRef.current = renderHintCard({
      content: hint ?? '',
      buttonRect: btnRect,
      menuRect: anchorRect,
      direction: 'left',
      onCardMouseEnter: () => {
        if (closeTimerRef.current) {
          window.clearTimeout(closeTimerRef.current);
          closeTimerRef.current = undefined;
        }
      },
      onCardMouseLeave: scheduleHideHint,
    });
  };

  return (
    <button
      key={id}
      type="button"
      role="menuitem"
      className="adl-menu__item"
      disabled={disabled}
      onClick={() => {
        action?.();
        onClose();
      }}
    >
      {icon ? <span className="adl-menu__item-icon">{icon}</span> : null}
      <span>{label}</span>
      {hint ? (
        <span
          className="adl-menu-item__hint"
          onMouseEnter={showHint}
          onMouseLeave={scheduleHideHint}
        >
          !
        </span>
      ) : null}
    </button>
  );
}
