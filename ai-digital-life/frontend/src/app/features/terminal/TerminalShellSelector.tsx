import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { IconCheck, IconChevronDown, IconChevronRight, IconPlus } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import type { TerminalProfile } from '@stores/types';
import type { TerminalShellMenuItem, WorkspaceMenuItem } from './useTerminalPanel';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { useTCopy } from '@i18n/useTCopy';

/** 无悬停 2s 后自动关闭菜单卡片（三区各自计时） */
const AUTO_CLOSE_MS = 2000;

interface TerminalShellSelectorProps {
  currentProfile: TerminalProfile;
  currentProfileLabel: string;
  menuOpen: boolean;
  menuItems: TerminalShellMenuItem[];
  menuRef: React.RefObject<HTMLDivElement | null>;
  onCreateTab: (profile?: TerminalProfile, workspaceId?: string) => void;
  onToggle: () => void;
  onClose: () => void;
  onSelect: (profile: TerminalProfile) => void;
}

export const TerminalShellSelector = React.memo(function TerminalShellSelector({
  currentProfile,
  currentProfileLabel,
  menuOpen,
  menuItems,
  menuRef,
  onCreateTab,
  onToggle,
  onClose,
  onSelect,
}: TerminalShellSelectorProps) {
  const { t } = useTCopy();
  const [activeSubMenuId, setActiveSubMenuId] = useState<string | null>(null);
  const subMenuRef = useRef<HTMLDivElement | null>(null);

  const { terminalWorkspaceId, setTerminalWorkspaceId, recentWorkspaces } = useAppStore(
    useShallow((s) => ({
      terminalWorkspaceId: s.terminalWorkspaceId,
      setTerminalWorkspaceId: s.setTerminalWorkspaceId,
      recentWorkspaces: s.recentWorkspaces,
    })),
  );

  const boundWorkspace = useMemo(() => {
    if (!terminalWorkspaceId) {
      return null;
    }
    return recentWorkspaces.find((w) => w.id === terminalWorkspaceId);
  }, [terminalWorkspaceId, recentWorkspaces]);

  const boundWorkspaceLabel = useMemo(() => {
    if (!boundWorkspace) {
      return t.terminalIndependent;
    }
    return boundWorkspace.name;
  }, [boundWorkspace, t.terminalIndependent]);

  useEffect(() => {
    if (!menuOpen) {
      setActiveSubMenuId(null);
    }
  }, [menuOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !subMenuRef.current?.contains(target)) {
        setActiveSubMenuId(null);
      }
    };
    if (activeSubMenuId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [activeSubMenuId, menuRef]);

  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // menuOpen 的新鲜镜像：延迟开门回调触发时用它判断，避免闭包拿到过期值
  //（hover 后 120ms 内若已通过点击开门，回调不再 toggle，保证语义恒为 open）
  const menuOpenRef = useRef(menuOpen);
  menuOpenRef.current = menuOpen;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // 三区独立自动关闭：右半 toggle / 菜单卡片 / 子卡片各持一个 2s 计时器。
  // 触发时检查实时悬停位：任一区仍被悬停则跳过 —— 子卡片 DOM 嵌套在菜单容器内，
  // 悬停子卡片即视为仍在菜单区内，主菜单不会被自己的计时器关掉。
  const hoverZonesRef = useRef({ toggle: false, menu: false, sub: false });
  const toggleCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canHoverDismiss = () =>
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function' ||
    window.matchMedia('(hover: hover)').matches;

  const fireAutoClose = useCallback(() => {
    const zones = hoverZonesRef.current;
    if (!zones.toggle && !zones.menu && !zones.sub) {
      onCloseRef.current();
    }
  }, []);

  const cancelAutoClose = useCallback(
    (timerRef: { current: ReturnType<typeof setTimeout> | null }) => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [],
  );

  const scheduleAutoClose = useCallback(
    (timerRef: { current: ReturnType<typeof setTimeout> | null }) => {
      if (!canHoverDismiss()) {
        return;
      }
      cancelAutoClose(timerRef);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        fireAutoClose();
      }, AUTO_CLOSE_MS);
    },
    [cancelAutoClose, fireAutoClose],
  );

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current !== null) {
        clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
      if (openTimerRef.current !== null) {
        clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }
      for (const timerRef of [toggleCloseTimerRef, menuCloseTimerRef, subCloseTimerRef]) {
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    };
  }, []);

  const handleMouseEnterSubMenu = useCallback((itemId: string) => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    setActiveSubMenuId(itemId);
  }, []);

  const handleMouseLeaveSubMenu = useCallback(() => {
    leaveTimerRef.current = setTimeout(() => {
      setActiveSubMenuId(null);
      leaveTimerRef.current = null;
    }, 200);
  }, []);

  const handleMouseEnterSubMenuContent = useCallback(() => {
    hoverZonesRef.current.sub = true;
    cancelAutoClose(subCloseTimerRef);
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, [cancelAutoClose]);

  const handleMouseLeaveSubMenuContent = useCallback(() => {
    hoverZonesRef.current.sub = false;
    scheduleAutoClose(subCloseTimerRef);
    setActiveSubMenuId(null);
  }, [scheduleAutoClose]);

  const handleWorkspaceSelect = useCallback(
    (workspaceId: string) => {
      setTerminalWorkspaceId(workspaceId);
      setActiveSubMenuId(null);
      // 子卡片卸载不触发 mouseleave：不清 sub 位会导致 fireAutoClose 永久跳过、
      // 主菜单此后再也不自动关闭
      hoverZonesRef.current.sub = false;
      cancelAutoClose(subCloseTimerRef);
    },
    [setTerminalWorkspaceId, cancelAutoClose],
  );

  // 关菜单即清零全区悬停位并取消悬置计时：治愈选择即关 / 外部点击关后的
  // 残留位（如 profile 选择时指针仍在菜单内）与悬置空计时器；
  // openTimer 也一并取消：120ms 内双击 toggle（开→关）后悬置的开门计时不再误重开
  useEffect(() => {
    if (!menuOpen) {
      hoverZonesRef.current.toggle = false;
      hoverZonesRef.current.menu = false;
      hoverZonesRef.current.sub = false;
      for (const timerRef of [
        toggleCloseTimerRef,
        menuCloseTimerRef,
        subCloseTimerRef,
        openTimerRef,
      ]) {
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    }
  }, [menuOpen]);

  // 右半 toggle 的悬停开门：120ms 意图延迟过滤路过误触，离开即取消；
  // 无悬停能力设备（触屏）保持纯点击，避免 tap 的 mouseEnter+click 双触发把菜单闪关。
  const handleToggleMouseEnter = useCallback(() => {
    hoverZonesRef.current.toggle = true;
    cancelAutoClose(toggleCloseTimerRef);
    if (menuOpenRef.current) {
      return;
    }
    if (!canHoverDismiss()) {
      return;
    }
    if (openTimerRef.current !== null) {
      clearTimeout(openTimerRef.current);
    }
    openTimerRef.current = setTimeout(() => {
      openTimerRef.current = null;
      if (!menuOpenRef.current) {
        onToggle();
      }
    }, 120);
  }, [onToggle, cancelAutoClose]);

  const handleToggleMouseLeave = useCallback(() => {
    hoverZonesRef.current.toggle = false;
    if (openTimerRef.current !== null) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    scheduleAutoClose(toggleCloseTimerRef);
  }, [scheduleAutoClose]);

  const handleMenuMouseEnter = useCallback(() => {
    hoverZonesRef.current.menu = true;
    cancelAutoClose(menuCloseTimerRef);
  }, [cancelAutoClose]);

  const handleMenuMouseLeave = useCallback(() => {
    hoverZonesRef.current.menu = false;
    scheduleAutoClose(menuCloseTimerRef);
  }, [scheduleAutoClose]);

  return (
    <div ref={menuRef} className="adl-menu adl-file-context__menu">
      <div className={`adl-split-pill${menuOpen ? ' is-open' : ''}`}>
        <TooltipSimple content={t.menuNewTerminal} placement="top">
          <button
            type="button"
            className="adl-split-pill__main"
            // 孤儿绑定策略：持久化的 workspaceId 若已不在工作区列表（如删除后重启），
            // 显示已回退为"独立"，建 tab 时同样按独立处理，避免建出不可见的脏 workspaceId 标签
            onClick={() => onCreateTab(currentProfile, boundWorkspace ? terminalWorkspaceId : '')}
            aria-label={t.menuNewTerminal}
          >
            <IconPlus size={12} decorative />
            <span>{currentProfileLabel}</span>
          </button>
        </TooltipSimple>
        <TooltipSimple content={boundWorkspaceLabel} placement="top">
          <button
            type="button"
            className={`adl-split-pill__toggle${menuOpen ? ' is-open' : ''}`}
            onClick={onToggle}
            onMouseEnter={handleToggleMouseEnter}
            onMouseLeave={handleToggleMouseLeave}
            aria-label={t.shellTypeSelect}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="adl-split-pill__workspace-label">
              {boundWorkspaceLabel.length > 12
                ? boundWorkspaceLabel.substring(0, 12) + '...'
                : boundWorkspaceLabel}
            </span>
            <IconChevronDown size={12} decorative />
          </button>
        </TooltipSimple>
      </div>
      {menuOpen ? (
        <div
          className="adl-menu__dropdown adl-file-context__dropdown adl-terminal-shell-dropdown"
          role="menu"
          onMouseEnter={handleMenuMouseEnter}
          onMouseLeave={handleMenuMouseLeave}
        >
          {menuItems.map((item) =>
            'separator' in item ? (
              <div key={item.id} className="adl-menu__sep" role="separator" />
            ) : 'hasSubMenu' in item ? (
              <div
                key={item.id}
                className={`adl-menu__item adl-menu__item--has-sub${activeSubMenuId === item.id ? ' is-open' : ''}`}
                onMouseEnter={() => handleMouseEnterSubMenu(item.id)}
                onMouseLeave={handleMouseLeaveSubMenu}
              >
                <span>{item.label}</span>
                <IconChevronRight size={12} decorative />
                {activeSubMenuId === item.id && (
                  <div
                    className="adl-menu__dropdown adl-menu__dropdown--sub adl-menu__dropdown--right"
                    role="menu"
                    ref={subMenuRef}
                    onMouseEnter={handleMouseEnterSubMenuContent}
                    onMouseLeave={handleMouseLeaveSubMenuContent}
                  >
                    {item.subMenu.map((subItem: WorkspaceMenuItem) => (
                      <button
                        key={subItem.id}
                        type="button"
                        role="menuitem"
                        className={`adl-menu__item${subItem.workspaceId === terminalWorkspaceId ? ' is-active' : ''}`}
                        onClick={() => handleWorkspaceSelect(subItem.workspaceId)}
                        title={subItem.label}
                      >
                        <span>{subItem.label}</span>
                        {subItem.workspaceId === terminalWorkspaceId && (
                          <span className="adl-menu__check">
                            <IconCheck size={14} decorative />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={item.profile ? item.profile === currentProfile : false}
                className="adl-menu__item"
                onClick={() => {
                  if (item.profile) {
                    onSelect(item.profile);
                  } else {
                    item.action?.();
                  }
                }}
              >
                <span>{item.label}</span>
                {item.profile && item.profile === currentProfile && (
                  <span className="adl-menu__check">
                    <IconCheck size={14} decorative />
                  </span>
                )}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
});
