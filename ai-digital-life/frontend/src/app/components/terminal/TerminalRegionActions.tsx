// src/app/components/terminal/TerminalRegionActions.tsx
import type { RegionCollapse, RegionName } from '@features/terminal/terminalRegionCollapse';
import { IconClearDisplay, IconDelete, IconRegionCollapse, IconRegionExpand } from '@icons';

export interface TerminalRegionActionsTitles {
  collapse: string;
  expand: string;
  regionName: string;
  /** 被收起的另一个区域名：单区独显时展开按钮指向它 */
  otherRegionName: string;
  deleteLabel?: string;
  deleteTitle?: string;
  clearLabel?: string;
  clearTitle?: string;
}

interface TerminalRegionActionsProps {
  region: RegionName;
  /**
   * 当前被收起的区域（'none' = 两区都可见）。单区独显时可见区的按钮负责展开另一区。
   * 调用方契约：被收起的区不渲染本组件（见 TerminalPanel 的 historyVisible/liveVisible 门控，
   * 与 isRegionVisible 的 `collapse !== region` 对应）。若自身即被收起区则返回 null，
   * 防未来复用/误传把“展开另一区”安在本不该出现的按钮上。
   */
  collapsedRegion: RegionCollapse;
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
  collapsedRegion,
  canCollapse,
  onToggleCollapse,
  onDelete,
  onClear,
  titles,
  alwaysVisible,
}: TerminalRegionActionsProps) {
  // 被收起的区不应渲染本组件（调用方契约）；误渲染时返回 null，
  // 避免把“展开另一区”显示在错误的按钮上。
  if (collapsedRegion === region) {
    return null;
  }
  // 单区独显时，可见区的按钮展开的是被收起的另一区，文案必须用另一区的名字；
  // 两区都可见时，按钮收起的是本区，用本区名字。
  const isSolo = collapsedRegion !== 'none';
  const toggleTitle = (isSolo ? titles.expand : titles.collapse).replaceAll(
    '{region}',
    isSolo ? titles.otherRegionName : titles.regionName,
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
          {isSolo ? (
            <IconRegionExpand size={14} decorative />
          ) : (
            <IconRegionCollapse size={14} decorative />
          )}
        </button>
      ) : null}
    </div>
  );
}
