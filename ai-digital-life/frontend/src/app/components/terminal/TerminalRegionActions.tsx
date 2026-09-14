// src/app/components/terminal/TerminalRegionActions.tsx
import type { RegionName } from '@features/terminal/terminalRegionCollapse';
import { IconClearDisplay, IconDelete, IconRegionCollapse, IconRegionExpand } from '@icons';

export interface TerminalRegionActionsTitles {
  collapse: string;
  expand: string;
  regionName: string;
  deleteLabel?: string;
  deleteTitle?: string;
  clearLabel?: string;
  clearTitle?: string;
}

interface TerminalRegionActionsProps {
  region: RegionName;
  /** 该区域当前是否处于收起态（收起态下本组件作为常驻「展开」按钮渲染） */
  collapsed: boolean;
  /** 两个区域都可能显示时才为 true；否则不渲染收起/展开按钮 */
  canCollapse: boolean;
  onToggleCollapse: () => void;
  onDelete?: () => void;
  onClear?: () => void;
  titles: TerminalRegionActionsTitles;
  /** 常驻显示（该区域已是唯一可见区域），不依赖 hover */
  alwaysVisible?: boolean;
}

/**
 * 区域右上角按钮叠加层。
 *
 * 两个约束来自需求与既有实现：
 * 1. 顺序固定为「删除/清空在左，收起/展开在右」；
 * 2. 用**系统原生 title**（不是组件的自定义 Tooltip）—— 直接写在 `title` 属性上。
 */
export function TerminalRegionActions({
  region,
  collapsed,
  canCollapse,
  onToggleCollapse,
  onDelete,
  onClear,
  titles,
  alwaysVisible,
}: TerminalRegionActionsProps) {
  const toggleTitle = (collapsed ? titles.expand : titles.collapse).replace(
    '{region}',
    titles.regionName,
  );

  return (
    <div
      className={`adl-terminal-region-actions${alwaysVisible ? ' is-always-visible' : ''}`}
    >
      {onDelete ? (
        <button
          type="button"
          className="adl-terminal-region-actions__btn"
          aria-label={titles.deleteLabel}
          title={titles.deleteTitle}
          onClick={onDelete}
        >
          <IconDelete size={14} decorative />
        </button>
      ) : null}
      {onClear ? (
        <button
          type="button"
          className="adl-terminal-region-actions__btn"
          aria-label={titles.clearLabel}
          title={titles.clearTitle}
          onClick={onClear}
        >
          <IconClearDisplay size={14} decorative />
        </button>
      ) : null}
      {canCollapse ? (
        <button
          type="button"
          className="adl-terminal-region-actions__btn"
          aria-label={toggleTitle}
          title={toggleTitle}
          onClick={onToggleCollapse}
          data-region={region}
        >
          {collapsed ? (
            <IconRegionExpand size={14} decorative />
          ) : (
            <IconRegionCollapse size={14} decorative />
          )}
        </button>
      ) : null}
    </div>
  );
}
