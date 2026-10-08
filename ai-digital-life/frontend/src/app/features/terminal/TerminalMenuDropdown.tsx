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
 * TODO(复用)：与 `features/browser/BrowserMenuHintItem.tsx` 约 60 行重复
 * （triggerRef 取 rect、useHintCard、HintCard）。抽公共 MenuHintRow 时两处
 * 一起迁移（注意项目禁兼容层：直接改两处调用，不留重导出），且注意两处关闭
 * 语义已分叉（浏览器恒关闭，本菜单看 keepOpen）。
 *
 * 提示图标自身吞掉点击（不触发行动作）：点 `!` 只看说明，不会误执行。
 * 关闭策略：有 action 默认执行后关闭；`keepOpen` 的开关/步进类保持展开以便连续操作。
 */
function TerminalMenuItemRow({
  item,
  onClose,
}: {
  item: Extract<TerminalMenuItem, { label: string }>;
  onClose: () => void;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const { hintState, showHint, hideHint, scheduleHide, hintCardProps } = useHintCard(
    undefined,
    triggerRef,
  );

  const handleShowHint = (event: React.MouseEvent | React.FocusEvent) => {
    event.stopPropagation();
    if (!item.hint) {
      return;
    }
    // 对准感叹号自身（而非整行），箭头落位更准；取不到时回退整行。
    const markRect = triggerRef.current?.getBoundingClientRect();
    if (markRect && markRect.width > 0) {
      showHint(item.hint, markRect);
      return;
    }
    const button = (event.target as HTMLElement).closest('button');
    const btnRect = button?.getBoundingClientRect();
    if (!btnRect) {
      return;
    }
    showHint(item.hint, btnRect);
  };

  const isToggle = item.checked !== undefined;

  return (
    <>
      <button
        type="button"
        role={isToggle ? 'menuitemcheckbox' : 'menuitem'}
        aria-checked={isToggle ? (item.checked ? 'true' : 'false') : undefined}
        className="adl-menu__item"
        disabled={item.disabled}
        onClick={() => {
          item.action?.();
          if (!item.keepOpen) {
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
          // 意图：全语言统一的提示标记（`!` 各语言同形），非文案，不进 i18n。
          <span
            ref={triggerRef}
            className="adl-menu-item__hint"
            role="img"
            // 缺 hintLabel 时回退读 label（不读 markdown 全文，避免把 `#`/`·` 念给读屏用户）。
            aria-label={item.hintLabel ?? item.label}
            tabIndex={0}
            onMouseEnter={handleShowHint}
            onMouseLeave={scheduleHide}
            onFocus={handleShowHint}
            onBlur={hideHint}
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
              <TerminalMenuItemRow key={item.id} item={item} onClose={onClose} />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
});
