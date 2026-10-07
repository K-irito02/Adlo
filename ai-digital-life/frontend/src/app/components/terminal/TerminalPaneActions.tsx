// src/app/components/terminal/TerminalPaneActions.tsx
import { IconClearDisplay, IconWindowClose, IconWindowMaximize, IconWindowRestore } from '@icons';

export interface TerminalPaneActionsProps {
  onClose: () => void;
  onClear: () => void;
  isMaximized: boolean;
  onToggleMaximize: () => void;
  titles: { close: string; clear: string; maximize: string; restore: string };
  /** 常驻显示（不再依赖 hover） */
  alwaysVisible?: boolean;
}

/**
 * 单个终端窗格右上角的操作叠加层：清空内容 · 最大化/还原 · 关闭窗口。
 *
 * 三颗按钮的 `aria-label` 与原生 `title` 都取同一份 `titles` 文案；
 * 「关闭窗口」最右并带 `--danger` 类（hover 变红）。
 */
export function TerminalPaneActions({
  onClose,
  onClear,
  isMaximized,
  onToggleMaximize,
  titles,
  alwaysVisible,
}: TerminalPaneActionsProps) {
  const maximizeTitle = isMaximized ? titles.restore : titles.maximize;
  return (
    <div className={`adl-terminal-region-actions${alwaysVisible ? ' is-always-visible' : ''}`}>
      <button
        type="button"
        className="adl-terminal-region-actions__btn"
        aria-label={titles.clear}
        title={titles.clear}
        onClick={onClear}
      >
        <IconClearDisplay size={14} decorative />
      </button>
      <button
        type="button"
        className="adl-terminal-region-actions__btn"
        aria-label={maximizeTitle}
        title={maximizeTitle}
        onClick={onToggleMaximize}
      >
        {isMaximized ? (
          <IconWindowRestore size={14} decorative />
        ) : (
          <IconWindowMaximize size={14} decorative />
        )}
      </button>
      <button
        type="button"
        className="adl-terminal-region-actions__btn adl-terminal-region-actions__btn--danger"
        aria-label={titles.close}
        title={titles.close}
        onClick={onClose}
      >
        <IconWindowClose size={14} decorative />
      </button>
    </div>
  );
}
