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

    const rect = (r: DOMRect) =>
      `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
    const centerY = btnRect.top + btnRect.height / 2;
    console.info(
      `[ADL-DEBUG:hint] show id=${id} label=${label}` +
        ` target=${(e.target as HTMLElement).nodeName}:${(e.target as HTMLElement).className}` +
        ` btnRect=${rect(btnRect)} centerY=${Math.round(centerY)}` +
        ` dropdown=${Boolean(dropdownEl)} anchorRect=${rect(anchorRect)}` +
        ` direction=left card.right=${window.innerWidth - anchorRect.left + 1}` +
        ` canvas=${window.innerWidth}x${window.innerHeight}` +
        ` cardTransform=${getComputedStyle(menuEl).transform}`,
    );

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
    const cardEl = hintElementsRef.current[0];
    const arrowEl = hintElementsRef.current[1];
    const rect2 = (el: HTMLElement | undefined) =>
      el
        ? `${Math.round(el.getBoundingClientRect().left)},${Math.round(
            el.getBoundingClientRect().top,
          )},${Math.round(el.getBoundingClientRect().right)},${Math.round(
            el.getBoundingClientRect().bottom,
          )}`
        : 'none';
    console.info(
      `[ADL-DEBUG:hint] rendered id=${id}` +
        ` cardRect=${rect2(cardEl)} arrowRect=${rect2(arrowEl)}` +
        ` cardTop=${cardEl?.style.top} cardRight=${cardEl?.style.right} cardTransform=${cardEl?.style.transform}` +
        ` arrowLeft=${arrowEl?.style.left} arrowTop=${arrowEl?.style.top}`,
    );
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
