import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';

export type HarnessChannelKey = 'stable' | 'prerelease';

/** 版本下拉菜单几何（Portal + fixed 定位），与旧 DSH 版本菜单同口径。 */
export interface HarnessMenuGeometry {
  /** 向下打开：菜单顶边相对视口（与 bottom 互斥） */
  top?: number;
  /** 向上打开：菜单底边锚定触发器上边缘（与 top 互斥） */
  bottom?: number;
  left: number;
  width: number;
  /** 向上打开且上方空间不足时收窄列表高（向下打开为 undefined，走 CSS 上限） */
  maxHeight?: number;
}

const MENU_OFFSET = 6;
const MENU_MAX_HEIGHT = 280;
const MENU_MIN_HEIGHT = 80;
const VIEWPORT_MARGIN = 8;

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

/** 分区最长版本号（测量尺用）。 */
export function longestVersionOf(
  infos: { version: string }[],
  format: (version: string) => string = (version) => version,
): string | null {
  return infos.reduce<string | null>((acc, info) => {
    const label = format(info.version);
    return acc == null || label.length > acc.length ? label : acc;
  }, null);
}

/** 两处实测取最大（任一缺席则取另一方，都缺席为 null）。 */
function maxWidth(a: number | null, b: number | null): number | null {
  if (a == null) {
    return b;
  }
  if (b == null) {
    return a;
  }
  return Math.max(a, b);
}

export interface HarnessChannelMenuOptions {
  current: string | null;
  stableInfos: { version: string }[];
  prereleaseInfos: { version: string }[];
}

/**
 * 双通道行内选择器的交互面：每个通道同一时刻
 * 只展示一个版本，选择只换展示；下拉框与菜单卡片同宽（取分区最长选项实测值，
 * 菜单内单行不换行），菜单经 Portal 挂到 body（fixed 定位，右对齐触发器并钳制
 * 在视口内，下方空间不足时上翻）。交互语义与旧 DSH 版本菜单一致。
 */
