import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import { Spinner } from '@components/Spinner';
import { SettingsHintButton } from '@components/settings/SettingsHintButton';
import { SettingsSelect } from '@components/settings/SettingsSelect';
import { RevealScrollbar } from '@components/RevealScrollbar';
import { useRevealScrollbar } from '@hooks/useRevealScrollbar';
import { openUrlByMethod } from '@features/preview/openByMethod';
import type {
  DshVersionInfo,
  DshVersionSourceMode,
  DshVersionTaskKind,
} from '../../../shared/ipc/dsh';

/** 空列表单例：避免 `?? []` 每渲染新建数组导致下游 useCallback 依赖抖动。 */
const EMPTY_VERSIONS: DshVersionInfo[] = [];

/** 官方信息外链（事项 5）：npm 包页 + GitHub Releases，经 openExternal 双端跳转。 */
const NPM_PACKAGE_URL = 'https://www.npmjs.com/package/@deepseek-ai/dsh';
const GITHUB_RELEASES_URL = 'https://github.com/deepseek-ai/deepseek-harness/releases';
/**
 * 版本管理调试埋点（临时）：用户在 Tauri 桌面实测后，凭此前缀在
 * `.adl-logs/debug-logs*.txt` 中定位版本块日志，核对排查后再删除。
 * 移除义务已登记在 `docs/root-cause-to-close/2026-10/progress-2026-10-19-095312.md`（事项 5）。
 */
function debugVer(message: string, detail?: Record<string, unknown>) {
  console.debug('[ADL-DSH-VER]', message, detail ?? {});
}

/** `publishedAt`（RFC3339）取 `YYYY-MM-DD HH:mm` 展示；缺失/非法回退原文/空。 */
function formatPublishedAt(publishedAt: string | null): string {
  if (!publishedAt) {
    return '';
  }
  const m = publishedAt.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : publishedAt;
}

/** 版本下拉菜单几何（Portal + fixed 定位），与 SettingsSelect 同口径。 */
interface MenuGeometry {
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

/** 勾选图标 */
function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3 8.5L6.5 12L13 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 下拉箭头图标（版本选择下拉框按钮用） */
function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 6L8 10L12 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * dsh 版本管理块（当前版本行 + 检查更新行 + 正式版行 + 预发布行 + 官方版本信息行）。
 *
 * 由设置面板「DSH」设置组的「版本管理」块承载：与下载源/代理/测试连接三块同构，
 * 块头（`SettingsHeader`）在卡外，块体为一张 `adl-settings-card`（五行）——
 * 「当前版本」行右侧为版本读数（版本号 + 状态徽标 + 最新可用版本 + 预发布提示），
 * 「检查更新」行右侧为单个检查按钮，
 * 「正式版本」/「预发布版本」行右侧为单版本行（发布时间 + 按状态显示的
 * 卸载/重装/安装/切换按钮 + 版本选择下拉框；下拉框菜单列出本分区全部版本），
 * 「官方版本信息」行在说明文字内嵌蓝色外链（跟随「打开方式」网址落点跳转）。
 * 两行副标题左侧带行内「?」提示图标（`SettingsHintButton`）。
 *
 * 调用方契约：本组件只渲染行卡片，不自建页面地标，也不渲染块头。
 */
export function DshVersionManagement() {
  const { t } = useTCopy();
  const actions = useAppActions();
  const versionStatus = useAppStore((s) => s.versionStatus);
  const versionCatalog = useAppStore((s) => s.versionCatalog);
  const versionCatalogFailed = useAppStore((s) => s.versionCatalogFailed);
  const versionTask = useAppStore((s) => s.versionTask);
  const dshSourceStatus = useAppStore((s) => s.sourceStatus);
  const showToast = useAppStore((s) => s.showToast);
  const stableVersions = useMemo(() => versionCatalog?.stable ?? EMPTY_VERSIONS, [versionCatalog]);
  const prereleaseVersions = useMemo(
    () => versionCatalog?.prerelease ?? EMPTY_VERSIONS,
    [versionCatalog],
  );

  const [uninstallConfirm, setUninstallConfirm] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [reinstalling, setReinstalling] = useState(false);
  const [revertingVersion, setRevertingVersion] = useState<string | null>(null);
  const [installingVersion, setInstallingVersion] = useState<string | null>(null);
  const [showVersionMenu, setShowVersionMenu] = useState(false);
  const [uninstallingVersion, setUninstallingVersion] = useState<string | null>(null);
  const [menuGeometry, setMenuGeometry] = useState<MenuGeometry | null>(null);
  const checkingRef = useRef(false);
  const reinstallingRef = useRef(false);
  const revertingRef = useRef<string | null>(null);
  const installingRef = useRef<string | null>(null);
  const cancelRequestedRef = useRef(false);
  const uninstallingRef = useRef<string | null>(null);
  const versionMenuPanelRef = useRef<HTMLDivElement>(null);
  // 版本选择下拉框的锚点 + 所属分区：点击哪行的下拉框，菜单就定位在哪行下方，
  // 菜单内列出该分区全部版本。
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);
  const [menuSection, setMenuSection] = useState<'stable' | 'prerelease' | null>(null);
  // 下拉框/菜单固定宽度（事项 7）：取分区内最长选项实测宽度，保证菜单内
  // “版本号 + 徽章”全部单行。sizer 与菜单项同类名，保证字体/间距一致。
  const [menuWidths, setMenuWidths] = useState<{
    stable: number | null;
    prerelease: number | null;
  }>({
    stable: null,
    prerelease: null,
  });
  const stableSizerRef = useRef<HTMLDivElement>(null);
  const prereleaseSizerRef = useRef<HTMLDivElement>(null);

