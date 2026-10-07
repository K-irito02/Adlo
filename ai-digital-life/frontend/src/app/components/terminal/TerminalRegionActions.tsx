// src/app/components/terminal/TerminalRegionActions.tsx
import { IconClearDisplay } from '@icons';

export interface TerminalRegionActionsProps {
  onClear: () => void;
  titles: { clearLabel: string; clearTitle: string };
  /** 常驻显示（不再依赖 hover） */
  alwaysVisible?: boolean;
}

/**
 * 终端区右上角的操作叠加层：仅保留一颗「清空」按钮。
 *
 * 只读历史区删除后，区域折叠/删除/交换等操作一并移除；可见 `title` 用系统原生
 * `title` 属性（不是自定义 Tooltip），`aria-label` 复用同一份 `titles` 文案。
 */
export function TerminalRegionActions({
  onClear,
  titles,
  alwaysVisible,
}: TerminalRegionActionsProps) {
  return (
    <div className={`adl-terminal-region-actions${alwaysVisible ? ' is-always-visible' : ''}`}>
      <button
        type="button"
        className="adl-terminal-region-actions__btn"
        aria-label={titles.clearLabel}
        title={titles.clearTitle}
        onClick={onClear}
      >
        <IconClearDisplay size={14} decorative />
      </button>
    </div>
  );
}
