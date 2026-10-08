import React, { useRef } from 'react';
import { IconCheck, IconMoreVertical } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { HintCard, useHintCard } from '@components/HintCard';
import type { TerminalMenuItem } from './useTerminalPanel';
import { useTCopy } from '@i18n/useTCopy';

interface TerminalMenuDropdownProps {
  menuOpen: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuItems: TerminalMenuItem[];
  onToggle: () => void;
  onClose: () => void;
}

/**
 * 单个菜单项行：开关渲染（menuitemcheckbox + 打勾）与感叹号提示（悬停出提示卡）
 * 均在此收口，分别仿文件面板行号开关与浏览器面板菜单提示。
 *
 * 提示图标自身吞掉点击（不触发行动作）：点 `!` 只看说明，不会误执行。
 */
function TerminalMenuItemRow({
  item,
  onClose,
  menuRef,
}: {
  item: Extract<TerminalMenuItem, { label: string }>;
  onClose: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const { hintState, showHint, scheduleHide, hintCardProps } = useHintCard(undefined, triggerRef);

  const handleShowHint = (event: React.MouseEvent) => {
    event.stopPropagation();
    const menuEl = menuRef.current;
    if (!menuEl || !item.hint) {
      return;
    }
    const button = (event.target as HTMLElement).closest('button');
    const btnRect = button?.getBoundingClientRect();
    if (!btnRect) {
      return;
    }
    showHint(item.hint, btnRect);
  };

  return (
    <>
      <button
        key={item.id}
        type="button"
        role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
        aria-checked={item.checked === undefined ? undefined : item.checked ? 'true' : 'false'}
        className="adl-menu__item"
        disabled={item.disabled}
        onClick={() => {
          item.action?.();
          // 开关型菜单项（有 action）保持展开以便连续切换，
          // 与文件面板行号开关一致；无 action 才关闭。
          if (!item.action) {
            onClose();
          }
        }}
      >
        <span>{item.label}</span>
        {item.checked ? (
          <span className="adl-menu__check">
            <IconCheck size={14} decorative />
          </span>
        ) : null}
        {item.hint ? (
          <span
            ref={triggerRef}
            className="adl-menu-item__hint"
            onMouseEnter={handleShowHint}
            onMouseLeave={scheduleHide}
            onClick={(event) => event.stopPropagation()}
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

export const TerminalMenuDropdown = React.memo(function TerminalMenuDropdown({
  menuOpen,
  menuRef,
  menuItems,
  onToggle,
  onClose,
}: TerminalMenuDropdownProps) {
  const { t } = useTCopy();
  return (
    <div ref={menuRef} className="adl-menu adl-file-context__menu">
      <TooltipSimple content={t.terminalMoreActions} placement="top">
        <button
          type="button"
          className={`adl-tool-context__iconbtn${menuOpen ? ' is-open' : ''}`}
          onClick={onToggle}
          aria-label={t.terminalMoreActions}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <IconMoreVertical size={14} decorative />
        </button>
      </TooltipSimple>
      {menuOpen ? (
        <div className="adl-menu__dropdown adl-file-context__dropdown" role="menu">
          {menuItems.map((item) =>
            'separator' in item ? (
              <div key={item.id} className="adl-menu__sep" role="separator" />
            ) : (
              <TerminalMenuItemRow key={item.id} item={item} onClose={onClose} menuRef={menuRef} />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
});
