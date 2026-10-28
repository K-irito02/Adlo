import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

export type HarnessChannelKey = 'stable' | 'prerelease';

const MENU_GAP = 6;
const MENU_MARGIN = 8;
const MENU_MIN_HEIGHT = 120;

/** 行内选择器的生效版本：用户选择 → 当前版本 → 通道最新。 */
export function pickEffective<T extends { version: string }>(
  infos: T[],
  pick: string | null,
  followed: string | null,
): string | null {
  if (pick && infos.some((info) => info.version === pick)) {
    return pick;
  }
  if (followed && infos.some((info) => info.version === followed)) {
    return followed;
  }
  return infos[0]?.version ?? null;
}

/**
 * 双通道行内选择器的交互面（`capabilities.channelPicker`）：每个通道同一时刻
 * 只展示一个版本，选择只换展示；菜单几何、外部点击与 Escape 关闭都在这里。
 */
export function useHarnessVersionChannelMenu(current: string | null) {
  const [stableChoice, setStableChoice] = useState<string | null>(null);
  const [prereleaseChoice, setPrereleaseChoice] = useState<string | null>(null);
  const [openChannel, setOpenChannel] = useState<HarnessChannelKey | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const menuAnchorRef = useRef<HTMLElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);

  // 当前版本变化（安装/切换完成）后回到自动跟随，避免停留在旧选择上。
  useEffect(() => {
    setStableChoice(null);
    setPrereleaseChoice(null);
  }, [current]);

  const toggleChannelMenu = (channel: HarnessChannelKey, anchor: HTMLElement) => {
    if (openChannel === channel) {
      setOpenChannel(null);
      return;
    }
    menuAnchorRef.current = anchor;
    setOpenChannel(channel);
  };

  // 菜单几何：右对齐触发器、钳制在视口内；下方空间不足时向上翻。
  useLayoutEffect(() => {
    if (!openChannel) {
      setMenuStyle(null);
      return;
    }
    const update = () => {
      const anchor = menuAnchorRef.current;
      if (!anchor) {
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - MENU_MARGIN - MENU_GAP;
      const above = rect.top - MENU_MARGIN - MENU_GAP;
      const flip = below < MENU_MIN_HEIGHT && above > below;
      setMenuStyle({
        position: 'fixed',
        minWidth: Math.max(rect.width, 200),
        maxHeight: Math.max(MENU_MIN_HEIGHT, flip ? above : below),
        overflowY: 'auto',
        right: Math.max(MENU_MARGIN, window.innerWidth - rect.right),
        ...(flip
          ? { bottom: window.innerHeight - rect.top + MENU_GAP }
          : { top: rect.bottom + MENU_GAP }),
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [openChannel]);

  // 外部 mousedown 关闭：触发器自身的 mousedown 放行，由其 click 负责切换。
  useEffect(() => {
    if (!openChannel) {
      return;
    }
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuPanelRef.current?.contains(target) || menuAnchorRef.current?.contains(target)) {
        return;
      }
      setOpenChannel(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenChannel(null);
      }
    };
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openChannel]);

  const pickChannelVersion = (channel: HarnessChannelKey, version: string) => {
    if (channel === 'stable') {
      setStableChoice(version);
    } else {
      setPrereleaseChoice(version);
    }
    setOpenChannel(null);
  };

  return {
    stableChoice,
    prereleaseChoice,
    openChannel,
    menuStyle,
    menuAnchorRef,
    menuPanelRef,
    toggleChannelMenu,
    pickChannelVersion,
  };
}
