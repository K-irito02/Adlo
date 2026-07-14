import { useRef, useEffect } from 'react';

interface MenuHintItemProps {
  label: string;
  hint: string;
  onClick: () => void;
  menuId?: string;
  danger?: boolean;
}

export function MenuHintItem({ label, hint, onClick, menuId, danger }: MenuHintItemProps) {
  const hintRef = useRef<HTMLSpanElement>(null);
  const subCardsRef = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    return () => {
      subCardsRef.current.forEach((el) => el.remove());
      subCardsRef.current = [];
    };
  }, []);

  return (
    <button
      type="button"
      className={`adl-multitree-entry__menu-item${danger ? ' is-danger' : ''}`}
      role="menuitem"
      onClick={onClick}
    >
      <span>{label}</span>
      <span
        ref={hintRef}
        className={`adl-menu-item__hint${danger ? ' is-danger' : ''}`}
        onMouseEnter={(e) => {
          e.stopPropagation();
          const button = (e.target as HTMLElement).closest('button');
          const originalTitle = button?.getAttribute('title');
          if (originalTitle) {
            button?.setAttribute('data-original-title', originalTitle);
            button?.removeAttribute('title');
          }

          const buttonEl = (e.target as HTMLElement).closest('button');
          const buttonRect = buttonEl?.getBoundingClientRect();
          let menuCard: HTMLElement | null = null;
          if (menuId) {
            menuCard = document.querySelector(`[data-menu-id="${menuId}"]`);
          }
          if (!menuCard) {
            menuCard = document.querySelector('[data-menu-id="github-delete-all-menu"]');
          }
          if (!menuCard) {
            menuCard = document.querySelector('[data-menu-id^="github-"]');
          }
          if (buttonRect && menuCard) {
            const menuRect = menuCard.getBoundingClientRect();
            const centerY = buttonRect.top + buttonRect.height / 2;

            const card = document.createElement('div');
            card.className = 'adl-sub-hint-card';
            card.textContent = hint;
            card.style.left = `${menuRect.right + 1}px`;
            card.style.top = `${centerY}px`;
            card.style.transform = 'translateY(-50%)';

            const arrow = document.createElement('div');
            arrow.className = 'adl-sub-hint-card__arrow';
            arrow.style.left = `${menuRect.right - 4}px`;
            arrow.style.top = `${centerY - 4}px`;

            const arrowBorder = document.createElement('div');
            arrowBorder.className = 'adl-sub-hint-card__arrow-border';
            arrowBorder.style.left = `${menuRect.right - 5}px`;
            arrowBorder.style.top = `${centerY - 5}px`;

            document.body.appendChild(card);
            document.body.appendChild(arrow);
            document.body.appendChild(arrowBorder);

            subCardsRef.current = [card, arrow, arrowBorder];
          }
        }}
        onMouseLeave={(e) => {
          e.stopPropagation();
          // 子卡片 pointer-events: none，不支持悬停；鼠标离开 ! 时直接移除
          subCardsRef.current.forEach((el) => el.remove());
          subCardsRef.current = [];
          const button = (e.target as HTMLElement).closest('button');
          const originalTitle = button?.getAttribute('data-original-title');
          if (originalTitle) {
            button?.setAttribute('title', originalTitle);
            button?.removeAttribute('data-original-title');
          }
        }}
      >
        !
      </span>
    </button>
  );
}