export function useHarnessVersionChannelMenu({
  current,
  stableInfos,
  prereleaseInfos,
}: HarnessChannelMenuOptions) {
  const { t } = useTCopy();
  const [stableChoice, setStableChoice] = useState<string | null>(null);
  const [prereleaseChoice, setPrereleaseChoice] = useState<string | null>(null);
  const [openChannel, setOpenChannel] = useState<HarnessChannelKey | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuGeometry, setMenuGeometry] = useState<HarnessMenuGeometry | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const [menuWidths, setMenuWidths] = useState<{
    stable: number | null;
    prerelease: number | null;
  }>({
    stable: null,
    prerelease: null,
  });
  const stableSizerRef = useRef<HTMLDivElement | null>(null);
  const prereleaseSizerRef = useRef<HTMLDivElement | null>(null);
  const stablePickerSizerRef = useRef<HTMLDivElement | null>(null);
  const prereleasePickerSizerRef = useRef<HTMLDivElement | null>(null);

  // 当前版本变化（安装/切换完成）后回到自动跟随，避免停留在旧选择上。
  useEffect(() => {
    setStableChoice(null);
    setPrereleaseChoice(null);
  }, [current]);

  // 分区最长选项实测宽度：下拉框与菜单卡片同宽，取“菜单项 replica”与
  // “下拉框 replica（含箭头）”两者最大。徽章文案随语言变化，故依赖徽章文案重测。
  const installedBadgeText = t.harnessVersionInstalled;
  useLayoutEffect(() => {
    const measure = (ref: { current: HTMLDivElement | null }) => {
      const el = ref.current;
      if (!el) {
        return null;
      }
      // 卡片内边距（左右 space-1）计入，保证内容不挤压换行；钳制非负与视口。
      return Math.max(
        0,
        Math.min(Math.ceil(el.scrollWidth) + 8, window.innerWidth - 2 * VIEWPORT_MARGIN),
      );
    };
    const measured = {
      stable: maxWidth(measure(stableSizerRef), measure(stablePickerSizerRef)),
      prerelease: maxWidth(measure(prereleaseSizerRef), measure(prereleasePickerSizerRef)),
    };
    // 两个通道的下拉框/菜单保持同一水平宽度：取两者实测最大值。
    const common = maxWidth(measured.stable, measured.prerelease);
    const next = { stable: common, prerelease: common };
    // 相等时复用旧引用，避免无意义重渲染。
    setMenuWidths((prev) =>
      prev.stable === next.stable && prev.prerelease === next.prerelease ? prev : next,
    );
  }, [stableInfos, prereleaseInfos, installedBadgeText]);

  /**
   * 版本菜单几何：菜单经 Portal 挂到 body（fixed），不受设置面板滚动容器
   * 裁剪。右对齐触发器并钳制在视口内；下方空间不足则上翻并按上方高度收窄
   * （与 SettingsSelect 同口径）。宽度取分区最长选项实测值，仅在超出视口时
   * 收缩；实测值未就绪时回退触发器宽度。
   */
  const updateMenuGeometry = () => {
    const anchor = menuAnchor;
    if (!anchor) {
      return;
    }
    // 触发器被卸载/重建（行按版本 key 重渲染）后 rect 全 0，菜单会贴到左上角：
    // 直接收起，比画在一个不存在的位置更合理。
    if (!anchor.isConnected) {
      setOpenChannel(null);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const measured = openChannel === 'prerelease' ? menuWidths.prerelease : menuWidths.stable;
    const target = measured ?? rect.width;
    // 与触发下拉框同宽；超出视口才收缩，极端窄视口下限钳制为 0。
    const width = Math.max(0, Math.min(target, window.innerWidth - 2 * VIEWPORT_MARGIN));
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(rect.right - width, window.innerWidth - width - VIEWPORT_MARGIN),
    );
    const belowTop = rect.bottom + MENU_OFFSET;
    const fitsBelow = belowTop + MENU_MAX_HEIGHT <= window.innerHeight - VIEWPORT_MARGIN;
    setMenuGeometry(
      fitsBelow
        ? { top: belowTop, left, width, maxHeight: undefined }
        : {
            top: undefined,
            bottom: window.innerHeight - rect.top + MENU_OFFSET,
            left,
            width,
            maxHeight: Math.min(
              MENU_MAX_HEIGHT,
              Math.max(MENU_MIN_HEIGHT, rect.top - MENU_OFFSET - VIEWPORT_MARGIN),
            ),
          },
    );
  };

  useLayoutEffect(() => {
    if (openChannel && menuAnchor) {
      updateMenuGeometry();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openChannel, menuAnchor, menuWidths]);

  // 点击外部关闭版本菜单（触发器与 Portal 菜单都在「内部」判定内）。
  useEffect(() => {
    if (!openChannel) {
      return;
    }
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuAnchor?.contains(target) || menuPanelRef.current?.contains(target)) {
        return;
      }
      setOpenChannel(null);
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [openChannel, menuAnchor]);

  // Esc 关闭版本菜单（键盘可达性）。
  useEffect(() => {
    if (!openChannel) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenChannel(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [openChannel]);

  // 菜单打开期间跟随触发器重定位（面板内滚动 capture + 视口 resize）；菜单自身滚动不重定位。
  useEffect(() => {
    if (!openChannel) {
      return;
    }
    const handleReposition = (e: Event) => {
      if (e.target instanceof Node && menuPanelRef.current?.contains(e.target)) {
        return;
      }
      updateMenuGeometry();
    };
    document.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      document.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openChannel, menuAnchor, menuWidths]);

  const toggleChannelMenu = (channel: HarnessChannelKey, anchor: HTMLElement) => {
    // 同一个触发器再点一次 = 收起。外部点击监听刻意放行触发器内的点击
    //（否则 mousedown 关、click 又开），所以开关必须在这里显式切换。
    if (openChannel === channel) {
      setOpenChannel(null);
      return;
    }
    setMenuAnchor(anchor);
    setOpenChannel(channel);
  };

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
    menuGeometry,
    menuPanelRef,
    menuWidths,
    sizerRefs: {
      stableSizerRef,
      prereleaseSizerRef,
      stablePickerSizerRef,
      prereleasePickerSizerRef,
    },
    toggleChannelMenu,
    pickChannelVersion,
  };
}
