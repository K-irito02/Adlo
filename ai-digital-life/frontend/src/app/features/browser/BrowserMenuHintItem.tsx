import React, { useRef } from 'react';
import { useHintCard, HintCard } from '../../components/HintCard';

// TODO(复用)：与 `features/terminal/TerminalMenuDropdown.tsx` 的行组件约 60 行重复。
// 抽公共 MenuHintRow 时两处一起迁移（注意项目禁兼容层：直接改两处调用，不留重导出），
// 且注意两处关闭语义已分叉（本菜单恒关闭，终端侧看 keepOpen）。

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
  const triggerRef = useRef<HTMLSpanElement>(null);
  const {
    hintState,
    showHint: showHintCard,
    scheduleHide,
    hintCardProps,
  } = useHintCard(undefined, triggerRef);

  const handleShowHint = (e: React.MouseEvent) => {
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

    showHintCard(hint ?? '', btnRect);
  };

  return (
    <>
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
            ref={triggerRef}
            className="adl-menu-item__hint"
            onMouseEnter={handleShowHint}
            onMouseLeave={scheduleHide}
          >
            !
          </span>
        ) : null}
      </button>
      <HintCard {...hintCardProps} placement="left">
        {hintState?.content}
      </HintCard>
    </>
  );
}
