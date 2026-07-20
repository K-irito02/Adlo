import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RecentWorkspaceEntry } from '@shared/ipc';
import type { TerminalProfile } from '@stores/types';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { useClickOutside } from '@hooks';

export interface UseTerminalMenuParams {
  workspace: RecentWorkspaceEntry;
  isIndependent: boolean;
  onToggleExpand: () => void;
  onHideFromRightPanels: (workspaceId: string) => void;
  onRefreshTree: () => void;
  onCloseAllTabs: () => void;
  onCreateTab: () => void;
}

export function useTerminalMenu({
  workspace,
  isIndependent,
  onToggleExpand,
  onHideFromRightPanels,
  onRefreshTree,
  onCloseAllTabs,
  onCreateTab,
}: UseTerminalMenuParams) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [subHover, setSubHover] = useState(false);
  const [subMenuPosition, setSubMenuPosition] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [renderKey, setRenderKey] = useState(0);
  const menuId = `ws-term-menu-${workspace.id}`;
  const subMenuId = `ws-term-submenu-${workspace.id}`;
  const subMenuTriggerRef = useRef<HTMLDivElement | null>(null);
  const {
    defaultTerminalProfile,
    workspaceDefaultProfiles,
    setDefaultTerminalProfile,
    setWorkspaceDefaultTerminalProfile,
  } = useAppStore(
    useShallow((state) => ({
      defaultTerminalProfile: state.defaultTerminalProfile,
      workspaceDefaultProfiles: state.workspaceDefaultProfiles,
      setDefaultTerminalProfile: state.setDefaultTerminalProfile,
      setWorkspaceDefaultTerminalProfile: state.setWorkspaceDefaultTerminalProfile,
    })),
  );
  const subHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (subHideTimerRef.current !== null) {
        clearTimeout(subHideTimerRef.current);
        subHideTimerRef.current = null;
      }
    };
  }, []);

  // 使用工作区专属默认终端类型，如果没有则使用全局默认
  const currentProfile = isIndependent
    ? defaultTerminalProfile
    : (workspaceDefaultProfiles[workspace.id] ?? defaultTerminalProfile);

  const profileLabels: Record<TerminalProfile, string> = {
    powershell: 'PowerShell',
    bash: 'Bash',
    cmd: 'CMD',
  };

  const defaultProfileLabel = profileLabels[currentProfile];

  const closeMenu = useCallback(() => {
    if (subHideTimerRef.current) {
      clearTimeout(subHideTimerRef.current);
    }
    setMenuOpen(false);
    setMenuPosition(null);
    setSubHover(false);
  }, []);

  const clickOutsideRefs = useMemo(() => [headerRef, menuContainerRef] as const, []);

  useClickOutside(clickOutsideRefs, menuOpen, {
    onOutsideClick: closeMenu,
    onEscape: closeMenu,
  });

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handleScroll = () => {
      setMenuOpen(false);
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [menuOpen]);

  const handleNameClick = useCallback(() => {
    onToggleExpand();
  }, [onToggleExpand]);

  const handleNameContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPosition({ top: e.clientY, left: e.clientX + 4 });
    setMenuOpen(true);
  }, []);

  const showSubMenu = useCallback(() => {
    if (subHideTimerRef.current) {
      clearTimeout(subHideTimerRef.current);
      subHideTimerRef.current = null;
    }
    setSubHover(true);
    if (subMenuTriggerRef.current) {
      const rect = subMenuTriggerRef.current.getBoundingClientRect();
      setSubMenuPosition({ top: rect.top, left: rect.right + 6 });
    }
  }, []);

  const hideSubMenuDelayed = useCallback(() => {
    if (subHideTimerRef.current) {
      clearTimeout(subHideTimerRef.current);
    }
    subHideTimerRef.current = setTimeout(() => {
      setSubHover(false);
    }, 150);
  }, []);

  const handleMoreClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (subHideTimerRef.current) {
      clearTimeout(subHideTimerRef.current);
    }
    setSubHover(false);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPosition({ top: rect.top, left: rect.right + 4 });
    setMenuOpen((prev) => !prev);
  }, []);

  const handleHideFromRightPanels = useCallback(() => {
    closeMenu();
    onHideFromRightPanels(workspace.id);
  }, [onHideFromRightPanels, workspace.id, closeMenu]);

  const handleSelectDefaultProfile = useCallback(
    (profile: TerminalProfile) => {
      if (isIndependent) {
        setDefaultTerminalProfile(profile);
      } else {
        setWorkspaceDefaultTerminalProfile(workspace.id, profile);
      }
      requestAnimationFrame(() => {
        setRenderKey((prev) => prev + 1);
      });
    },
    [isIndependent, workspace.id, setDefaultTerminalProfile, setWorkspaceDefaultTerminalProfile],
  );

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        handleNameClick();
      }
    },
    [handleNameClick],
  );

  const handleRefreshClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRefreshTree();
    },
    [onRefreshTree],
  );

  const handleCloseAllTabsClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onCloseAllTabs();
    },
    [onCloseAllTabs],
  );

  const handleCreateTabClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onCreateTab();
    },
    [onCreateTab],
  );

  return {
    menuOpen,
    menuPosition,
    subHover,
    subMenuPosition,
    renderKey,
    menuId,
    subMenuId,
    subMenuTriggerRef,
    headerRef,
    menuContainerRef,
    currentProfile,
    profileLabels,
    defaultProfileLabel,
    handleNameClick,
    handleNameContextMenu,
    handleNameKeyDown,
    showSubMenu,
    hideSubMenuDelayed,
    handleMoreClick,
    handleHideFromRightPanels,
    handleSelectDefaultProfile,
    handleRefreshClick,
    handleCloseAllTabsClick,
    handleCreateTabClick,
  };
}
