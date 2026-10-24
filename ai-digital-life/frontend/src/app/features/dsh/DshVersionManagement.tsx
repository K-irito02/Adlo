import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import { sameServiceOrigin } from '@stores/actions/dshActions';
import { Spinner } from '@components/Spinner';
import { SettingsHintButton } from '@components/settings/SettingsHintButton';
import { SettingsSelect } from '@components/settings/SettingsSelect';
import { RevealScrollbar } from '@components/RevealScrollbar';
import { useRevealScrollbar } from '@hooks/useRevealScrollbar';
import { openUrlByMethod } from '@features/preview/openByMethod';
import type {
  DshRunningInfo,
  DshVersionInfo,
  DshVersionSourceMode,
  DshVersionTask,
  DshVersionTaskKind,
} from '../../../shared/ipc/dsh';

/** 空列表单例：避免 `?? []` 每渲染新建数组导致下游 useCallback 依赖抖动。 */
const EMPTY_VERSIONS: DshVersionInfo[] = [];
/** 空 installed 单例（string 版，同理稳定 effect 依赖身份）。 */
const EMPTY_INSTALLED: string[] = [];

/** 官方信息外链（事项 5）：npm 包页 + GitHub Releases，经 openExternal 双端跳转。 */
const NPM_PACKAGE_URL = 'https://www.npmjs.com/package/@deepseek-ai/dsh';
const GITHUB_RELEASES_URL = 'https://github.com/deepseek-ai/deepseek-harness/releases';

/** 版本四操作成功 toast 展示时长（默认 3000ms 用户实测中曾错过，见事项 1 注记）。 */
const VERSION_TOAST_MS = 5000;

/**
 * 卸载到空后关闭残留 dsh 标签：宿主无可用版本且进程已停时，WebView 仍冻结显示
 * 旧页面（用户实测 2026-10-21）。按卸载前运行中 URL 的 origin 同源关闭（含中心
 * 承载标签）；此前无运行中 URL 则无法安全识别，不关（边界如实记录）。
 */
function closeDshTabsByUrl(url: string | null): number {
  if (!url) {
    return 0;
  }
  const st = useAppStore.getState();
  const doomed = st.browserTabs.filter((tab) => sameServiceOrigin(tab.url, url));
  if (doomed.length === 0) {
    return 0;
  }
  const ids = new Set(doomed.map((t) => t.id));
  for (const t of doomed) {
    st.browserCloseTab(t.id);
  }
  for (const ct of st.centerTabs) {
    if (ct.kind === 'browser' && ct.refId && ids.has(ct.refId)) {
      st.centerRemoveTab(ct.id);
    }
  }
  return doomed.length;
}

/** `publishedAt`（RFC3339）取 `YYYY-MM-DD HH:mm` 展示；缺失/非法回退原文/空。 */
function formatPublishedAt(publishedAt: string | null): string {
  if (!publishedAt) {
    return '';
  }
  const m = publishedAt.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : publishedAt;
}

