// src/app/components/terminal/TerminalPaneView.tsx
import { useRef } from 'react';
import { IconAlertTriangle } from '@icons';
import { useTCopy } from '@i18n/useTCopy';
import type { TerminalPane } from '@stores/slices/terminalSliceTypes';
import { XtermTerminal, type XtermTerminalHandle } from './XtermTerminal';
import { TerminalPaneActions } from './TerminalPaneActions';

interface TerminalPaneViewProps {
  pane: TerminalPane;
  isActive: boolean;
  isMaximized: boolean;
  onActivate: () => void;
  onClose: () => void;
  onToggleMaximize: () => void;
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  titles: { clear: string; maximize: string; restore: string; close: string };
}

/**
 * 单个终端窗格：自持 xterm 引用，渲染实时画布 + 右上角动作叠加层。
 *
 * 窗格容器带 `data-pane-id`，PTY 运行时据此量取正确容器尺寸（见 `findPaneCanvas`）。
 * 会话终止且无 session 时，在窗格底部叠加「未找到终端程序」提示。
 */
export function TerminalPaneView({
  pane,
  isActive,
  isMaximized,
  onActivate,
  onClose,
  onToggleMaximize,
  onData,
  onResize,
  titles,
}: TerminalPaneViewProps) {
  const { t } = useTCopy();
  const xtermRef = useRef<XtermTerminalHandle | null>(null);
  const hasError = pane.status === 'terminated' && !pane.sessionId;

  return (
    <div
      className={`adl-terminal-live${isActive ? ' is-active' : ''}${isMaximized ? ' is-maximized' : ''}`}
      data-pane-id={pane.id}
      onPointerDown={onActivate}
    >
      <XtermTerminal
        ref={xtermRef}
        sessionId={pane.sessionId ?? null}
        className="adl-terminal-canvas"
        onData={onData}
        onResize={onResize}
      />
      <TerminalPaneActions
        onClear={() => xtermRef.current?.clear()}
        onClose={onClose}
        isMaximized={isMaximized}
        onToggleMaximize={onToggleMaximize}
        titles={titles}
        alwaysVisible
      />
      {hasError && (
        <div className="adl-terminal-error-note">
          <IconAlertTriangle size={14} decorative />
          <span>{t.terminalShellNotFound}</span>
        </div>
      )}
    </div>
  );
}