  const currentSelected = versionStatus?.currentSelected ?? null;
  const latestAvailable = versionStatus?.latestAvailable ?? null;
  const hasUpdate = versionStatus?.hasUpdate ?? false;
  const prereleaseAvailable = versionStatus?.prereleaseAvailable ?? null;
  const hasPrereleaseUpdate = versionStatus?.hasPrereleaseUpdate ?? false;
  const installed = versionStatus?.installed ?? [];
  const versionSource = dshSourceStatus?.versionSource ?? null;
  const sourceMode: DshVersionSourceMode =
    versionSource?.mode ?? dshSourceStatus?.config.version_source ?? 'auto';
  // 显隐条件（或语义，任一成立即隐藏；defer 期间切换尚未生效，保持显示 + 提示行）：
  // ① mode=system：用户配了系统来源，running 恒优先会使 system 进程在跑时
  // effective=running，只看 effective 就永远藏不住（用户实测 2026-10-20）；
  // ② effective=system：自动检测下本应用内无可用版本、实际落在系统安装上
  // （预存回归：`实际来源为系统安装时隐藏管理项并显示说明`）。
  const modeIsSystem = sourceMode === 'system';
  const effectiveIsSystem = versionSource?.effective === 'system';
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [sourceDialogBusy, setSourceDialogBusy] = useState(false);
  // 对话框目标：切向 system 走系统文案，离开 system（→host/auto）走通用切换文案。
  const [pendingMode, setPendingMode] = useState<DshVersionSourceMode | null>(null);
  const deferredSource = useAppStore((s) => s.dshVersionSourceDeferred);
  const setDeferredSource = useAppStore((s) => s.setDshVersionSourceDeferred);
  const pendingSource = useAppStore((s) => s.dshVersionSourcePending);
  const setPendingSource = useAppStore((s) => s.setDshVersionSourcePending);
  // 显隐：配置为系统（mode）或实际落在系统（effective）或待切换为系统（pending）
  // 任一成立即隐藏。defer 期间选择器仍显示当前生效来源，另有 deferred 提示行说明。
  const pendingIsSystem = pendingSource === 'system';
  const systemManaged = modeIsSystem || effectiveIsSystem || pendingIsSystem;
  const autoSwitchedRef = useRef(false);
  const sourceDialogCancelRef = useRef<HTMLButtonElement | null>(null);

  // 各分区下拉框选中的版本（null = 自动跟随：当前选中在该分区则显示它，否则显示该分区最新）。
  const [stablePick, setStablePick] = useState<string | null>(null);
  const [prereleasePick, setPrereleasePick] = useState<string | null>(null);
  // 安装/切换完成后当前版本变化，回到跟随，避免停留在旧选择上。
  useEffect(() => {
    setStablePick(null);
    setPrereleasePick(null);
  }, [currentSelected]);

  const pickEffective = useCallback(
    (infos: { version: string }[], pick: string | null): string | null => {
      if (pick && infos.some((i) => i.version === pick)) {
        return pick;
      }
      if (currentSelected && infos.some((i) => i.version === currentSelected)) {
        return currentSelected;
      }
      return infos[0]?.version ?? null;
    },
    [currentSelected],
  );
  const stableEffective = pickEffective(stableVersions, stablePick);
  const prereleaseEffective = pickEffective(prereleaseVersions, prereleasePick);

  // 分区最长版本号（测量尺用；时间固定 16 字符格式，徽章/勾选恒显取最宽）。
  const longestStableVersion = useMemo(
    () =>
      stableVersions.reduce<string | null>(
        (acc, i) => (acc == null || i.version.length > acc.length ? i.version : acc),
        null,
      ),
    [stableVersions],
  );
  const longestPrereleaseVersion = useMemo(
    () =>
      prereleaseVersions.reduce<string | null>(
        (acc, i) => (acc == null || i.version.length > acc.length ? i.version : acc),
        null,
      ),
    [prereleaseVersions],
  );

  const isCurrentSelected = installed.includes(currentSelected ?? '') && currentSelected !== null;
  // 任一版本操作在途时禁用全部操作按钮，避免并发卸载/回退/升级/安装（防重入仅拦同种操作）。
  const versionBusy =
    checkingUpdate ||
    reinstalling ||
    revertingVersion !== null ||
    installingVersion !== null ||
    uninstallingVersion !== null;

  // 当前分区菜单的版本列表（随下拉框所属分区切换）。
  const menuVersions = menuSection === 'prerelease' ? prereleaseVersions : stableVersions;
  const menuEffective = menuSection === 'prerelease' ? prereleaseEffective : stableEffective;

