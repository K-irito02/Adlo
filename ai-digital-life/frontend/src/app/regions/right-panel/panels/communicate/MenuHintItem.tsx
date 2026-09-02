import { useHintCard, HintCard } from '../../../../components/HintCard';

interface MenuHintItemProps {
  label: string;
  hint: string;
  onClick: () => void;
  menuId?: string;
  danger?: boolean;
}

export function MenuHintItem({ label, hint, onClick, menuId, danger }: MenuHintItemProps) {
  const { hintState, showHint: showHintCard, scheduleHide, hintCardProps } = useHintCard();

  return (
    <>
      <button
        type="button"
        className={`adl-multitree-entry__menu-item${danger ? ' is-danger' : ''}`}
        role="menuitem"
        onClick={onClick}
      >
        <span>{label}</span>
        <span
          className={`adl-menu-item__hint${danger ? ' is-danger' : ''}`}
          onMouseEnter={(e) => {
            e.stopPropagation();
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
              showHintCard(hint, buttonRect);
            }
          }}
          onMouseLeave={(e) => {
            e.stopPropagation();
            scheduleHide();
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
      <HintCard {...hintCardProps} placement="right">
        {hintState?.content}
      </HintCard>
    </>
  );
}
