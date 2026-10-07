import { terminalSelectors } from '@stores/selectors';
import { useTerminalMenus } from './useTerminalMenus';
import type { TerminalProfile } from '@stores/types';
import type { TerminalPane } from '@stores/slices/terminalSliceTypes';

interface UseTerminalShellManagementParams {
  activePane: TerminalPane | undefined;
  handleCloseTab: (tabId: string) => void;
  handleDoubleClick: (tabId: string, title: string) => void;
  handleKillPane: (paneId: string) => void;
}

/**
 * 终端 Shell 管理 Hook：组合菜单逻辑与默认 profile 派生。
 *
 * 职责：
 * - 复合按钮的独立 shell profile 与当前 profile 标签派生
 * - 终端菜单/Shell 菜单/右键菜单状态与项（委托 useTerminalMenus）
 * - 菜单动作（复制/粘贴/清屏/杀进程）作用于**活动窗格**，Pin/切换 profile 等标签级动作
 */
export function useTerminalShellManagement({
  activePane,
  handleCloseTab,
  handleDoubleClick,
  handleKillPane,
}: UseTerminalShellManagementParams) {
  const shellSelectorProfile = terminalSelectors.useShellSelectorProfile();

  const {
    terminalMenuOpen,
    setTerminalMenuOpen,
    shellMenuOpen,
    setShellMenuOpen,
    terminalMenuRef,
    shellMenuRef,
    terminalMenuItems,
    shellMenuItems,
    shellTypeItems,
    contextMenu,
    handleContextMenu,
    handleTogglePin,
    handleRenameFromMenu,
    handleDeleteFromMenu,
    handleOpenInCenterFromMenu,
    closeContextMenu,
    updateProfile,
  } = useTerminalMenus({
    activePane,
    handleCloseTab,
    handleDoubleClick,
    handleKillPane,
  });

  const currentProfile: TerminalProfile = shellSelectorProfile;
  const currentProfileLabel =
    currentProfile === 'powershell' ? 'PowerShell' : currentProfile === 'bash' ? 'Bash' : 'CMD';

  return {
    currentProfile,
    currentProfileLabel,
    terminalMenuOpen,
    setTerminalMenuOpen,
    shellMenuOpen,
    setShellMenuOpen,
    terminalMenuRef,
    shellMenuRef,
    terminalMenuItems,
    shellMenuItems,
    shellTypeItems,
    contextMenu,
    handleContextMenu,
    handleTogglePin,
    handleRenameFromMenu,
    handleDeleteFromMenu,
    handleOpenInCenterFromMenu,
    closeContextMenu,
    updateProfile,
  };
}