/** 运行地址的展示端点（host:port）：读数副行只放端点，完整地址放 title。 */
function displayEndpoint(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** 完整地址去凭据：剥离 query（dsh 入口可能带一次性 token）。 */
function displayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split('?')[0];
  }
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
 * 「当前版本」行右侧为版本读数（版本号 + 来源徽标 + 最新可用版本 + 预发布提示），
 * 「检查更新」行右侧为单个检查按钮，
 * 「正式版本」/「预发布版本」行右侧为单版本行（发布时间 + 按状态显示的
 * 卸载/重装/安装/切换按钮 + 版本选择下拉框；下拉框菜单列出本分区全部版本），
 * 「官方版本信息」行在说明文字内嵌外链（正文色、非蓝色——用户 2026-10-19 要求取消链接特殊色；
 * 点击跟随「打开方式」网址落点跳转）。
 * 两行副标题左侧带行内「?」提示图标（`SettingsHintButton`）。
 *
 * 内置版本（用户 2026-10-22）：安装包投放的 `dsh-bundle/` 在服务启动时被收编成
 * `installed/<version>/` 下的一条**普通已装版本**，之后与其它版本行为完全一致
 * （可切换/重装/卸载，无任何特例）；`bundledVersion` 只是「它当初由安装包预置」的
 * 来源记录，用于在菜单标「已内置」、当前版本号旁标「内置」，与同版本号的系统安装
 * 区分。该版本被卸载或重装覆盖后记录即失效，徽章随之消失。
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

  // 卸载二次确认的目标版本（null = 未武装）：只有「当前选中版本」需要点两次
  //（内置预置版本也是普通版本，按同样规则处理，没有专属确认）。
  const [uninstallConfirmVersion, setUninstallConfirmVersion] = useState<string | null>(null);
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
  // 下拉框 replica 测量尺（用户实测 2026-10-21：勾选与箭头重叠——旧尺只量纵向
  // 菜单项，未计量横向下拦框自身的箭头/padding/gap 口径，取两者最大才不溢出）。
  const stablePickerSizerRef = useRef<HTMLDivElement>(null);
  const prereleasePickerSizerRef = useRef<HTMLDivElement>(null);

  const currentSelected = versionStatus?.currentSelected ?? null;
  // 内置预置版本号：它已经是 installed 里的一条普通版本，这里只是「当初由安装包
  // 预置」的来源记录（bundledVersion ≠ null ⟹ 必然在 installed 里），仅用于徽章标注。
  const bundledVersion = versionStatus?.bundledVersion ?? null;
  const latestAvailable = versionStatus?.latestAvailable ?? null;
  const hasUpdate = versionStatus?.hasUpdate ?? false;
  const prereleaseAvailable = versionStatus?.prereleaseAvailable ?? null;
  const hasPrereleaseUpdate = versionStatus?.hasPrereleaseUpdate ?? false;
  // installed 身份稳定：store 数组引用不变时复用，null 时复用单例（下游 effect 依赖不抖）。
  const installed = useMemo(
    () => versionStatus?.installed ?? EMPTY_INSTALLED,
    [versionStatus?.installed],
  );
  const versionSource = dshSourceStatus?.versionSource ?? null;
  // 任一版本操作在途时禁用全部操作按钮，避免并发卸载/回退/升级/安装（防重入仅拦同种操作）。
  const versionBusy =
    checkingUpdate ||
    reinstalling ||
    revertingVersion !== null ||
    installingVersion !== null ||
    uninstallingVersion !== null;
  const sourceMode: DshVersionSourceMode =
    versionSource?.mode ?? dshSourceStatus?.config.version_source ?? 'auto';
  // 显隐条件（或语义，任一成立即隐藏；defer 期间切换尚未生效，保持显示 + 提示行）：
  // ① mode=system：用户配了系统来源，running 恒优先会使 system 进程在跑时
  // effective=running，只看 effective 就永远藏不住（用户实测 2026-10-20）；
  // ② 偏好解析来源=system：自动检测在宿主无可用版本时落到系统安装，同样隐藏。
  // 显隐/切源判定只消费后端 `resolvedByMode`（忽略 running 的偏好解析）：
  // running 既可能是应用自启，也可能是用户外部手动拉起，都不应遮蔽来源偏好
  //（用户实测 2026-10-22：auto + 系统安装，重启预拉起后管理项错误显现）。
  const modeIsSystem = sourceMode === 'system';
  const resolvedByMode = versionSource?.resolvedByMode ?? null;
  const resolvedSource = resolvedByMode?.[sourceMode] ?? null;
  // source-status 返回前（首帧）不渲染管理项，避免按「未知」先显示再隐藏的闪烁。
  const sourceReady = resolvedByMode !== null;
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [sourceDialogBusy, setSourceDialogBusy] = useState(false);
  // 对话框目标：切向 system 走系统文案，离开 system（→host/auto）走通用切换文案。
  const [pendingMode, setPendingMode] = useState<DshVersionSourceMode | null>(null);
  // 目标来源在忽略 running 下解析为空：对话框需追加「切换后无版本可用」的后果说明。
  // 打开时冻结，避免切源流程中 resolvedByMode 变化导致文案中途翻转（S4）。
  const [pendingTargetEmpty, setPendingTargetEmpty] = useState(false);
  // 打开对话框时的当前来源解析为空（如空宿主）：改用「从无版本恢复为可用来源」文案。
  // 打开时冻结，避免「立即生效」落盘后 sourceMode 翻转而文案跳变。
  const [pendingFromEmpty, setPendingFromEmpty] = useState(false);
  const pendingTargetLabel =
    pendingMode === 'system'
      ? t.dshVersionSourceSystem
      : pendingMode === 'host'
        ? t.dshVersionSourceHost
        : t.dshVersionSourceAuto;
  const deferredSource = useAppStore((s) => s.dshVersionSourceDeferred);
  const setDeferredSource = useAppStore((s) => s.setDshVersionSourceDeferred);
  const pendingSource = useAppStore((s) => s.dshVersionSourcePending);
  const setPendingSource = useAppStore((s) => s.setDshVersionSourcePending);
  // 显隐：配置为系统（mode）或偏好解析落在系统（resolvedByMode）或待切换为系统
  //（pending）任一成立即隐藏。defer 期间选择器仍显示当前生效来源，另有提示行说明。
  const pendingIsSystem = pendingSource === 'system';
  const systemManaged = modeIsSystem || resolvedSource === 'system' || pendingIsSystem;
  const manageVisible = sourceReady && !systemManaged;
  const autoSwitchedRef = useRef(false);
  const sourceDialogCancelRef = useRef<HTMLButtonElement | null>(null);

  /**
   * 显示快照冻结（用户实测 2026-10-21：revert/install 成功后立即 refresh，
   * selected 先翻但 restart 真实切换要十几秒；UI 按实时值派生会导致按钮早变、
   * spinner 随旧按钮消失、读数闪烁。冻结期间展示沿用操作前快照，结束后一次
   * 翻转；操作逻辑仍读实时值，不受影响。来源切换对话框在途时同样冻结
   *（用户 2026-10-22：切换完成前显示不应先翻），行内按钮一并禁用防并发。
   */
  const displayFrozen = versionBusy || sourceDialogBusy;
  const committedRef = useRef({
    currentSelected,
    installed,
    bundledVersion,
    versionSource,
    sourceStatus: dshSourceStatus,
  });
  useEffect(() => {
    if (!displayFrozen) {
      committedRef.current = {
        currentSelected,
        installed,
        bundledVersion,
        versionSource,
        sourceStatus: dshSourceStatus,
      };
    }
  }, [displayFrozen, currentSelected, installed, bundledVersion, versionSource, dshSourceStatus]);
  const snap = displayFrozen
    ? committedRef.current
    : { currentSelected, installed, bundledVersion, versionSource, sourceStatus: dshSourceStatus };
  const snapCurrent = snap.currentSelected;
  const snapInstalled = snap.installed;
  const snapBundled = snap.bundledVersion;
  /**
   * 后端真实切换在途版本（用户实测 2026-10-21：读数行在 restart 完成前显示
   * 旧值造成“延迟感”；同版本重装同样覆盖——版本号不变但同样在途）。
   * 非 null 时读数行版本号位置显示中性骨架波浪动画，而非旧版本号。
   */
  const applyingVersion =
    revertingVersion ??
    installingVersion ??
    (reinstalling ? currentSelected : null) ??
    uninstallingVersion;

  // 各分区下拉框选中的版本（null = 自动跟随：当前选中在该分区则显示它，否则显示该分区最新）。
  const [stablePick, setStablePick] = useState<string | null>(null);
  const [prereleasePick, setPrereleasePick] = useState<string | null>(null);
  // 安装/切换完成后当前版本变化，回到跟随，避免停留在旧选择上。
  useEffect(() => {
    setStablePick(null);
    setPrereleasePick(null);
  }, [currentSelected]);

  const pickEffective = useCallback(
    (infos: { version: string }[], pick: string | null, followed: string | null): string | null => {
      if (pick && infos.some((i) => i.version === pick)) {
        return pick;
      }
      if (followed && infos.some((i) => i.version === followed)) {
        return followed;
      }
      return infos[0]?.version ?? null;
    },
    [],
  );
  const stableEffective = pickEffective(stableVersions, stablePick, snapCurrent);
  const prereleaseEffective = pickEffective(prereleaseVersions, prereleasePick, snapCurrent);

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

  /**
   * 「该版本正被使用」= 当前选中版本。内置预置版本已是普通已装版本，没有额外情形；
   * 供行内「当前」勾选、卸载二次确认与卸载后重启判定共用。
   */
  const isVersionInUse = useCallback((version: string) => version === snapCurrent, [snapCurrent]);

  // 当前分区菜单的版本列表（随下拉框所属分区切换）。
  const menuVersions = menuSection === 'prerelease' ? prereleaseVersions : stableVersions;
  const menuEffective = menuSection === 'prerelease' ? prereleaseEffective : stableEffective;

  // 分区最长选项实测宽度（事项 7/8 + 用户实测 2026-10-21）：下拉框与菜单卡片同宽，
  // 取“菜单项 replica”与“下拉框 replica（含箭头）”两者最大——旧口径只量纵向菜单项，
  // 横向下拉框内容更宽时固定宽度不足，勾选会压住箭头。菜单内“版本号 + 徽章”恒单行。
  // 关键：被测量的 sizer 项必须用 inline-flex 收缩包裹内容——块级 flex 盒会自动
  // 拉伸到容器（卡片内容区）宽度，量到的就是卡片宽度而非内容宽度（事项 8 根因，
  // 见 `.adl-dsh-settings__version-sizer-item`）。
  // 徽章文案随语言变化，故依赖徽章文案重测。来源徽章二者互斥且「已装版本」
  // 恒为更宽的那个，测量尺按它 + 勾号的最宽情形量一次即可。
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
      stable: maxWidth(measure(stableSizerRef), measure(stablePickerSizerRef)),
      prerelease: maxWidth(measure(prereleaseSizerRef), measure(prereleasePickerSizerRef)),
    };
    // 相等时复用旧引用，避免无意义重渲染连带挂载拉取重复触发。
    setMenuWidths((prev) =>
      prev.stable === next.stable && prev.prerelease === next.prerelease ? prev : next,
    );
  }, [stableVersions, prereleaseVersions, installedBadgeText]);

  const menuScrollbar = useRevealScrollbar([
    showVersionMenu,
    menuVersions.length,
    menuGeometry !== null,
  ]);

  // 选中版本或内置包变化（切换/回退/卸载完成）时清除卸载确认态，避免残留的
  // danger 样式指向新的目标版本。
  useEffect(() => {
    setUninstallConfirmVersion(null);
  }, [currentSelected, bundledVersion]);

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
    void (async () => {
      const ok = await actions.saveSourceConfig({ version_source: 'host' }, true);
      if (ok) {
        // 直接落盘即“本次生效”，清掉可能残留的下次启动 pending。
        setPendingSource(null);
        setDeferredSource(false);
      }
    })();
  }, [
    versionSource,
    versionStatus,
    installed.length,
    actions,
    setPendingSource,
    setDeferredSource,
  ]);

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
    // 触发器被卸载/重建（行按版本 key 重渲染）后 rect 全 0，菜单会贴到左上角：
    // 直接收起，比画在一个不存在的位置更合理。
    if (!anchor.isConnected) {
      setShowVersionMenu(false);
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

  /**
   * 操作完成后确保 dsh 在后台运行（用户 2026-10-22 完成态定义：完成态含
   * “后台 dsh 进程已成功启动并正在运行”，运行中才翻转 UI、才弹完成 toast）。
   * - 有运行进程：不动，返回 null（调用方沿用原结果 toast）。
   * - 无运行＋有可用来源：调 restartDsh 拉起（新语义：无实例则按当前来源
   *   直接拉起；其内部 syncDshTab 会把陈旧标签按原位置重建；
   *   无标签时不新建——建标签仍是用户显式 openDsh 的事），返回拉起结果。
   * - 无可用来源：关闭残留标签，返回 null（调用方按原结果 toast，如 uninstall 的无版本提示）。
   * 调用方在 restart 后 `!restarted` 时调用，并以返回值（若有）为准 toast，
   * 保证 toast 反映最终真实状态，而非第一次尝试的中间态。
   */
  const ensureDshRunning = useCallback(
    // fallbackUrl：调用方在操作前记下的运行中 URL（如卸载前的 running.url）；
    // 缺省用本会话最近入口 URL。两者皆无则跳过关闭（边界如实记日志）。
    // 返回拉起结果（含新 URL，供调用方 toast 决策）；无需动作时返回 null。
    async (
      why: string,
      fallbackUrl?: string | null,
    ): Promise<{ restarted: boolean; failed: boolean; url: string | null } | null> => {
      const st = useAppStore.getState();
      if (st.sourceStatus?.running) {
        return null;
      }
      const effective = st.sourceStatus?.versionSource?.effective ?? null;
      if (effective === 'none') {
        closeDshTabsByUrl(fallbackUrl ?? st.dshLastUrl ?? null);
        return null;
      }
      st.setDshRestarting(true);
      try {
        const r = await actions.restartDsh();
        await actions.fetchSourceStatus(true);
        return r;
      } finally {
        useAppStore.getState().setDshRestarting(false);
      }
    },
    [actions],
  );

  const handleCheckUpdate = useCallback(async () => {
    if (checkingRef.current) {
      return;
    }
    checkingRef.current = true;
    setCheckingUpdate(true);
    try {
      const ok = await actions.fetchDshVersionStatus();
      if (!ok) {
        // 失败已由 action 记录全局错误卡片，不再重复弹 toast。
        return;
      }
      const status = useAppStore.getState().versionStatus;
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
      showToast(t.dshCheckUpdateFailed, 'error');
    } finally {
      checkingRef.current = false;
      setCheckingUpdate(false);
    }
  }, [actions, showToast, t]);

  const handleRevertToVersion = useCallback(
    async (version: string, _section: 'stable' | 'prerelease') => {
      if (revertingRef.current || version === currentSelected) {
        return;
      }
      revertingRef.current = version;
      useAppStore.getState().setDshOpBusy(true);
      setRevertingVersion(version);
      setShowVersionMenu(false);
      try {
        const ok = await actions.revertDsh(version);
        if (ok) {
          const restart = await actions.restartDsh();
          await actions.fetchSourceStatus(true);
          let fin = restart;
          if (!fin.restarted) {
            fin = (await ensureDshRunning('revert')) ?? fin;
          }
          if (fin.failed) {
            showToast(t.dshRestartFailed, 'error');
          } else {
            showToast(
              fin.restarted
                ? t.dshSwitchedRestarted.replace('{version}', version)
                : t.dshSwitchedOnly.replace('{version}', version),
              'success',
              undefined,
              VERSION_TOAST_MS,
            );
          }
        }
      } catch {
        // 意外异常兜底；常规失败已由 action 记录全局错误卡片。
        showToast(t.dshRevertFailed, 'error');
      } finally {
        revertingRef.current = null;
        useAppStore.getState().setDshOpBusy(false);
        setRevertingVersion(null);
      }
    },
    [actions, currentSelected, ensureDshRunning, showToast, t],
  );

  /**
   * 执行一次卸载：防重入守卫 + busy 状态 + 请求 + 成功/失败提示 + 清理。
   * 三处卸载入口（版本菜单单项、当前版本、当前版本确认）共用，避免逻辑漂移。
   * 状态快照一律在点击时刻经 `getState()` 现读，避免闭包旧值。
   */
  const runUninstall = useCallback(
    async (version: string, _section: 'stable' | 'prerelease') => {
      if (uninstallingRef.current) {
        return;
      }
      uninstallingRef.current = version;
      useAppStore.getState().setDshOpBusy(true);
      setUninstallingVersion(version);
      // 卸载到空后关标签用：操作前记下运行中 URL（操作后 running 即无，从新状态读不到）。
      const preRunningUrl = useAppStore.getState().sourceStatus?.running?.url ?? null;
      // 被卸载的是当前选中版本 → 必须重启（这是唯一需要重启的情形）。
      const inUse = isVersionInUse(version);
      try {
        const ok = await actions.uninstallDsh(version);
        if (ok) {
          const next = useAppStore.getState().versionStatus?.currentSelected ?? null;
          if (inUse) {
            const restart = await actions.restartDsh();
            await actions.fetchSourceStatus(true);
            // 无可用版本兜底并入 ensure（含 preRunningUrl 回退；幂等只关一次），
            // 并以最终结果 toast（ensure 可能把失败的 restart 又拉起来）。
            let finUninstall = restart;
            if (!finUninstall.restarted) {
              finUninstall = (await ensureDshRunning('uninstall', preRunningUrl)) ?? finUninstall;
            }
            if (finUninstall.failed) {
              showToast(t.dshRestartFailed, 'error');
            } else {
              showToast(
                next
                  ? t.dshUninstalledSwitched.replace('{version}', version).replace('{next}', next)
                  : t.dshUninstalledNoVersion.replace('{version}', version),
                'success',
                undefined,
                VERSION_TOAST_MS,
              );
            }
          } else {
            await actions.fetchSourceStatus(true);
            showToast(
              t.dshUninstallSuccess.replace('{version}', version),
              'success',
              undefined,
              VERSION_TOAST_MS,
            );
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
        useAppStore.getState().setDshOpBusy(false);
        setUninstallingVersion(null);
      }
    },
    [actions, ensureDshRunning, isVersionInUse, showToast, t],
  );

  const handleReinstall = useCallback(async () => {
    if (reinstallingRef.current) {
      return;
    }
    reinstallingRef.current = true;
    useAppStore.getState().setDshOpBusy(true);
    setReinstalling(true);
    try {
      const ok = await actions.reinstallDsh();
      if (ok) {
        const restart = await actions.restartDsh();
        await actions.fetchSourceStatus(true);
        let finReinstall = restart;
        if (!finReinstall.restarted) {
          finReinstall = (await ensureDshRunning('reinstall')) ?? finReinstall;
        }
        if (finReinstall.failed) {
          showToast(t.dshRestartFailed, 'error');
        } else {
          const version = currentSelected ?? '';
          showToast(
            finReinstall.restarted
              ? t.dshReinstalledRestarted.replace('{version}', version)
              : t.dshReinstalledOnly.replace('{version}', version),
            'success',
            undefined,
            VERSION_TOAST_MS,
          );
        }
      } else if (cancelRequestedRef.current) {
        showToast(t.dshVersionCancelled, 'warning');
      }
    } catch {
      // 意外异常兜底；常规失败已由 action 记录全局错误卡片。
      if (cancelRequestedRef.current) {
        showToast(t.dshVersionCancelled, 'warning');
      } else {
        showToast(t.dshReinstallFailed, 'error');
      }
    } finally {
      cancelRequestedRef.current = false;
      void actions.fetchVersionTask();
      reinstallingRef.current = false;
      useAppStore.getState().setDshOpBusy(false);
      setReinstalling(false);
    }
  }, [actions, ensureDshRunning, showToast, t, currentSelected]);

  /**
   * 官方列表行安装：未装版本走 install（后端校验官方确已发布后登记选中），
   * 下次 open 即按该版本启动。预发布同样经此入口（调用前已有分区说明）。
   * select=false 时为“非当前重装”（只修目录、不改选中、不重启）；
   * 与 handleReinstallRow 非当前分支共用同一流程（R2-D1 去重）。
   */
  const handleInstallVersion = useCallback(
    async (version: string, _section: 'stable' | 'prerelease', select = true) => {
      if (installingRef.current) {
        return;
      }
      installingRef.current = version;
      useAppStore.getState().setDshOpBusy(true);
      setInstallingVersion(version);
      try {
        const ok = await actions.installDshVersion(version, select);
        if (ok) {
          if (!select) {
            // 非当前重装：只修该版本目录，保持原选中；运行中版本未动，无需重启。
            showToast(
              t.dshReinstalledOnly.replace('{version}', version),
              'success',
              undefined,
              VERSION_TOAST_MS,
            );
            return;
          }
          const restart = await actions.restartDsh();
          await actions.fetchSourceStatus(true);
          let finInstall = restart;
          if (!finInstall.restarted) {
            finInstall = (await ensureDshRunning('install')) ?? finInstall;
          }
          if (finInstall.failed) {
            showToast(t.dshRestartFailed, 'error');
          } else {
            showToast(
              finInstall.restarted
                ? t.dshInstalledRestarted.replace('{version}', version)
                : t.dshInstallSuccess.replace('{version}', version),
              'success',
              undefined,
              VERSION_TOAST_MS,
            );
          }
        } else if (cancelRequestedRef.current) {
          showToast(t.dshVersionCancelled, 'warning');
        }
      } catch {
        if (cancelRequestedRef.current) {
          showToast(t.dshVersionCancelled, 'warning');
        } else {
          showToast(t.dshInstallFailed, 'error');
        }
      } finally {
        cancelRequestedRef.current = false;
        void actions.fetchVersionTask();
        installingRef.current = null;
        useAppStore.getState().setDshOpBusy(false);
        setInstallingVersion(null);
      }
    },
    [actions, ensureDshRunning, showToast, t],
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
      // 决策前现查一次：挂载时拉取的快照在预拉起完成前 `running` 为 null，
      // 直接存会跳过确认对话框；现查约数百毫秒，误判代价远大于等待
      // （用户实测切源无弹窗即此 stale 快照所致）。
      // fail-open 说明（R1-LOW）：现查失败（后端不可达）时沿用 stale 快照继续决策，
      // 后续落盘/重启失败自有错误 toast，不在此处另弹打断用户。
      await actions.fetchSourceStatus(true);
      const fresh = useAppStore.getState().sourceStatus;
      const currentMode: DshVersionSourceMode =
        fresh?.versionSource?.mode ?? fresh?.config?.version_source ?? 'auto';
      if (mode === 'system' && !fresh?.system) {
        showToast(t.dshSystemMissing, 'error');
        return;
      }
      // 确认对话框只在「切换会真正改变可用来源」时出现：用后端 resolvedByMode
      //（忽略 running 的偏好解析）比较当前与目标。
      // · 目标与当前解析一致（auto 落到当前来源、或切到正是真实来源）→ 无需确认；
      // · 解析结果确实不同 → 一律确认，让用户自行决定「立即生效」还是「下次启动生效」。
      //   有运行中进程要重启；目标为空会关闭已打开的 dsh 标签；无进程时“立即生效”
      //   才会真正切到目标来源（否则本会话仍是当前来源）。不再按 running 静默落盘
      //   （用户裁决 2026-10-22：有版本 → 另一个有版本且无运行中进程也要弹框）。
      const currentResolved = fresh?.versionSource?.resolvedByMode?.[currentMode] ?? 'none';
      const targetResolved = fresh?.versionSource?.resolvedByMode?.[mode] ?? 'none';
      const sourceChanges = targetResolved !== currentResolved;
      if (sourceChanges) {
        setPendingFromEmpty(currentResolved === 'none');
        setPendingTargetEmpty(targetResolved === 'none');
        setPendingMode(mode);
        setSourceDialogOpen(true);
        return;
      }
      // 解析结果不变（如 auto→system 而 auto 本就在系统）→ 只更新模式偏好，不弹框。
      // 此时可用来源未变、无进程需重启，也不需要关闭任何 dsh 标签。
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
      try {
        if (choice === 'cancel') {
          setDeferredSource(false);
          // 历史行为：切向 system 取消时回退宿主。但当前来源解析为空时，选择器与
          // 配置本就未变，再写 host 会静默改配置（如 auto 全空 → 取消后变 host），
          // 故该场景取消必须是纯 no-op。
          if (target === 'system' && !pendingFromEmpty) {
            await saveVersionSource('host');
          }
          return;
        }
        if (choice === 'next') {
          setPendingSource(target);
          setDeferredSource(true);
          showToast(t.dshVersionSourceNextLaunchSaved, 'success');
          return;
        }
        // 切到空来源要关闭已打开的 dsh 标签：重启后 running 归零，提前记下地址。
        // 捕获即剥离 query（一次性 token 只属于 bridge 返回到建标签的最短路径，
        // 不应存入局部变量；S1 纵深防御）。
        const rawPreSwitchUrl =
          useAppStore.getState().sourceStatus?.running?.url ??
          useAppStore.getState().dshLastUrl ??
          null;
        const preSwitchUrl = rawPreSwitchUrl?.split('?')[0] ?? null;
        if (!(await saveVersionSource(target))) {
          return;
        }
        // 目标解析为空：重启只会停掉旧进程（run_open 返回 NotFound，restarted=false），
        // 标签仍冻结在旧页面 —— 按切换前地址同源关闭（用户实测 2026-10-22 标签不关）。
        const targetResolved =
          useAppStore.getState().sourceStatus?.versionSource?.resolvedByMode?.[target] ?? 'none';
        const restart = await actions.restartDsh();
        await actions.fetchSourceStatus(true);
        if (targetResolved === 'none') {
          closeDshTabsByUrl(preSwitchUrl);
        }
        showToast(
          restart.failed ? t.dshRestartFailed : t.dshVersionSourceSwitched,
          restart.failed ? 'error' : 'success',
        );
      } finally {
        setSourceDialogBusy(false);
        setSourceDialogOpen(false);
        setPendingMode(null);
        // 对话框关闭时同步复位冻结态（S2）：避免残留 stale 值误导后续新增消费点。
        setPendingFromEmpty(false);
        setPendingTargetEmpty(false);
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
      pendingFromEmpty,
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
      setPendingFromEmpty(false);
      setPendingTargetEmpty(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sourceDialogBusy, sourceDialogOpen]);

  useEffect(() => {
    if (sourceDialogOpen) {
      sourceDialogCancelRef.current?.focus();
    }
  }, [sourceDialogOpen]);

  /** 官方版本信息外链：跟随「打开方式」设置的网址落点（面板/中心/外部浏览器）。 */
  const handleOpenOfficial = useCallback((url: string) => {
    openUrlByMethod(url);
  }, []);

  /**
   * 行内卸载：当前选中版本需二次确认（danger 态武装，再点执行），其余版本直接执行
   *（内置预置版本也是普通版本，按同一规则处理）。确认态文案挂在「当前版本」行下方。
   */
  const handleUninstallRow = useCallback(
    async (version: string, section: 'stable' | 'prerelease') => {
      if (uninstallingRef.current) {
        return;
      }
      if (version === currentSelected && uninstallConfirmVersion !== version) {
        setUninstallConfirmVersion(version);
        return;
      }
      setUninstallConfirmVersion(null);
      await runUninstall(version, section);
    },
    [currentSelected, uninstallConfirmVersion, runUninstall],
  );

  /**
   * 行内重装：当前版本走真重装；已装非当前版本走“只修目录、不改选中”
   *（`select=false`，用户明确期望：不切换，toast 显示“已重新安装”，
   * 切换仍需手动点“切换到该版本”）。运行中版本未动，无需重启。
   * 非当前分支复用 handleInstallVersion(select=false)（R2-D1 去重）。
   */
  const handleReinstallRow = useCallback(
    async (version: string, section: 'stable' | 'prerelease') => {
      if (version === currentSelected) {
        await handleReinstall();
        return;
      }
      await handleInstallVersion(version, section, false);
    },
    [currentSelected, handleInstallVersion, handleReinstall],
  );

  /** 行内版本选择下拉框：以该行为锚点打开本分区版本菜单（列出该分区全部版本供选择）。 */
  const handleOpenPicker = useCallback(
    (section: 'stable' | 'prerelease', anchor: HTMLElement, _rowVersion: string | null) => {
      // 同一个触发器再点一次 = 收起。外部点击监听刻意放行触发器内的点击
      // （否则 mousedown 关、click 又开），所以开关必须在这里显式切换
      // ——此前无条件置 true，菜单打开后点按钮关不掉（用户 2026-10-22）。
      const toggleOff = showVersionMenu && menuAnchorEl === anchor;
      if (toggleOff) {
        setShowVersionMenu(false);
        return;
      }
      setMenuSection(section);
      setMenuAnchorEl(anchor);
      setShowVersionMenu(true);
    },
    [menuAnchorEl, showVersionMenu],
  );

  /** 菜单内选择版本：只切换本分区的下拉框展示，关闭菜单；实际安装/切换走行内按钮。 */
  const handlePickVersion = useCallback(
    (section: 'stable' | 'prerelease', version: string, _isInstalled: boolean) => {
      if (section === 'prerelease') {
        setPrereleasePick(version);
      } else {
        setStablePick(version);
      }
      setShowVersionMenu(false);
    },
    [],
  );

  useEffect(() => {
    // 首屏一次原子快照：source-status + version-status + catalog 同一次提交，
    // 避免三路请求分段到货导致块内行数/读数跳动。
    void actions.fetchDshSettingsSnapshot();
  }, [actions]);

  // 拉起中/重启长尾：用更密的轻量轮询尽快结束骨架态；其余时间 5s 一次。
  const dshFastPoll = useAppStore((s) => s.dshRestarting || s.sourceStatus?.starting === true);

  useEffect(() => {
    // 轻量运行状态轮询（外部进程无法发事件，只能低频兜底）：
    // 只探端口 + 宿主托管/拉起标志，不跑 where/版本探测；页面隐藏时暂停。
    const tick = () => {
      if (document.hidden) {
        return;
      }
      void actions.fetchDshRunning(true);
    };
    const id = window.setInterval(tick, dshFastPoll ? 1000 : 5000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [actions, dshFastPoll]);

  useEffect(() => {
    void actions.fetchVersionTask();
    if (!versionBusy) {
      return;
    }
    const id = window.setInterval(() => {
      void actions.fetchVersionTask();
    }, 400);
    return () => {
      window.clearInterval(id);
    };
  }, [versionBusy, actions, versionTask?.kind, versionTask?.version]);

  // 任务行展示快照（用户实测 2026-10-21：取消按钮消失后进度条残留、
  // finalizing 阶段进度静止易误判卡死）。task 置 null 到 busy 结束存在空窗，
  // 此期间沿用最后一次非 null 快照展示，与按钮同隐同现。
  // 检查更新同样使 versionBusy 为 true，但它不产生任务——必须排除，
  // 否则上一次任务的残留行会冒出来（用户实测 2026-10-26：点检查更新冒出“正在下载…”）。
  const dshRestarting = useAppStore((s) => s.dshRestarting);
  const opBusy = versionBusy && !checkingUpdate;
  // 显示冻结与入口守卫共用的“版本变更在途”判定（含重启长尾与对话框发起的切换）：
  // store 级 dshOpBusy 由各行内 handler 同步置位，覆盖轮询到 versionTask 之前约一拍的窗口。
  const lastTaskRef = useRef<DshVersionTask | null>(null);
  useEffect(() => {
    if (versionTask) {
      lastTaskRef.current = versionTask;
    } else if (!opBusy && !dshRestarting) {
      // 彻底空闲才清快照：进行中（轮询间隙/重启长尾）保留，避免闪烁。
      lastTaskRef.current = null;
    }
  }, [versionTask, opBusy, dshRestarting]);
  const shownTask = versionTask ?? (opBusy || dshRestarting ? lastTaskRef.current : null);

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
      kind === 'dsh-uninstall'
        ? t.dshCancelUninstall
        : kind === 'dsh-reinstall'
          ? t.dshCancelReinstall
          : t.dshCancelInstall,
    [t],
  );

  /**
   * 任务阶段文案（用户实测 2026-10-21＋外部调研结论：阶段＋真实计数，不伪造进度）。
   * installing 且 total 未知（npm 下载中、tmp 尚空）如实显示“正在下载”；
   * total 已知显示计数（用户明确要求：分子按真实情况增长，
   * N 可大于干跑预测 total——真实树含理想树之外的包，含义见行内问号文案）；
   * 收尾如实收尾；removing 空目录视为准备中。
   * 返回 [扫光文字, 素计数] 二元组：扫光只作用于文字部分（用户明确要求）。
   */
  const taskStageText = useCallback(
    (task: DshVersionTask): [string, string] => {
      const counts = (done: number, total: number) => `${done}/${total}`;
      switch (task.phase) {
        case 'preparing':
          return [t.dshTaskStagePreparing, ''];
        case 'installing':
          return task.total > 0
            ? [t.dshTaskStageInstalling, counts(task.done, task.total)]
            : [t.dshTaskStageDownloading, ''];
        case 'removing':
          return task.total > 0
            ? [t.dshTaskStageRemoving, counts(task.done, task.total)]
            : [t.dshTaskStagePreparing, ''];
        case 'finalizing':
          return [t.dshTaskStageFinalizing, ''];
      }
    },
    [t],
  );

  // 阶段文案覆盖规则：后端任务仍在 → 按其真实阶段显示；任务已结束但 UI 仍忙
  //（重启长尾/轮询间隙）→ 统一显示“正在收尾”，不展示快照里的旧阶段
  //（否则取消瞬间会闪一下“正在下载…”再跳“正在收尾…”）。
  // 注意：必须位于 taskStageText 定义之后（const 提升死区）。
  const stageText: [string, string] =
    shownTask == null
      ? ['', '']
      : versionTask != null
        ? taskStageText(shownTask)
        : [t.dshTaskStageFinalizing, ''];

  // 官方列表行布局：版本选择下拉框固定最左，其它动态按钮固定同行最右。
  // 可见性规则（与普通已装版本完全一致，内置预置版本没有特例）：
  // 已装 → 卸载 + 重装；未装 → 安装；已装非当前 → 再加「切换到该版本」；
  // 当前版本 → 无安装/切换。
  // 徽章：每行一个状态徽章（当前版本 > 已内置 > 已装版本），同款胶囊样式；
  // 「当前版本」用主题蓝；勾号槽位常驻，保证徽章不因勾号出现而位移（用户要求）。
  // 下拉框固定为分区最长选项宽度（实测），打开的菜单同宽。
  const renderVersionRowAction = (v: string, section: 'stable' | 'prerelease', time: string) => {
    const isCurrent = isVersionInUse(v);
    const isInstalled = snapInstalled.includes(v);
    const isBundled = v === snapBundled;
    const fixedWidth = section === 'prerelease' ? menuWidths.prerelease : menuWidths.stable;
    return (
      <>
        <button
          type="button"
          className="adl-dsh-settings__version-picker"
          style={fixedWidth != null ? { width: fixedWidth } : undefined}
          onClick={(e) => handleOpenPicker(section, e.currentTarget, v)}
          disabled={displayFrozen}
          aria-expanded={showVersionMenu && menuSection === section}
          aria-haspopup="listbox"
          aria-label={v}
          title={[
            v,
            isCurrent
              ? t.dshCurrentVersionBadge
              : isBundled
                ? t.dshBundledVersions
                : isInstalled
                  ? t.dshInstalledVersions
                  : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        >
          <span className="adl-dsh-settings__version-picker-label">
            <span className="adl-dsh-settings__version-picker-version">{v}</span>
            {/* 与菜单卡片同一口径：当前版本 > 已内置 > 已装版本，单徽章互斥。 */}
            {isCurrent ? (
              <span className="adl-dsh-settings__version-menu-item-installed adl-dsh-settings__version-menu-item-current">
                {t.dshCurrentVersionBadge}
              </span>
            ) : isBundled ? (
              <span className="adl-dsh-settings__version-menu-item-installed">
                {t.dshBundledVersions}
              </span>
            ) : isInstalled ? (
              <span className="adl-dsh-settings__version-menu-item-installed">
                {t.dshInstalledVersions}
              </span>
            ) : null}
            <span className="adl-dsh-settings__version-menu-item-check" aria-hidden={!isCurrent}>
              {isCurrent ? <CheckIcon /> : null}
            </span>
          </span>
          <span className="adl-dsh-settings__version-picker-chevron">
            <ChevronDownIcon />
          </span>
        </button>
        {/* 任务进行中时隐藏发布时间（用户要求：任务行只保留阶段文案＋取消按钮）。 */}
        {shownTask?.version === v ? null : time ? (
          <span className="adl-dsh-settings__version-list-item-time">{time}</span>
        ) : null}
        {shownTask?.version === v ? (
          <div className="adl-dsh-settings__version-task">
            <span className="adl-dsh-settings__version-task-stage" aria-live="polite">
              <span className="adl-dsh-settings__version-task-shimmer">{stageText[0]}</span>
              {stageText[1] ? (
                <span className="adl-dsh-settings__version-task-count">{stageText[1]}</span>
              ) : null}
            </span>
            <button
              type="button"
              className="adl-dsh-settings__action-btn"
              onClick={() => void handleCancelTask()}
              disabled={versionTask == null || !shownTask.cancellable}
            >
              {taskCancelLabel(shownTask.kind)}
            </button>
          </div>
        ) : (
          <div className="adl-dsh-settings__version-list-actions">
            {isInstalled ? (
              <button
                type="button"
                className={`adl-dsh-settings__action-btn${
                  uninstallConfirmVersion === v ? ' adl-dsh-settings__action-btn--danger' : ''
                }`}
                onClick={() => void handleUninstallRow(v, section)}
                disabled={displayFrozen}
                aria-label={uninstallingVersion === v ? t.dshUninstall : undefined}
              >
                {uninstallingVersion === v ? <Spinner size="sm" speed="normal" /> : t.dshUninstall}
              </button>
            ) : null}
            {isInstalled ? (
              <button
                type="button"
                className="adl-dsh-settings__action-btn"
                onClick={() => void handleReinstallRow(v, section)}
                disabled={displayFrozen}
                aria-label={reinstalling ? t.dshReinstall : undefined}
              >
                {reinstalling ? <Spinner size="sm" speed="normal" /> : t.dshReinstall}
              </button>
            ) : null}
            {!isInstalled ? (
              <button
                type="button"
                className="adl-dsh-settings__action-btn"
                onClick={() => void handleInstallVersion(v, section)}
                disabled={displayFrozen}
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
                onClick={() => void handleRevertToVersion(v, section)}
                disabled={displayFrozen}
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
    const isCurrent = isVersionInUse(v);
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
  // 切源重启后即新来源版本）；外部复用（`source=external`）一律未知，不猜宿主版本
  // （事项 4 文案承诺一致）。副行按来源标注「运行中 · 系统安装 / 外部运行」，
  // 完整地址（去 token query）放 title；正文只放 host:port，避免长 URL 撑破读数行。
  // 徽章（发现新版本/已是最新）只在主行版本号确为宿主当前选中时才挂，避免
  // system 版与宿主选中不一致时误导。
  // 内置版本（用户 2026-10-22）不再显示整句「内置版本 x」，而是与已装版本同构：
  // 版本号 + 来源胶囊徽章（`bundled`），便于和同版本号的系统安装区分。
  const runningReadout = useCallback(
    (running: DshRunningInfo | null | undefined, bundled: boolean) => {
      const url = running?.url ?? '';
      const endpoint = displayEndpoint(url);
      const title = url ? displayUrl(url) : null;
      const source = running?.source ?? 'external';
      const known = running?.version ?? null;
      const subTemplate = source === 'system' ? t.dshEffectiveRunningSystem : t.dshEffectiveRunning;
      if (known) {
        return {
          text: known,
          sub: subTemplate.replace('{url}', endpoint),
          empty: false,
          bundled,
          title,
        };
      }
      // 版本未知：主行如实报「版本未知」（不把“运行中”当成版本号），
      // 副行按来源说明是外部启动还是系统安装拉起。
      return {
        text: t.dshVersionUnknown,
        sub:
          source === 'external'
            ? t.dshRunningExternalNote.replace('{url}', endpoint)
            : subTemplate.replace('{url}', endpoint),
        empty: true,
        // 版本未知时不挂来源徽章：徽章贴着版本号才有意义。
        bundled: false,
        title,
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
          // 系统安装是用户自己装的那份，不是内置版本。
          bundled: false,
          title: null,
        };
      }
      return {
        text: t.dshEffectiveSystem.replace('{path}', path),
        sub: t.dshVersionUnknown,
        empty: true,
        bundled: false,
        title: null,
      };
    },
    [t],
  );
  // 首屏快照 source 腿失败且无任何可用数据时读数区切错误态（S3）。
  const snapshotFailed = useAppStore((s) => s.settingsSnapshotFailed);
  const readout = useMemo(() => {
    const snapSource = snap.versionSource;
    const snapStatus = snap.sourceStatus;
    const snapSelected = snap.currentSelected;
    // 内置判定：只认「当前版本号 == 安装包预置记录」，且这份版本确由宿主提供。
    // 系统安装同版本号不标内置（那份不是我们预置的）；外部复用的进程来源未知，也不标。
    const hostBundled = snapBundled !== null && snapSource?.hostVersion === snapBundled;
    // 运行中：只有「宿主拉起的那一份」可能来自预置版本；版本来源偏好为系统安装时
    // 跑的是用户自己的 dsh，即便版本号相同也不标内置。
    const runningBundled =
      snapBundled !== null &&
      snapSource?.mode !== 'system' &&
      snapStatus?.running?.managed === true &&
      snapStatus.running.version === snapBundled;
    // 首次快照未到：如实显示中性「状态读取中」，不得拿 currentSelected 顶替实际来源
    //（P3：那会展示一个并未生效的宿主版本，快照持续失败时误导会一直存在）。
    // 快照 source 腿失败且无任何可用数据：显示错误态，不再无限骨架（S3）。
    if (!snapSource) {
      if (snapshotFailed) {
        return {
          text: t.dshVersionStateFailed,
          sub: null as string | null,
          empty: true,
          bundled: false,
          title: null as string | null,
        };
      }
      return {
        text: t.dshVersionStateReading,
        sub: null as string | null,
        empty: true,
        bundled: false,
        title: null as string | null,
      };
    }
    switch (snapSource.effective) {
      case 'host':
        return {
          text: snapSource.hostVersion ?? snapSelected ?? '',
          // 内置预置版本补一行来源说明（版本号自身已由徽章标注）。
          sub: hostBundled ? t.dshBundledSourceNote : null,
          empty: false,
          bundled: hostBundled,
          title: null,
        };
      case 'running':
        return { ...runningReadout(snapStatus?.running, runningBundled) };
      case 'system':
        return {
          ...systemReadout(snapStatus?.system?.path ?? '', snapStatus?.system?.version ?? null),
        };
      default:
        return {
          text: t.dshCurrentVersionNone,
          sub: null as string | null,
          empty: true,
          bundled: false,
          title: null,
        };
    }
  }, [
    snap.versionSource,
    snap.sourceStatus,
    snap.currentSelected,
    snapBundled,
    snapshotFailed,
    t,
    runningReadout,
    systemReadout,
  ]);
  // 读数骨架态：首次快照未到、版本操作在途、拉起中/重启长尾时，整块右侧（版本号 +
  // 来源副行 + 最新版本行）统一显示现有骨架胶囊波浪动画，不展示中途值。
  // 快照失败错误态不进骨架（S3）：错误文本即最终展示。
  const readoutLoading =
    !snapshotFailed && (applyingVersion !== null || dshFastPoll || snap.versionSource === null);
  // 主行版本号确为宿主当前选中才挂更新徽章（事项 1：system/外部 running 版本与宿主
  // 选中不一致时挂徽章会误导，故收紧；busy 期间沿用冻结快照，与读数同翻转）。
  const showVersionBadges =
    !readout.empty &&
    (snap.versionSource?.effective === 'host' ||
      snap.versionSource == null ||
      readout.text === snapCurrent);

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
          {!systemManaged && resolvedSource === 'none' ? (
            <small className="adl-dsh-settings__row-warn">
              {sourceMode === 'host' ? t.dshNoSourceHostNote : t.dshNoSourceAutoNote}
            </small>
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
          {uninstallConfirmVersion !== null ? (
            <small className="adl-dsh-settings__row-warn">{t.dshUninstallCurrentHint}</small>
          ) : null}
          {manageVisible && hasPrereleaseUpdate && prereleaseAvailable ? (
            <small className="adl-dsh-settings__row-warn">
              {t.dshPrereleaseUpdateAvailable.replace('{version}', prereleaseAvailable)}
            </small>
          ) : null}
        </div>
        <div className="adl-settings-row__control">
          <div className="adl-dsh-settings__version-readout">
            {readoutLoading ? (
              <span
                className="adl-dsh-settings__version-loading"
                role="status"
                aria-label={applyingVersion ?? t.dshVersionStateReading}
              />
            ) : readout.empty ? (
              <span className="adl-dsh-settings__version-value is-empty">{readout.text}</span>
            ) : (
              <span className="adl-dsh-settings__version-value">
                {readout.text}
                {readout.bundled ? (
                  <span className="adl-dsh-settings__version-menu-item-installed">
                    {t.dshBundledBadge}
                  </span>
                ) : null}
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
            {!readoutLoading && readout.sub ? (
              // 完整运行地址（已剥离一次性 token query）只在悬停提示里展示。
              <small
                className="adl-dsh-settings__version-latest"
                title={readout.title ?? undefined}
              >
                {readout.sub}
              </small>
            ) : null}
            {manageVisible && latestAvailable ? (
              <small className="adl-dsh-settings__version-latest">
                {t.dshLatest.replace('{version}', latestAvailable)}
              </small>
            ) : null}
          </div>
        </div>
      </div>

      {/* 行2：检查更新（仅检查；安装/切换/卸载/重装在下方正式版/预发布行内按行操作）。 */}
      {manageVisible ? (
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
              disabled={displayFrozen}
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
          字体/间距一致；外加收缩类避免块级拉伸（根因见 CSS 注释）。
          另附下拉框 replica（含箭头，与行内按钮同结构同类名）：两者取最大，
          否则横向下拉框内容超出纵向菜单项宽度时勾选压住箭头（用户实测 2026-10-21）。 */}
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
        {longestStableVersion ? (
          <div
            ref={stablePickerSizerRef}
            className="adl-dsh-settings__version-picker adl-dsh-settings__version-sizer-picker"
          >
            <span className="adl-dsh-settings__version-picker-label">
              <span className="adl-dsh-settings__version-picker-version">
                {longestStableVersion}
              </span>
              <span className="adl-dsh-settings__version-menu-item-installed">
                {t.dshInstalledVersions}
              </span>
              <span className="adl-dsh-settings__version-menu-item-check">
                <CheckIcon />
              </span>
            </span>
            <span className="adl-dsh-settings__version-picker-chevron">
              <ChevronDownIcon />
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
        {longestPrereleaseVersion ? (
          <div
            ref={prereleasePickerSizerRef}
            className="adl-dsh-settings__version-picker adl-dsh-settings__version-sizer-picker"
          >
            <span className="adl-dsh-settings__version-picker-label">
              <span className="adl-dsh-settings__version-picker-version">
                {longestPrereleaseVersion}
              </span>
              <span className="adl-dsh-settings__version-menu-item-installed">
                {t.dshInstalledVersions}
              </span>
              <span className="adl-dsh-settings__version-menu-item-check">
                <CheckIcon />
              </span>
            </span>
            <span className="adl-dsh-settings__version-picker-chevron">
              <ChevronDownIcon />
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
              role="listbox"
              aria-label={menuSection === 'prerelease' ? t.dshPrereleaseTitle : t.dshOfficialStable}
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
                  const isInstalled = snapInstalled.includes(v);
                  const isBundled = v === snapBundled;
                  const isPicked = v === menuEffective;
                  const isCurrent = isVersionInUse(v);
                  const time = formatPublishedAt(info.publishedAt);
                  return (
                    <div
                      key={v}
                      className="adl-dsh-settings__version-menu-item"
                      role="option"
                      aria-selected={isPicked}
                    >
                      <button
                        type="button"
                        className="adl-dsh-settings__version-menu-item-revert"
                        onClick={() => handlePickVersion(menuSection, v, isInstalled)}
                        disabled={displayFrozen}
                      >
                        <span className="adl-dsh-settings__version-menu-item-version">{v}</span>
                        {time ? (
                          <span className="adl-dsh-settings__version-menu-item-time">{time}</span>
                        ) : null}
                      </button>
                      <div className="adl-dsh-settings__version-menu-item-badges">
                        {/* 每行最多一个状态徽章，优先级：当前版本 > 已内置 > 已装版本。
                            已内置本身即已装，只标更具体的那个；当前版本用蓝色以便一眼识别。
                            勾号槽位**常驻**（未选中时留空）：徽章不会因勾号出现而左移。 */}
                        {isCurrent ? (
                          <span className="adl-dsh-settings__version-menu-item-installed adl-dsh-settings__version-menu-item-current">
                            {t.dshCurrentVersionBadge}
                          </span>
                        ) : isBundled ? (
                          <span className="adl-dsh-settings__version-menu-item-installed">
                            {t.dshBundledVersions}
                          </span>
                        ) : isInstalled ? (
                          <span className="adl-dsh-settings__version-menu-item-installed">
                            {t.dshInstalledVersions}
                          </span>
                        ) : null}
                        <span
                          className="adl-dsh-settings__version-menu-item-check"
                          aria-hidden={!isPicked}
                        >
                          {isPicked ? <CheckIcon /> : null}
                        </span>
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

      {manageVisible ? (
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
                      setPendingFromEmpty(false);
                      setPendingTargetEmpty(false);
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
                    {pendingFromEmpty
                      ? t.dshVersionSourceSwitchDialogFromEmpty.replaceAll(
                          '{target}',
                          pendingTargetLabel,
                        )
                      : pendingMode === 'system' || pendingMode == null
                        ? t.dshVersionSourceSystemDialogMessage.replace(
                            '{path}',
                            dshSourceStatus?.system?.path ?? '',
                          )
                        : t.dshVersionSourceSwitchDialogMessage.replaceAll(
                            '{target}',
                            pendingTargetLabel,
                          )}
                  </p>
                  {pendingTargetEmpty ? (
                    <p className="adl-confirm-dialog__message adl-dsh-source-dialog__message adl-dsh-source-dialog__message--warn">
                      {t.dshVersionSourceSwitchDialogEmpty.replaceAll(
                        '{target}',
                        pendingTargetLabel,
                      )}
                    </p>
                  ) : null}
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
                  {/* 次选项为同步记 pending（无异步过程），busy 仅禁用不转圈：
                       圈只属于真正走异步重启的“立即生效”（R1-LOW，有据保留）。 */}
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
