import React, { useRef, useEffect } from 'react';

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

  const hideHint = () => {
    if (hintElementsRef.current.length > 0) {
      console.log('[ADL-DEBUG] BrowserMenuHintItem hideHint:', {
        id,
        elementsRemoved: hintElementsRef.current.length,
      });
    }
    hintElementsRef.current.forEach((el) => el.remove());
    hintElementsRef.current = [];
  };

  useEffect(() => {
    return () => {
      hintElementsRef.current.forEach((el) => el.remove());
      hintElementsRef.current = [];
    };
  }, []);

  const showHint = (e: React.MouseEvent) => {
    e.stopPropagation();
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
    const centerY = btnRect.top + btnRect.height / 2;

    console.log('[ADL-DEBUG] BrowserMenuHintItem showHint:', {
      id,
      anchorRect: {
        left: anchorRect.left,
        right: anchorRect.right,
        width: anchorRect.width,
      },
      btnRect: { top: btnRect.top, height: btnRect.height },
      centerY,
      cardRight: window.innerWidth - anchorRect.left + 1,
      cardRightFromLeft: anchorRect.left - 1,
      arrowLeft: anchorRect.left - 5,
      arrowTipAt: anchorRect.left - 5 + 5,
      usedDropdown: !!dropdownEl,
      viewportWidth: window.innerWidth,
    });

    const card = document.createElement('div');
    card.className = 'adl-sub-hint-card adl-sub-hint-card--left';
    card.textContent = hint ?? '';
    card.style.right = `${window.innerWidth - anchorRect.left + 1}px`;
    card.style.top = `${centerY}px`;
    card.style.transform = 'translateY(-50%)';

    const arrow = document.createElement('div');
    arrow.className = 'adl-sub-hint-card__arrow adl-sub-hint-card__arrow--left';
    arrow.style.left = `${anchorRect.left - 5}px`;
    arrow.style.top = `${centerY - 4}px`;

    const arrowBorder = document.createElement('div');
    arrowBorder.className = 'adl-sub-hint-card__arrow-border adl-sub-hint-card__arrow-border--left';
    arrowBorder.style.left = `${anchorRect.left - 6}px`;
    arrowBorder.style.top = `${centerY - 5}px`;

    document.body.appendChild(card);
    document.body.appendChild(arrow);
    document.body.appendChild(arrowBorder);

    hideHint();
    hintElementsRef.current = [card, arrow, arrowBorder];
  };

  return (
    <button
      key={id}
      type="button"
      role="menuitem"
      className="adl-menu__item"
      disabled={disabled}
      onClick={() => {
        console.log('[ADL-DEBUG] BrowserMenuHintItem onClick:', {
          id,
          label,
          disabled,
          hasHint: !!hint,
        });
        action?.();
        onClose();
      }}
    >
      {icon ? <span className="adl-menu__item-icon">{icon}</span> : null}
      <span>{label}</span>
      {hint ? (
        <span className="adl-menu-item__hint" onMouseEnter={showHint} onMouseLeave={hideHint}>
          !
        </span>
      ) : null}
    </button>
  );
}
