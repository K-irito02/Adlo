import { useRef, useEffect } from 'react';
import { HINT_CLOSE_DELAY_MS } from '../../../../components/HintCardTrigger';
import { renderHintCard } from '../../../../utils/renderHintCard';

interface MenuHintItemProps {
  label: string;
  hint: string;
  onClick: () => void;
  menuId?: string;
  danger?: boolean;
}

export function MenuHintItem({ label, hint, onClick, menuId, danger }: MenuHintItemProps) {
  const hintRef = useRef<HTMLSpanElement>(null);
  const subCardsRef = useRef<HTMLElement[]>([]);
  const closeTimerRef = useRef<number | undefined>(undefined);

  const hideHint = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
    subCardsRef.current.forEach((el) => el.remove());
    subCardsRef.current = [];
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
          if (closeTimerRef.current) {
            window.clearTimeout(closeTimerRef.current);
            closeTimerRef.current = undefined;
          }
          const buttonEl = (e.target as HTMLElement).closest('button');
          const originalTitle = buttonEl?.getAttribute('title');
          if (originalTitle) {
            buttonEl?.setAttribute('data-original-title', originalTitle);
            buttonEl?.removeAttribute('title');
          }

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

            hideHint();
            subCardsRef.current = renderHintCard({
              content: hint,
              buttonRect,
              menuRect,
              onCardMouseEnter: () => {
                if (closeTimerRef.current) {
                  window.clearTimeout(closeTimerRef.current);
                  closeTimerRef.current = undefined;
                }
              },
              onCardMouseLeave: scheduleHideHint,
            });
          }
        }}
        onMouseLeave={(e) => {
          e.stopPropagation();
          scheduleHideHint();
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
