import { terminalSelectors } from '@stores/selectors';
import { useTerminalMenus } from './useTerminalMenus';
import type { TerminalProfile } from '@stores/types';

interface UseTerminalShellManagementParams {
  handleCloseTab: (tabId: string) => void;
  handleDoubleClick: (tabId: string, title: string) => void;
}

/**
 * 终端 Shell 管理 Hook：组合菜单逻辑与默认 profile 派生。
 *
 * 职责：
 * - 复合按钮的独立 shell profile 与当前 profile 标签派生
 * - 终端菜单/Shell 菜单/右键菜单状态与项（委托 useTerminalMenus）
 * - 更多终端操作菜单：窗格边界线开关（仿文件面板行号开关）
 */
export function useTerminalShellManagement({
  handleCloseTab,
  handleDoubleClick,
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
    handleCloseTab,
    handleDoubleClick,
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