  // 分区最长选项实测宽度（事项 7/8）：sizer 与菜单项同类名，保证字体/间距一致；
  // 下拉框与菜单卡片均固定为该宽度，菜单内“版本号 + 徽章”恒单行。
  // 关键：被测量的 sizer 项必须用 inline-flex 收缩包裹内容——块级 flex 盒会自动
  // 拉伸到容器（卡片内容区）宽度，量到的就是卡片宽度而非内容宽度（事项 8 根因，
  // 见 `.adl-dsh-settings__version-sizer-item`）。
  // 徽章文案随语言变化，故依赖徽章文案重测。
  const installedBadgeText = t.dshInstalledVersions;
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
    const next = {
      stable: measure(stableSizerRef),
      prerelease: measure(prereleaseSizerRef),
    };
    // 相等时复用旧引用，避免无意义重渲染连带挂载拉取重复触发。
    setMenuWidths((prev) =>
      prev.stable === next.stable && prev.prerelease === next.prerelease ? prev : next,
    );
    debugVer('measure: menu widths', {});
  }, [stableVersions, prereleaseVersions, installedBadgeText]);

  const menuScrollbar = useRevealScrollbar([
    showVersionMenu,
    menuVersions.length,
    menuGeometry !== null,
  ]);

  // 目标版本变化（切换/回退/卸载完成）时清除卸载确认态，避免残留的 danger 样式
  // 指向新的当前版本。
  useEffect(() => {
    setUninstallConfirm(false);
  }, [currentSelected]);

  useEffect(() => {
    if (sourceMode !== 'auto') {
      autoSwitchedRef.current = false;
    }
  }, [sourceMode]);

  useEffect(() => {
    if (!versionSource || versionSource.mode !== 'auto' || versionSource.effective !== 'none') {
      return;
    }
    if (!versionStatus || installed.length > 0) {
      return;
    }
    if (autoSwitchedRef.current) {
      return;
    }
    autoSwitchedRef.current = true;
    debugVer('source: auto resolved none, switching to host', {});
    void (async () => {
      const ok = await actions.saveSourceConfig({ version_source: 'host' }, true);
      if (ok) {
        // 直接落盘即“本次生效”，清掉可能残留的下次启动 pending。
        setPendingSource(null);
        setDeferredSource(false);
      }
    })();
  }, [versionSource, versionStatus, installed.length, actions, setPendingSource, setDeferredSource]);

  /**
   * 版本菜单几何：菜单经 Portal 挂到 body（fixed），不受设置面板滚动容器
   * （`.adl-settings-panel__content` overflow-y:auto）裁剪。右对齐触发器并钳制在视口内；
   * 下方空间不足则上翻并按上方高度收窄（同 SettingsSelect 口径）。
   * 宽度取分区最长选项实测值（事项 7：下拉框与菜单同宽，菜单内单行不换行），
   * 仅在超出视口时收缩；实测值未就绪时回退触发器宽度。
   * 锚点与所属分区来自当前打开菜单的行内下拉框。
   */
  const updateMenuGeometry = useCallback(() => {
    const anchor = menuAnchorEl;
    if (!anchor) {
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const measured = menuSection === 'prerelease' ? menuWidths.prerelease : menuWidths.stable;
    const target = measured ?? rect.width;
    // 与触发下拉框同宽（事项 7 用户要求）；超出视口才收缩，极端窄视口下限钳制为 0。
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
  }, [menuAnchorEl, menuSection, menuWidths]);

  useLayoutEffect(() => {
    if (showVersionMenu) {
      updateMenuGeometry();
    }
  }, [showVersionMenu, updateMenuGeometry]);

  // 点击外部关闭版本菜单（触发器与 Portal 菜单都在「内部」判定内）。
  useEffect(() => {
    if (!showVersionMenu) {
      return;
    }
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuAnchorEl?.contains(target) || versionMenuPanelRef.current?.contains(target)) {
        return;
      }
      setShowVersionMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [showVersionMenu, menuAnchorEl]);

  // Esc 关闭版本菜单（键盘可达性）。
  useEffect(() => {
    if (!showVersionMenu) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowVersionMenu(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showVersionMenu]);

  // 菜单打开期间跟随触发器重定位（面板内滚动 capture + 视口 resize）；菜单自身滚动不重定位。
  useEffect(() => {
    if (!showVersionMenu) {
      return;
    }
    const handleReposition = (e: Event) => {
      if (e.target instanceof Node && versionMenuPanelRef.current?.contains(e.target)) {
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
  }, [showVersionMenu, updateMenuGeometry]);

  const handleCheckUpdate = useCallback(async () => {
    if (checkingRef.current) {
      return;
    }
    checkingRef.current = true;
    setCheckingUpdate(true);
    debugVer('checkUpdate: start', {});
    try {
      const ok = await actions.fetchDshVersionStatus();
      if (!ok) {
        // 失败已由 action 记录全局错误卡片，不再重复弹 toast。
        debugVer('checkUpdate: fetch failed (error card shown)', {});
        return;
      }
      const status = useAppStore.getState().versionStatus;
      debugVer('checkUpdate: result', {
        latestAvailable: status?.latestAvailable ?? null,
        hasUpdate: status?.hasUpdate ?? false,
        prereleaseAvailable: status?.prereleaseAvailable ?? null,
        hasPrereleaseUpdate: status?.hasPrereleaseUpdate ?? false,
      });
      // latest 为 null 说明查询失败（断网/镜像不可达），此时 hasUpdate 恒 false，
      // 不得误报“已是最新版本”，必须报检查失败（事项 5 确认的 Bug）。
      if (!status?.latestAvailable) {
        if (status?.hasPrereleaseUpdate && status.prereleaseAvailable) {
          showToast(
            t.dshCheckUpdatePrerelease.replace('{version}', status.prereleaseAvailable),
            'success',
          );
        } else {
          showToast(t.dshCheckUpdateNoStable, 'warning');
        }
        void actions.fetchVersionCatalog(true);
        return;
      }
      if (status.hasUpdate) {
        showToast(t.dshCheckUpdateFound.replace('{version}', status.latestAvailable), 'success');
      } else {
        showToast(t.dshNoUpdate, 'success');
      }
      // 检查更新顺带静默刷新官方目录，供下方正式版/预发布列表展示。
      void actions.fetchVersionCatalog(true);
    } catch {
      debugVer('checkUpdate: threw', {});
      showToast(t.dshCheckUpdateFailed, 'error');
    } finally {
      checkingRef.current = false;
      setCheckingUpdate(false);
    }
  }, [actions, showToast, t]);

  const handleRevertToVersion = useCallback(
    async (version: string) => {
      if (revertingRef.current || version === currentSelected) {
        return;
      }
      revertingRef.current = version;
      setRevertingVersion(version);
      setShowVersionMenu(false);
      debugVer('revert: start', { version });
      try {
        const ok = await actions.revertDsh(version);
        if (ok) {
          debugVer('revert: ok', { version });
          const restart = await actions.restartDsh();
          await actions.fetchSourceStatus(true);
          if (restart.failed) {
            showToast(t.dshRestartFailed, 'error');
          } else {
            showToast(
              restart.restarted
                ? t.dshSwitchedRestarted.replace('{version}', version)
                : t.dshSwitchedOnly.replace('{version}', version),
              'success',
            );
          }
        }
      } catch {
        // 意外异常兜底；常规失败已由 action 记录全局错误卡片。
        debugVer('revert: threw', { version });
        showToast(t.dshRevertFailed, 'error');
      } finally {
        revertingRef.current = null;
        setRevertingVersion(null);
      }
    },
    [actions, currentSelected, showToast, t],
  );

  /**
   * 执行一次卸载：防重入守卫 + busy 状态 + 请求 + 成功/失败提示 + 清理。
   * 三处卸载入口（版本菜单单项、当前版本、当前版本确认）共用，避免逻辑漂移。
   */
  const runUninstall = useCallback(
    async (version: string) => {
      if (uninstallingRef.current) {
        return;
      }
      uninstallingRef.current = version;
      setUninstallingVersion(version);
      try {
        const ok = await actions.uninstallDsh(version);
        if (ok) {
          const next = useAppStore.getState().versionStatus?.currentSelected ?? null;
          if (version === currentSelected) {
            const restart = await actions.restartDsh();
            await actions.fetchSourceStatus(true);
            if (restart.failed) {
              showToast(t.dshRestartFailed, 'error');
            } else {
              showToast(
                next
                  ? t.dshUninstalledSwitched.replace('{version}', version).replace('{next}', next)
                  : t.dshUninstalledNoVersion.replace('{version}', version),
                'success',
              );
            }
          } else {
            await actions.fetchSourceStatus(true);
            showToast(t.dshUninstallSuccess.replace('{version}', version), 'success');
          }
        } else if (cancelRequestedRef.current) {
          showToast(t.dshVersionCancelled, 'warning');
        }
      } catch {
        // 意外异常兜底；常规失败已由 action 记录全局错误卡片。
        if (cancelRequestedRef.current) {
          showToast(t.dshVersionCancelled, 'warning');
        } else {
          showToast(t.dshUninstallFailed, 'error');
        }
      } finally {
        cancelRequestedRef.current = false;
        void actions.fetchVersionTask();
        uninstallingRef.current = null;
        setUninstallingVersion(null);
      }
    },
    [actions, currentSelected, showToast, t],
  );

  const handleReinstall = useCallback(async () => {
    if (reinstallingRef.current) {
      return;
    }
    reinstallingRef.current = true;
    setReinstalling(true);
    debugVer('reinstall: start', { currentSelected });
    try {
      const ok = await actions.reinstallDsh();
      if (ok) {
        debugVer('reinstall: ok', { currentSelected });
        const restart = await actions.restartDsh();
        await actions.fetchSourceStatus(true);
        if (restart.failed) {
          showToast(t.dshRestartFailed, 'error');
        } else {
          const version = currentSelected ?? '';
          showToast(
            restart.restarted
              ? t.dshReinstalledRestarted.replace('{version}', version)
              : t.dshReinstalledOnly.replace('{version}', version),
            'success',
          );
        }
      } else if (cancelRequestedRef.current) {
        showToast(t.dshVersionCancelled, 'warning');
      }
    } catch {
      // 意外异常兜底；常规失败已由 action 记录全局错误卡片。
      debugVer('reinstall: threw', {});
      if (cancelRequestedRef.current) {
        showToast(t.dshVersionCancelled, 'warning');
      } else {
        showToast(t.dshReinstallFailed, 'error');
      }
    } finally {
      cancelRequestedRef.current = false;
      void actions.fetchVersionTask();
      reinstallingRef.current = false;
      setReinstalling(false);
    }
  }, [actions, showToast, t, currentSelected]);

  /**
   * 官方列表行安装：未装版本走 install（后端校验官方确已发布后登记选中），
   * 下次 open 即按该版本启动。预发布同样经此入口（调用前已有分区说明）。
   */
  const handleInstallVersion = useCallback(
    async (version: string) => {
      if (installingRef.current) {
        return;
      }
      installingRef.current = version;
      setInstallingVersion(version);
      debugVer('installVersion: start', { version });
      try {
        const ok = await actions.installDshVersion(version);
        if (ok) {
          debugVer('installVersion: ok', { version });
          const restart = await actions.restartDsh();
          await actions.fetchSourceStatus(true);
          if (restart.failed) {
            showToast(t.dshRestartFailed, 'error');
          } else {
            showToast(
              restart.restarted
                ? t.dshInstalledRestarted.replace('{version}', version)
                : t.dshInstallSuccess.replace('{version}', version),
              'success',
            );
          }
        } else if (cancelRequestedRef.current) {
          showToast(t.dshVersionCancelled, 'warning');
        }
      } catch {
        debugVer('installVersion: threw', { version });
        if (cancelRequestedRef.current) {
          showToast(t.dshVersionCancelled, 'warning');
        } else {
          showToast(t.dshInstallFailed, 'error');
        }
      } finally {
        cancelRequestedRef.current = false;
        void actions.fetchVersionTask();
        installingRef.current = null;
        setInstallingVersion(null);
      }
    },
    [actions, showToast, t],
  );

  const sourceOptions = useMemo(
    () => [
      { value: 'auto', label: t.dshVersionSourceAuto },
      { value: 'system', label: t.dshVersionSourceSystem },
      { value: 'host', label: t.dshVersionSourceHost },
    ],
    [t],
  );

  const saveVersionSource = useCallback(
    async (mode: DshVersionSourceMode): Promise<boolean> => {
      const ok = await actions.saveSourceConfig({ version_source: mode }, true);
      if (!ok) {
        showToast(t.dshSettingsSaveFailed, 'error');
        return false;
      }
      // 直接落盘即“本次生效”，清掉可能残留的下次启动 pending（事项 2026-10-20/5）。
      setPendingSource(null);
      setDeferredSource(false);
      await actions.fetchSourceStatus(true);
      return true;
    },
    [actions, setPendingSource, setDeferredSource, showToast, t],
  );

  const handleSourceChange = useCallback(
    async (value: string) => {
      const mode = value as DshVersionSourceMode;
      debugVer('source: change', { mode });
      // 决策前现查一次：挂载时拉取的快照在预拉起完成前 `running` 为 null，
      // 直接存会跳过确认对话框；现查约数百毫秒，误判代价远大于等待
      // （用户实测切源无弹窗即此 stale 快照所致）。
      await actions.fetchSourceStatus(true);
      const fresh = useAppStore.getState().sourceStatus;
      debugVer('source: change probed', {
        running: fresh?.running?.url ?? null,
        system: fresh?.system?.path ?? null,
      });
      const currentMode: DshVersionSourceMode =
        fresh?.versionSource?.mode ?? fresh?.config?.version_source ?? 'auto';
      if (mode === 'system') {
        if (!fresh?.system) {
          showToast(t.dshSystemMissing, 'error');
          return;
        }
        if (fresh?.running) {
          setPendingMode('system');
          setSourceDialogOpen(true);
          return;
        }
        if (await saveVersionSource('system')) {
          setDeferredSource(false);
        }
        return;
      }
      // 离开 system（→host/auto）且有运行中：同样确认，否则旧进程继续服务、
      // 当前版本恒显旧版（用户实测 system→host 无弹窗 + 版本错即此缺口）。
      if (currentMode === 'system' && fresh?.running) {
        setPendingMode(mode);
        setSourceDialogOpen(true);
        return;
      }
      setDeferredSource(false);
      await saveVersionSource(mode);
    },
    [actions, setDeferredSource, saveVersionSource, showToast, t],
  );

  // 确认对话框三选项（目标由 pendingMode 承载）：
  // · 下次启动生效：只记 pending（localStorage）+ deferred 标记，不写配置，
  //   选择器保持显示当前生效来源，下次启动由 `applyPendingVersionSource` 兑现
  //   （事项 2026-10-20/5：此前直接落盘导致“本次仍使用当前来源”与显示矛盾）。
  // · 立即生效：落盘 + 清 pending + 重启（无 dsh 标签时不自动新建）。
  // · 取消：切向 system 时回退宿主（历史行为保持）；离开 system 时保持 system 不写盘。
  const handleSystemDialogChoice = useCallback(
    async (choice: 'next' | 'now' | 'cancel') => {
      if (sourceDialogBusy) {
        return;
      }
      setSourceDialogBusy(true);
      const target: DshVersionSourceMode = pendingMode ?? 'system';
      debugVer('source: dialog choice', { choice, target });
      try {
        if (choice === 'cancel') {
          setDeferredSource(false);
          if (target === 'system') {
            await saveVersionSource('host');
          }
          return;
        }
        if (choice === 'next') {
          setPendingSource(target);
          setDeferredSource(true);
          debugVer('source: deferred to next launch', { target });
          showToast(t.dshVersionSourceNextLaunchSaved, 'success');
          return;
        }
        if (!(await saveVersionSource(target))) {
          return;
        }
        const restart = await actions.restartDsh();
        await actions.fetchSourceStatus(true);
        showToast(
          restart.failed ? t.dshRestartFailed : t.dshVersionSourceSwitched,
          restart.failed ? 'error' : 'success',
        );
      } finally {
        setSourceDialogBusy(false);
        setSourceDialogOpen(false);
        setPendingMode(null);
      }
    },
    [
      actions,
      setPendingSource,
      setDeferredSource,
      saveVersionSource,
      showToast,
      sourceDialogBusy,
      t,
      pendingMode,
    ],
  );

  useEffect(() => {
    if (!sourceDialogOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || sourceDialogBusy) {
        return;
      }
      // Escape 仅关闭对话框，不做任何写入：用户"先不做决定"不应被记为"取消回退 host"。
      event.preventDefault();
      setSourceDialogOpen(false);
      setPendingMode(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sourceDialogBusy, sourceDialogOpen]);

  useEffect(() => {
    if (sourceDialogOpen) {
      sourceDialogCancelRef.current?.focus();
    }
  }, [sourceDialogOpen]);

  /** 官方版本信息外链：跟随「打开方式」设置的网址落点（面板/中间区/外部浏览器）。 */
  const handleOpenOfficial = useCallback((url: string) => {
    debugVer('openOfficial: start', { url });
    openUrlByMethod(url);
  }, []);

  /**
   * 行内卸载：当前版本需二次确认（danger 态武装，再点执行），非当前直接执行。
   * 确认态文案挂在当前版本行下方（`dshUninstallCurrentHint`）。
   */
  const handleUninstallRow = useCallback(
    async (version: string) => {
      if (uninstallingRef.current) {
        return;
      }
      if (version === currentSelected && !uninstallConfirm) {
        debugVer('uninstall: arm confirm', { version });
        setUninstallConfirm(true);
        return;
      }
      debugVer('uninstall: confirmed start', { version });
      setUninstallConfirm(false);
      await runUninstall(version);
    },
    [currentSelected, uninstallConfirm, runUninstall],
  );

  /**
   * 行内重装：当前版本走真重装（不切换）；已装非当前版本走登记并选中
   *（`installVersion` 对已装目录幂等，效果等同重装该版本并切换过去）。
   */
  const handleReinstallRow = useCallback(
    async (version: string) => {
      if (version === currentSelected) {
        await handleReinstall();
        return;
      }
      await handleInstallVersion(version);
    },
    [currentSelected, handleReinstall, handleInstallVersion],
  );

  /** 行内版本选择下拉框：以该行为锚点打开本分区版本菜单（列出该分区全部版本供选择）。 */
  const handleOpenPicker = useCallback((section: 'stable' | 'prerelease', anchor: HTMLElement) => {
    debugVer('picker: open menu', { section });
    setMenuSection(section);
    setMenuAnchorEl(anchor);
    setShowVersionMenu(true);
  }, []);

  /** 菜单内选择版本：只切换本分区的下拉框展示，关闭菜单；实际安装/切换走行内按钮。 */
  const handlePickVersion = useCallback((section: 'stable' | 'prerelease', version: string) => {
    debugVer('picker: pick version', { section, version });
    if (section === 'prerelease') {
      setPrereleasePick(version);
    } else {
      setStablePick(version);
    }
    setShowVersionMenu(false);
  }, []);

  useEffect(() => {
    debugVer('mount: fetching version status + catalog', {});
    void actions.fetchDshVersionStatus();
    void actions.fetchSourceStatus(true);
    void actions.fetchVersionCatalog();
  }, [actions]);

  useEffect(() => {
    void actions.fetchVersionTask();
    if (!versionBusy) {
      return;
    }
    const id = window.setInterval(() => {
      void actions.fetchVersionTask();
    }, 400);
    return () => window.clearInterval(id);
  }, [versionBusy, actions]);

  const handleCancelTask = useCallback(async () => {
    cancelRequestedRef.current = true;
    const ok = await actions.cancelVersionTask();
    if (!ok) {
      cancelRequestedRef.current = false;
      showToast(t.dshVersionCancelFailed, 'error');
    }
  }, [actions, showToast, t]);

  const taskCancelLabel = useCallback(
    (kind: DshVersionTaskKind) =>
      kind === 'uninstall'
        ? t.dshCancelUninstall
        : kind === 'reinstall'
          ? t.dshCancelReinstall
          : t.dshCancelInstall,
    [t],
  );

  // 官方列表行布局：版本选择下拉框固定最左，其它动态按钮固定同行最右。
  // 可见性规则：已装→卸载+重装；未装→安装；已装非当前→加切换；当前→无安装/切换。
  // 安装按钮不带版本号（下拉框按钮已展示版本号 + 已装徽章）。
  // 下拉框固定为分区最长选项宽度（实测），打开的菜单同宽。
  const renderVersionRowAction = (v: string, section: 'stable' | 'prerelease', time: string) => {
    const isCurrent = v === currentSelected;
    const isInstalled = installed.includes(v);
    const fixedWidth = section === 'prerelease' ? menuWidths.prerelease : menuWidths.stable;
    return (
      <>
        <button
          type="button"
          className="adl-dsh-settings__version-picker"
          style={fixedWidth != null ? { width: fixedWidth } : undefined}
          onClick={(e) => handleOpenPicker(section, e.currentTarget)}
          disabled={versionBusy}
          aria-expanded={showVersionMenu && menuSection === section}
          aria-label={v}
        >
          <span className="adl-dsh-settings__version-picker-label">
            <span className="adl-dsh-settings__version-picker-version">{v}</span>
            {isInstalled ? (
              <span className="adl-dsh-settings__version-menu-item-installed">
                {t.dshInstalledVersions}
              </span>
            ) : null}
            {isCurrent ? (
              <span className="adl-dsh-settings__version-menu-item-check">
                <CheckIcon />
              </span>
            ) : null}
          </span>
          <span className="adl-dsh-settings__version-picker-chevron">
            <ChevronDownIcon />
          </span>
        </button>
        {time ? <span className="adl-dsh-settings__version-list-item-time">{time}</span> : null}
        {versionTask?.version === v ? (
          <div className="adl-dsh-settings__version-task">
            <div
              className={`adl-dsh-settings__progress${
                versionTask.percent == null ? ' is-indeterminate' : ''
              }`}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={versionTask.percent ?? undefined}
            >
              <div className="adl-dsh-settings__progress-bar">
                <div
                  className="adl-dsh-settings__progress-fill"
                  style={
                    versionTask.percent == null ? undefined : { width: `${versionTask.percent}%` }
                  }
                />
              </div>
            </div>
            {versionTask.cancellable ? (
              <button
                type="button"
                className="adl-dsh-settings__action-btn"
                onClick={() => void handleCancelTask()}
              >
                {taskCancelLabel(versionTask.kind)}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="adl-dsh-settings__version-list-actions">
            {isInstalled ? (
              <button
                type="button"
                className={`adl-dsh-settings__action-btn${
                  isCurrent && uninstallConfirm ? ' adl-dsh-settings__action-btn--danger' : ''
                }`}
                onClick={() => void handleUninstallRow(v)}
                disabled={versionBusy}
                aria-label={uninstallingVersion === v ? t.dshUninstall : undefined}
              >
                {uninstallingVersion === v ? <Spinner size="sm" speed="normal" /> : t.dshUninstall}
              </button>
            ) : null}
            {isInstalled ? (
              <button
                type="button"
                className="adl-dsh-settings__action-btn"
                onClick={() => void handleReinstallRow(v)}
                disabled={versionBusy}
                aria-label={reinstalling ? t.dshReinstall : undefined}
              >
                {reinstalling ? <Spinner size="sm" speed="normal" /> : t.dshReinstall}
              </button>
            ) : null}
            {!isInstalled ? (
              <button
                type="button"
                className="adl-dsh-settings__action-btn"
                onClick={() => void handleInstallVersion(v)}
                disabled={versionBusy}
                aria-label={installingVersion === v ? t.dshInstallAction : undefined}
              >
                {installingVersion === v ? (
                  <Spinner size="sm" speed="normal" />
                ) : (
                  t.dshInstallAction
                )}
              </button>
            ) : null}
            {isInstalled && !isCurrent ? (
              <button
                type="button"
                className="adl-dsh-settings__action-btn"
                onClick={() => void handleRevertToVersion(v)}
                disabled={versionBusy}
                aria-label={revertingVersion === v ? t.dshSwitchToVersion : undefined}
              >
                {revertingVersion === v ? (
                  <Spinner size="sm" speed="normal" />
                ) : (
                  t.dshSwitchToVersion
                )}
              </button>
            ) : null}
          </div>
        )}
      </>
    );
  };

  // 官方列表只展示下拉框选中的版本（默认跟随当前选中/分区最新）；
  // 全部版本在下拉框菜单卡片中选择。
  // 空态区分“暂无”与“未知”：目录拉取失败（或后端 catalog 不可用）时展示未知，
  // 不得误导为“官方暂无”。注意：后端 prerelease_unknown 为 true 时 catalog
  // 必然拉取失败，前端以 versionCatalogFailed 为准即可覆盖两通道。
  const renderVersionList = (
    infos: { version: string; publishedAt: string | null }[],
    section: 'stable' | 'prerelease',
    emptyText: string,
  ) => {
    const effective = section === 'prerelease' ? prereleaseEffective : stableEffective;
    const hit = effective ? infos.find((i) => i.version === effective) : undefined;
    if (!effective || !hit) {
      if (versionCatalogFailed || versionStatus?.prereleaseUnknown === true) {
        return (
          <span className="adl-dsh-settings__version-value is-empty">
            {t.dshVersionListUnknown}
          </span>
        );
      }
      return <span className="adl-dsh-settings__version-value is-empty">{emptyText}</span>;
    }
    const v = hit.version;
    const time = formatPublishedAt(hit.publishedAt);
    const isCurrent = v === currentSelected;
    return (
      <div className="adl-dsh-settings__version-list">
        <div
          key={v}
          className={`adl-dsh-settings__version-list-item${
            isCurrent ? ' adl-dsh-settings__version-list-item--current' : ''
          }`}
        >
          {renderVersionRowAction(v, section, time)}
        </div>
      </div>
    );
  };

  // 当前版本读数（事项 1）：任何 effective 都优先显示真实版本号，大字为主。
  // running 只认后端登记的 spawn 来源版本（`running.version`，宿主拉起时精确已知，
  // 切源重启后即新来源版本）；外部复用（`managed=false`）一律未知，不猜宿主版本
  // （事项 4 文案承诺一致）。system 用后端 `dsh --version` 现查版。
  // 徽章（发现新版本/已是最新）只在主行版本号确为宿主当前选中时才挂，避免
  // system 版与宿主选中不一致时误导。
  const runningReadout = useCallback(
    (running: { url: string; version: string | null } | null | undefined) => {
      const url = running?.url ?? '';
      const known = running?.version ?? null;
      if (known) {
        return {
          text: known,
          sub: t.dshEffectiveRunning.replace('{url}', url),
          empty: false,
        };
      }
      return {
        text: t.dshEffectiveRunning.replace('{url}', url),
        sub: t.dshVersionUnknown,
        empty: true,
      };
    },
    [t],
  );
  const systemReadout = useCallback(
    (path: string, version: string | null) => {
      if (version) {
        return {
          text: version,
          sub: t.dshEffectiveSystem.replace('{path}', path),
          empty: false,
        };
      }
      return {
        text: t.dshEffectiveSystem.replace('{path}', path),
        sub: t.dshVersionUnknown,
        empty: true,
      };
    },
    [t],
  );
  const readout = useMemo(() => {
    if (versionSource) {
      switch (versionSource.effective) {
        case 'host':
          return {
            text: versionSource.hostVersion ?? currentSelected ?? '',
            sub: null as string | null,
            empty: false,
          };
        case 'running':
          return { ...runningReadout(dshSourceStatus?.running) };
        case 'system':
          return {
            ...systemReadout(
              dshSourceStatus?.system?.path ?? '',
              dshSourceStatus?.system?.version ?? null,
            ),
          };
        case 'bundled':
          return {
            text: t.dshEffectiveBundled.replace(
              '{version}',
              dshSourceStatus?.bundled?.version ?? '',
            ),
            sub: null as string | null,
            empty: true,
          };
        default:
          return { text: t.dshCurrentVersionNone, sub: null as string | null, empty: true };
      }
    }
    if (currentSelected) {
      return { text: currentSelected, sub: null as string | null, empty: false };
    }
    if (dshSourceStatus?.running) {
      return { ...runningReadout(dshSourceStatus.running) };
    }
    if (dshSourceStatus?.system) {
      return {
        ...systemReadout(dshSourceStatus.system.path, dshSourceStatus.system.version ?? null),
      };
    }
    if (dshSourceStatus?.bundled) {
      return {
        text: t.dshEffectiveBundled.replace('{version}', dshSourceStatus.bundled.version),
        sub: null as string | null,
        empty: true,
      };
    }
    return { text: t.dshCurrentVersionNone, sub: null as string | null, empty: true };
  }, [versionSource, currentSelected, dshSourceStatus, t, runningReadout, systemReadout]);
  // 主行版本号确为宿主当前选中才挂更新徽章（事项 1：system/外部 running 版本与宿主
  // 选中不一致时挂徽章会误导，故收紧）。
  const showVersionBadges =
    !readout.empty &&
    (versionSource?.effective === 'host' ||
      versionSource == null ||
      readout.text === currentSelected);

  useEffect(() => {
    // 事项 5 埋点：用户实测后凭此前缀核对当前版本读数（effective/主行/小字/空态）。
    debugVer('render: effective version', {
      effective: versionSource?.effective ?? null,
      mode: versionSource?.mode ?? null,
      hostVersion: versionSource?.hostVersion ?? null,
      currentSelected,
      readoutText: readout.text,
      readoutSub: readout.sub,
      readoutEmpty: readout.empty,
      running: dshSourceStatus?.running?.url ?? null,
      runningManaged: dshSourceStatus?.running?.managed ?? null,
      runningVersion: dshSourceStatus?.running?.version ?? null,
      system: dshSourceStatus?.system?.path ?? null,
      systemVersion: dshSourceStatus?.system?.version ?? null,
      bundled: dshSourceStatus?.bundled?.version ?? null,
    });
  }, [versionSource, currentSelected, readout, dshSourceStatus]);

  return (
    <div className="adl-settings-card">
      {/* 行0：版本来源（自动检测 / 系统安装 / 宿主安装）。 */}
      <div className="adl-settings-row" data-settings-row={t.dshVersionSource}>
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <SettingsHintButton content={t.dshVersionSourceHint} />
            <span>{t.dshVersionSource}</span>
          </div>
          <small>{t.dshVersionSourceDesc}</small>
          {systemManaged ? (
            <small className="adl-dsh-settings__row-warn">{t.dshSystemManagedNote}</small>
          ) : null}
          {deferredSource ? (
            <small className="adl-dsh-settings__row-warn">{t.dshVersionSourceDeferredNote}</small>
          ) : null}
          {!systemManaged && versionSource?.effective === 'none' ? (
            <small className="adl-dsh-settings__row-warn">{t.dshNoSourceNote}</small>
          ) : null}
        </div>
        <div className="adl-settings-row__control">
          <SettingsSelect
            value={sourceMode}
            options={sourceOptions}
            onChange={handleSourceChange}
            label={t.dshVersionSource}
            disabled={versionBusy || sourceDialogBusy}
          />
        </div>
      </div>

      {/* 行1：当前版本（副标题 + 提示图标；右侧版本号 + 状态徽标 + 最新可用版本）。 */}
      <div className="adl-settings-row" data-settings-row={t.dshCurrentVersionLabel}>
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <SettingsHintButton content={t.dshCurrentVersionHint} />
            <span>{t.dshCurrentVersionLabel}</span>
          </div>
          <small>{t.dshCurrentVersionDesc}</small>
          {uninstallConfirm && isCurrentSelected ? (
            <small className="adl-dsh-settings__row-warn">{t.dshUninstallCurrentHint}</small>
          ) : null}
          {!systemManaged && hasPrereleaseUpdate && prereleaseAvailable ? (
            <small className="adl-dsh-settings__row-warn">
              {t.dshPrereleaseUpdateAvailable.replace('{version}', prereleaseAvailable)}
            </small>
          ) : null}
        </div>
        <div className="adl-settings-row__control">
          <div className="adl-dsh-settings__version-readout">
            {readout.empty ? (
              <span className="adl-dsh-settings__version-value is-empty">{readout.text}</span>
            ) : (
              <span className="adl-dsh-settings__version-value">
                {readout.text}
                {showVersionBadges ? (
                  hasUpdate ? (
                    <span className="adl-dsh-settings__badge adl-dsh-settings__badge--update">
                      {t.dshHasUpdate}
                    </span>
                  ) : latestAvailable ? (
                    <span className="adl-dsh-settings__badge">{t.dshNoUpdate}</span>
                  ) : null
                ) : null}
              </span>
            )}
            {readout.sub ? (
              <small className="adl-dsh-settings__version-latest">{readout.sub}</small>
            ) : null}
            {latestAvailable && !systemManaged ? (
              <small className="adl-dsh-settings__version-latest">
                {t.dshLatest.replace('{version}', latestAvailable)}
              </small>
            ) : null}
          </div>
        </div>
      </div>

      {/* 行2：检查更新（仅检查；安装/切换/卸载/重装在下方正式版/预发布行内按行操作）。 */}
      {!systemManaged ? (
        <div className="adl-settings-row" data-settings-row={t.dshCheckUpdate}>
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <SettingsHintButton content={t.dshCheckUpdateHint} />
              <span>{t.dshCheckUpdate}</span>
            </div>
            <small>{t.dshCheckUpdateDesc}</small>
          </div>
          <div className="adl-settings-row__control adl-dsh-settings__version-actions">
            <button
              type="button"
              className="adl-dsh-settings__action-btn"
              onClick={handleCheckUpdate}
              disabled={versionBusy}
              aria-label={checkingUpdate ? t.dshCheckUpdate : undefined}
            >
              {checkingUpdate ? <Spinner size="sm" speed="normal" /> : t.dshCheckUpdate}
            </button>
          </div>
        </div>
      ) : null}

      {/* 宽度测量尺（隐藏）：取分区最长选项实测宽度，下拉框与菜单卡片同宽，
          保证菜单内“版本号 + 徽章”全部单行。结构与真实菜单项一致
          （版本 + 时间在内层按钮容器，徽章 + 勾选在右侧徽章区），同类名保证
          字体/间距一致；外加收缩类避免块级拉伸（根因见 CSS 注释）。 */}
      <div aria-hidden="true" className="adl-dsh-settings__version-sizer">
        {longestStableVersion ? (
          <div
            ref={stableSizerRef}
            className="adl-dsh-settings__version-menu-item adl-dsh-settings__version-sizer-item"
          >
            <span className="adl-dsh-settings__version-menu-item-revert">
              <span className="adl-dsh-settings__version-menu-item-version">
                {longestStableVersion}
              </span>
              <span className="adl-dsh-settings__version-menu-item-time">0000-00-00 00:00</span>
            </span>
            <span className="adl-dsh-settings__version-menu-item-badges">
              <span className="adl-dsh-settings__version-menu-item-installed">
                {t.dshInstalledVersions}
              </span>
              <span className="adl-dsh-settings__version-menu-item-check">
                <CheckIcon />
              </span>
            </span>
          </div>
        ) : null}
        {longestPrereleaseVersion ? (
          <div
            ref={prereleaseSizerRef}
            className="adl-dsh-settings__version-menu-item adl-dsh-settings__version-sizer-item"
          >
            <span className="adl-dsh-settings__version-menu-item-revert">
              <span className="adl-dsh-settings__version-menu-item-version">
                {longestPrereleaseVersion}
              </span>
              <span className="adl-dsh-settings__version-menu-item-time">0000-00-00 00:00</span>
            </span>
            <span className="adl-dsh-settings__version-menu-item-badges">
              <span className="adl-dsh-settings__version-menu-item-installed">
                {t.dshInstalledVersions}
              </span>
              <span className="adl-dsh-settings__version-menu-item-check">
                <CheckIcon />
              </span>
            </span>
          </div>
        ) : null}
      </div>

      {/* 版本选择下拉菜单（Portal）：由正式版/预发布行内下拉框触发，
          列出所属分区全部版本；点击即选中该版本（实际安装/切换走行内按钮）。
          卸载图标已移除（行内已有卸载文字按钮，避免重复）。
          滚动条复用项目 RevealScrollbar（overlay 悬停显现式，原生条隐藏，
          与 SettingsSelect 下拉菜单同源；悬停灰底可与滚动条重叠）。 */}
      {showVersionMenu && menuGeometry && menuSection
        ? createPortal(
            <div
              ref={versionMenuPanelRef}
              className="adl-dsh-settings__version-menu"
              style={{
                top: menuGeometry.top,
                bottom: menuGeometry.bottom,
                left: menuGeometry.left,
                width: menuGeometry.width,
                maxHeight: menuGeometry.maxHeight,
              }}
              {...menuScrollbar.hoverProps}
            >
              <div
                className="adl-dsh-settings__version-menu-list adl-reveal-scroll"
                ref={menuScrollbar.scrollRef as unknown as React.Ref<HTMLDivElement>}
                style={
                  menuGeometry.maxHeight != null
                    ? { maxHeight: Math.max(0, menuGeometry.maxHeight - 8) }
                    : undefined
                }
              >
                {menuVersions.map((info) => {
                  const v = info.version;
                  const isInstalled = installed.includes(v);
                  const isPicked = v === menuEffective;
                  const time = formatPublishedAt(info.publishedAt);
                  return (
                    <div
                      key={v}
                      className={`adl-dsh-settings__version-menu-item${
                        isPicked ? ' adl-dsh-settings__version-menu-item--current' : ''
                      }`}
                    >
                      <button
                        type="button"
                        className="adl-dsh-settings__version-menu-item-revert"
                        aria-current={isPicked ? 'true' : undefined}
                        onClick={() => handlePickVersion(menuSection, v)}
                        disabled={versionBusy}
                      >
                        <span className="adl-dsh-settings__version-menu-item-version">{v}</span>
                        {time ? (
                          <span className="adl-dsh-settings__version-menu-item-time">{time}</span>
                        ) : null}
                      </button>
                      <div className="adl-dsh-settings__version-menu-item-badges">
                        {isInstalled ? (
                          <span className="adl-dsh-settings__version-menu-item-installed">
                            {t.dshInstalledVersions}
                          </span>
                        ) : null}
                        {isPicked ? (
                          <span className="adl-dsh-settings__version-menu-item-check">
                            <CheckIcon />
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              <RevealScrollbar
                controller={
                  menuScrollbar.scrollable ? { ...menuScrollbar, visible: true } : menuScrollbar
                }
              />
            </div>,
            document.body,
          )
        : null}

      {!systemManaged ? (
        <>
          {/* 行3：正式版本（单版本展示 + 行内操作；全部版本在下拉框菜单中选择）。 */}
          <div
            className={`adl-settings-row${stableVersions.length > 0 ? ' adl-dsh-settings__row--stack' : ''}`}
            data-settings-row={t.dshOfficialStable}
          >
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <SettingsHintButton content={t.dshOfficialStableHint} />
                <span>{t.dshOfficialStable}</span>
              </div>
              <small>{t.dshOfficialStableDesc}</small>
            </div>
            <div className="adl-settings-row__control">
              {renderVersionList(stableVersions, 'stable', t.dshOfficialStableEmpty)}
            </div>
          </div>

          {/* 行4：预发布版本（尝鲜通道分区 + 特殊说明；单版本展示 + 行内操作）。 */}
          <div
            className={`adl-settings-row${prereleaseVersions.length > 0 ? ' adl-dsh-settings__row--stack' : ''}`}
            data-settings-row={t.dshPrereleaseTitle}
          >
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <SettingsHintButton content={t.dshPrereleaseHint} />
                <span>{t.dshPrereleaseTitle}</span>
              </div>
              <small>{t.dshPrereleaseDesc}</small>
            </div>
            <div className="adl-settings-row__control">
              {renderVersionList(prereleaseVersions, 'prerelease', t.dshOfficialPrereleaseEmpty)}
            </div>
          </div>
        </>
      ) : null}

      {/* 行5：官方版本信息（说明文字内嵌与标题同色的链接，跟随「打开方式」网址落点跳转）。 */}
      <div className="adl-settings-row" data-settings-row={t.dshOfficialLinksLabel}>
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{t.dshOfficialLinksLabel}</span>
          </div>
          <small>
            {t.dshOfficialLinksDesc}{' '}
            <button
              type="button"
              className="adl-dsh-settings__inline-link"
              onClick={() => handleOpenOfficial(NPM_PACKAGE_URL)}
            >
              {t.dshNpmPage}
            </button>{' '}
            <button
              type="button"
              className="adl-dsh-settings__inline-link"
              onClick={() => handleOpenOfficial(GITHUB_RELEASES_URL)}
            >
              {t.dshGithubReleases}
            </button>
          </small>
        </div>
      </div>

      {sourceDialogOpen
        ? createPortal(
            <div
              className="adl-confirm-overlay"
              role="dialog"
              aria-modal="true"
              aria-label={
                pendingMode === 'system' || pendingMode == null
                  ? t.dshVersionSourceSystemDialogTitle
                  : t.dshVersionSourceSwitchDialogTitle
              }
              onClick={
                sourceDialogBusy
                  ? undefined
                  : () => {
                      setSourceDialogOpen(false);
                      setPendingMode(null);
                    }
              }
            >
              <div className="adl-confirm-dialog" onClick={(event) => event.stopPropagation()}>
                <div className="adl-confirm-dialog__header">
                  <h3 className="adl-confirm-dialog__title">
                    {pendingMode === 'system' || pendingMode == null
                      ? t.dshVersionSourceSystemDialogTitle
                      : t.dshVersionSourceSwitchDialogTitle}
                  </h3>
                </div>
                <div className="adl-confirm-dialog__body">
                  <p className="adl-confirm-dialog__message adl-dsh-source-dialog__message">
                    {pendingMode === 'system' || pendingMode == null
                      ? t.dshVersionSourceSystemDialogMessage.replace(
                          '{path}',
                          dshSourceStatus?.system?.path ?? '',
                        )
                      : t.dshVersionSourceSwitchDialogMessage.replace(
                          '{target}',
                          pendingMode === 'host' ? t.dshVersionSourceHost : t.dshVersionSourceAuto,
                        )}
                  </p>
                </div>
                <div className="adl-confirm-dialog__footer">
                  <button
                    ref={sourceDialogCancelRef}
                    type="button"
                    className="adl-btn adl-btn--secondary"
                    disabled={sourceDialogBusy}
                    onClick={() => void handleSystemDialogChoice('cancel')}
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    className="adl-btn adl-btn--secondary"
                    disabled={sourceDialogBusy}
                    onClick={() => void handleSystemDialogChoice('next')}
                  >
                    {t.dshVersionSourceApplyNextLaunch}
                  </button>
                  <button
                    type="button"
                    className="adl-btn adl-btn--secondary"
                    disabled={sourceDialogBusy}
                    onClick={() => void handleSystemDialogChoice('now')}
                    aria-label={sourceDialogBusy ? t.dshVersionSourceApplyNow : undefined}
                  >
                    {sourceDialogBusy ? (
                      <Spinner size="sm" speed="normal" />
                    ) : (
                      t.dshVersionSourceApplyNow
                    )}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
