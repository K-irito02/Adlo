import { useCallback, useEffect, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import { Spinner } from '@components/Spinner';

/** 模拟版本发布时间线数据（按版本号从新到旧排列） */
const MOCK_VERSION_TIMELINE: Record<string, string> = {
  '0.1.2-rc.1': '2026-09-06 04:30',
  '0.1.0-rc.8': '2026-09-05 18:20',
  '0.1.0-rc.7': '2026-09-04 12:10',
  '0.1.0-rc.6': '2026-09-03 09:45',
  '0.1.0-rc.5': '2026-09-02 16:00',
  '0.1.0-rc.4': '2026-09-01 11:30',
  '0.1.0-rc.3': '2026-08-30 14:15',
  '0.1.0-rc.2': '2026-08-28 08:00',
  '0.1.0-rc.1': '2026-08-25 17:40',
  '0.1.0': '2026-08-20 10:00',
};

/**
 * DeepSeek 官方 SVG 图标（currentColor 继承，不使用蓝色）。
 */
function DeepSeekIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 600 600"
      fill="currentColor"
    >
      <g clipPath="url(#dsh-icon-clip)">
        <path d="M593.7 112c-6.3-3-9.1 2.9-12.8 5.9q-1.9 1.6-3.4 3.4c-9.3 10-20.2 16.4-34.3 15.6a67 67 0 0 0-54.1 21.3 49 49 0 0 0-31.2-38.7c-8.8-4-17.7-7.8-23.9-16.3-4.3-6-5.4-12.8-7.6-19.4-1.4-4-2.7-8-7.3-8.7-5-.8-7 3.4-9 6.9a91 91 0 0 0-10.5 46 99 99 0 0 0 46 84.8c3.4 2.3 4.3 4.7 3.2 8.1-2 7-4.5 13.8-6.6 20.8-1.4 4.5-3.5 5.5-8.3 3.5-16.2-7-31-17-43.4-29.5-21.4-20.7-40.7-43.5-64.9-61.4q-8.4-6.2-17.2-11.8c-24.6-24 3.2-43.6 9.7-45.9 6.7-2.5 2.3-10.8-19.5-10.7s-41.7 7.4-67.2 17.1a76 76 0 0 1-11.6 3.4q-35.8-6.7-72-2.5a155 155 0 0 0-112.5 65.5c-33.2 45.8-41 97.7-31.5 151.9a232 232 0 0 0 84 141.3 224 224 0 0 0 161 53.5c37-2.1 78.3-7.1 124.8-46.5 11.8 5.8 24 8.1 44.5 9.9 15.8 1.5 30.9-.7 42.6-3.2 18.4-3.9 17.1-21 10.5-24-53.9-25.1-42-14.9-52.8-23.2 27.4-32.4 68.6-66 84.8-175 1.2-8.7.2-14.2 0-21.2-.1-4.2.9-5.9 5.7-6.4q20.6-2.2 38.7-11.8c34.9-19.1 49-50.4 52.3-88 .5-5.7-.1-11.6-6.2-14.7M289.5 450c-52.2-41-77.5-54.6-88-54-9.8.6-8 11.8-5.8 19a70 70 0 0 0 9.2 18.6c2.9 4.1 4.8 10.3-2.8 15-16.8 10.4-46-3.5-47.4-4.2-34-20-62.5-46.4-82.5-82.6a253 253 0 0 1-32.5-112c-.5-9.7 2.3-13.1 12-14.9q18.9-3.6 38.2-1a240 240 0 0 1 136.7 69.4c21.7 21.5 38 47.2 55 72.3 18 26.6 37.4 52 62 72.8a195 195 0 0 0 22.3 17c-20 2.2-53.5 2.7-76.4-15.4m25-161a7.6 7.6 0 0 1 10.4-7.2 7.5 7.5 0 0 1 5 7.2 7.7 7.7 0 0 1-10.7 7.1 8 8 0 0 1-4.7-7.1m77.8 39.9c-5 2-10 3.8-14.8 4-7.2.3-14.2-2-20-6.3-6.8-5.8-11.7-9-13.7-19q-1-7.4.4-14.7c1.7-8.2-.2-13.4-6-18.2-4.7-3.9-10.6-5-17.2-5a14 14 0 0 1-6.3-1.9 6.3 6.3 0 0 1-2.9-9c.7-1.3 4-4.6 4.8-5.2 8.9-5 19.2-3.4 28.7.4 8.8 3.6 15.4 10.2 25 19.6 9.8 11.2 11.5 14.3 17.1 22.8a95 95 0 0 1 11.1 21.2q2.5 7.4-6.2 11.3" />
      </g>
      <defs>
        <clipPath id="dsh-icon-clip">
          <path fill="#fff" d="M0 0h600v600H0z" />
        </clipPath>
      </defs>
    </svg>
  );
}

/** 检查更新图标（刷新箭头） */
function CheckUpdateIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        opacity="0.4"
        d="M14 5H20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        opacity="0.4"
        d="M14 8H17"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 11.5C21 16.75 16.75 21 11.5 21C6.25 21 2 16.75 2 11.5C2 6.25 6.25 2 11.5 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        opacity="0.4"
        d="M22 22L20 20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 下载更新图标（圆形下载） */
function DownloadUpdateIcon() {
  return (
    <svg viewBox="0 0 25 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M11.6715 13.6301L10.2987 12.2581C10.0057 11.9653 9.53079 11.9654 9.23799 12.2584C8.94519 12.5514 8.94534 13.0263 9.23833 13.3191L11.8781 15.9572C12.0148 16.1008 12.2077 16.1903 12.4215 16.1903C12.648 16.1903 12.851 16.0899 12.9886 15.9311L15.6025 13.3191C15.8955 13.0263 15.8956 12.5514 15.6028 12.2584C15.31 11.9654 14.8352 11.9653 14.5422 12.2581L13.1715 13.6277V8.55962C13.1715 8.14541 12.8357 7.80962 12.4215 7.80962C12.0073 7.80962 11.6715 8.14541 11.6715 8.55962V13.6301Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2.42188 12C2.42188 6.47766 6.89916 2.00098 12.4214 2.00098C17.9437 2.00098 22.421 6.47766 22.421 12C22.421 17.5224 17.9437 21.9991 12.4214 21.9991C6.89916 21.9991 2.42188 17.5224 2.42188 12ZM12.4214 3.50098C7.72748 3.50098 3.92188 7.30619 3.92188 12C3.92188 16.6939 7.72748 20.4991 12.4214 20.4991C17.1154 20.4991 20.921 16.6939 20.921 12C20.921 7.30619 17.1154 3.50098 12.4214 3.50098Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** 版本选择图标（列表样式） */
function VersionSelectIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9 6L20 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 6.01L5.01 5.99889"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 12.01L5.01 11.9989"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.80005 17.8L4.60005 18.6L6.60004 16.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 12L20 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 18L20 18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 重新安装图标（循环箭头） */
function ReinstallIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeMiterlimit="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g opacity="0.4">
        <path
          d="M22.0008 2L13.8008 10.2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13 6.16992V10.9999H17.83"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

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

/** 垃圾桶图标（用于卸载） */
function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 5V13C4 13.5523 4.44772 14 5 14H11C11.5523 14 12 13.5523 12 13V5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.5 5H13.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 5V3.5C5.5 3.22386 5.72386 3 6 3H10C10.2761 3 10.5 3.22386 10.5 3.5V5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * 中间区欢迎引导页（dsh 关闭后显示）。
 * - 主导按钮"打开 DeepSeek Harness" → 进入中间区 dsh。
 * - 版本管理区：当前版本/最新版本/有更新徽标 + 检查更新 / 升级 / 版本选择与卸载 / 重装。
 * - 卸载当前选中版本时显示警告提示（不强行阻止）。
 * - 加载时拉取 dsh 版本状态。
 *
 * 注意：组件命名使用 `adl-app-welcome` 前缀，支持未来扩展其他第三方 WebApp。
 */
export function WelcomePage() {
  const { t } = useTCopy();
  const actions = useAppActions();
  const versionStatus = useAppStore((s) => s.versionStatus);
  const appReady = useAppStore((s) => s.appReady);
  const showToast = useAppStore((s) => s.showToast);

  const [uninstallConfirm, setUninstallConfirm] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [reinstalling, setReinstalling] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showDownloadIcon, setShowDownloadIcon] = useState(false);
  const [showVersionMenu, setShowVersionMenu] = useState(false);
  const [uninstallingVersion, setUninstallingVersion] = useState<string | null>(null);
  const checkingRef = useRef(false);
  const reinstallingRef = useRef(false);
  const revertingRef = useRef(false);
  const uninstallingRef = useRef<string | null>(null);
  const downloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versionMenuRef = useRef<HTMLDivElement>(null);

  const currentSelected = versionStatus?.currentSelected ?? null;
  const latestAvailable = versionStatus?.latestAvailable ?? null;
  const hasUpdate = versionStatus?.hasUpdate ?? false;
  const installed = versionStatus?.installed ?? [];

  const isCurrentSelected = installed.includes(currentSelected ?? '') && currentSelected !== null;
  const hasMultipleVersions = installed.length > 1;

  // 构建菜单排序：当前版本 → 已装(新→旧) → 未装(新→旧)
  const sortedVersions = (() => {
    const installedSet = new Set(installed);
    const current = currentSelected ? [currentSelected] : [];
    const installedOthers = installed.filter((v) => v !== currentSelected);
    const notInstalled = [latestAvailable, ...installed]
      .filter((v): v is string => !!v && !installedSet.has(v))
      .filter((v, i, arr) => arr.indexOf(v) === i);
    return [...current, ...installedOthers, ...notInstalled];
  })();

  // 有更新时自动显示下载图标
  useEffect(() => {
    if (hasUpdate && !showDownloadIcon && !downloading) {
      setShowDownloadIcon(true);
      downloadTimerRef.current = setTimeout(() => {
        setShowDownloadIcon(false);
        downloadTimerRef.current = null;
      }, 30_000);
    }
  }, [hasUpdate]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (downloadTimerRef.current) {
        clearTimeout(downloadTimerRef.current);
      }
    };
  }, []);

  // 点击外部关闭版本菜单
  useEffect(() => {
    if (!showVersionMenu) {
      return;
    }
    const handleClickOutside = (e: MouseEvent) => {
      if (versionMenuRef.current && !versionMenuRef.current.contains(e.target as Node)) {
        setShowVersionMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [showVersionMenu]);

  const handleOpen = useCallback(() => {
    void actions.openDsh();
  }, [actions]);

  const handleCheckUpdate = useCallback(async () => {
    if (checkingRef.current) {
      return;
    }
    checkingRef.current = true;
    setCheckingUpdate(true);
    setShowDownloadIcon(false);
    if (downloadTimerRef.current) {
      clearTimeout(downloadTimerRef.current);
      downloadTimerRef.current = null;
    }
    try {
      await actions.fetchDshVersionStatus();
      const state = useAppStore.getState();
      const hasNewUpdate = state.versionStatus?.hasUpdate;
      if (hasNewUpdate) {
        showToast(t.dshHasUpdate, 'success');
        setShowDownloadIcon(true);
        downloadTimerRef.current = setTimeout(() => {
          setShowDownloadIcon(false);
          downloadTimerRef.current = null;
        }, 30_000);
      } else {
        showToast(t.dshNoUpdate, 'success');
      }
    } catch {
      showToast(t.dshCheckUpdate, 'error');
    } finally {
      checkingRef.current = false;
      setCheckingUpdate(false);
    }
  }, [actions, showToast, t]);

  const handleDownloadUpdate = useCallback(async () => {
    if (downloading) {
      return;
    }
    setDownloading(true);
    setShowDownloadIcon(false);
    if (downloadTimerRef.current) {
      clearTimeout(downloadTimerRef.current);
      downloadTimerRef.current = null;
    }
    try {
      await actions.updateDsh();
      showToast(t.dshUpdate, 'success');
    } catch {
      showToast(t.dshUpdate, 'error');
    } finally {
      setDownloading(false);
    }
  }, [actions, downloading, showToast, t]);

  const handleRevertToVersion = useCallback(
    async (version: string) => {
      if (revertingRef.current || version === currentSelected) {
        return;
      }
      revertingRef.current = true;
      setReverting(true);
      setShowVersionMenu(false);
      try {
        await actions.revertDsh(version);
        showToast(t.dshRevertedTo.replace('{version}', version), 'success');
      } catch {
        showToast(t.dshRevert, 'error');
      } finally {
        revertingRef.current = false;
        setReverting(false);
      }
    },
    [actions, currentSelected, showToast, t],
  );

  const handleUninstallVersion = useCallback(
    async (version: string) => {
      if (uninstallingRef.current) {
        return;
      }
      uninstallingRef.current = version;
      setUninstallingVersion(version);
      try {
        await actions.uninstallDsh(version);
        showToast(t.dshUninstallSuccess.replace('{version}', version), 'success');
      } catch {
        showToast(t.dshUninstall, 'error');
      } finally {
        uninstallingRef.current = null;
        setUninstallingVersion(null);
      }
    },
    [actions, showToast, t],
  );

  const handleReinstall = useCallback(async () => {
    if (reinstallingRef.current) {
      return;
    }
    reinstallingRef.current = true;
    setReinstalling(true);
    try {
      await actions.reinstallDsh();
      showToast(t.dshReinstall, 'success');
    } catch {
      showToast(t.dshReinstall, 'error');
    } finally {
      reinstallingRef.current = false;
      setReinstalling(false);
    }
  }, [actions, showToast, t]);

  const handleUninstall = useCallback(() => {
    if (!currentSelected) {
      return;
    }
    if (isCurrentSelected) {
      setUninstallConfirm(true);
      return;
    }
    void actions.uninstallDsh(currentSelected);
  }, [actions, currentSelected, isCurrentSelected]);

  const handleConfirmUninstall = useCallback(() => {
    if (!currentSelected) {
      return;
    }
    setUninstallConfirm(false);
    void actions.uninstallDsh(currentSelected);
  }, [actions, currentSelected]);

  useEffect(() => {
    void actions.fetchDshVersionStatus();
  }, [actions]);

  return (
    <section className="adl-center adl-center--dsh-placeholder" aria-label={t.dshTitle}>
      <div className="adl-app-welcome">
        {/* Top action bar: CTA left, icon buttons right */}
        <div className="adl-app-welcome__topbar">
          {appReady ? (
            <button
              type="button"
              className="adl-app-welcome__cta"
              onClick={handleOpen}
              title={t.dshOpenButtonHint}
            >
              <DeepSeekIcon />
              {t.dshOpenButton}
            </button>
          ) : null}

          <div className="adl-app-welcome__icon-group">
            {/* Version select & uninstall — icon only, shows dropdown menu */}
            {hasMultipleVersions ? (
              <div className="adl-app-welcome__version-menu-anchor" ref={versionMenuRef}>
                <button
                  type="button"
                  className="adl-btn adl-btn--icon"
                  onClick={() => setShowVersionMenu((v) => !v)}
                  disabled={reverting}
                  title={t.dshRevertHint}
                >
                  {reverting ? <Spinner size="sm" speed="normal" /> : <VersionSelectIcon />}
                </button>
                {showVersionMenu ? (
                  <div className="adl-app-welcome__version-menu">
                    <div className="adl-app-welcome__version-menu-list">
                      {sortedVersions.map((v) => {
                        const isCurrent = v === currentSelected;
                        const isInstalled = installed.includes(v);
                        const time = MOCK_VERSION_TIMELINE[v] ?? '';
                        return (
                          <button
                            key={v}
                            type="button"
                            className={`adl-app-welcome__version-menu-item${isCurrent ? ' adl-app-welcome__version-menu-item--current' : ''}`}
                            onClick={() => void handleRevertToVersion(v)}
                            disabled={isCurrent || reverting}
                          >
                            <div className="adl-app-welcome__version-menu-item-info">
                              <span className="adl-app-welcome__version-menu-item-version">
                                {v}
                              </span>
                              {time ? (
                                <span className="adl-app-welcome__version-menu-item-time">
                                  {time}
                                </span>
                              ) : null}
                            </div>
                            <div className="adl-app-welcome__version-menu-item-badges">
                              {isInstalled ? (
                                <span className="adl-app-welcome__version-menu-item-installed">
                                  {t.dshInstalledVersions}
                                </span>
                              ) : null}
                              {isCurrent ? (
                                <span className="adl-app-welcome__version-menu-item-check">
                                  <CheckIcon />
                                </span>
                              ) : null}
                              {isInstalled && !isCurrent ? (
                                <button
                                  type="button"
                                  className="adl-app-welcome__version-menu-item-uninstall"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleUninstallVersion(v);
                                  }}
                                  disabled={uninstallingVersion === v}
                                  title={t.dshUninstall}
                                >
                                  {uninstallingVersion === v ? (
                                    <Spinner size="sm" speed="normal" />
                                  ) : (
                                    <TrashIcon />
                                  )}
                                </button>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Reinstall — icon only */}
            <button
              type="button"
              className="adl-btn adl-btn--icon"
              onClick={handleReinstall}
              disabled={reinstalling}
              title={t.dshReinstallHint}
            >
              {reinstalling ? <Spinner size="sm" speed="normal" /> : <ReinstallIcon />}
            </button>

            {/* Check for updates — icon only */}
            <button
              type="button"
              className="adl-btn adl-btn--icon"
              onClick={handleCheckUpdate}
              disabled={checkingUpdate}
              title={t.dshCheckUpdate}
            >
              {checkingUpdate ? <Spinner size="sm" speed="normal" /> : <CheckUpdateIcon />}
            </button>

            {/* Download update — appears when hasUpdate */}
            {showDownloadIcon && !downloading ? (
              <button
                type="button"
                className="adl-btn adl-btn--icon adl-btn--accent"
                onClick={handleDownloadUpdate}
                title={t.dshUpdate}
              >
                <DownloadUpdateIcon />
              </button>
            ) : null}

            {/* Download in progress — spinner */}
            {downloading ? (
              <button type="button" className="adl-btn adl-btn--icon" disabled title={t.dshUpdate}>
                <Spinner size="sm" speed="normal" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Version management card */}
        <div className="adl-app-welcome__card">
          {/* Current version */}
          {currentSelected ? (
            <div className="adl-app-welcome__version">
              <div className="adl-app-welcome__row">
                <span>{t.dshVersion.replace('{version}', currentSelected)}</span>
                {hasUpdate ? (
                  <span className="adl-app-welcome__badge adl-app-welcome__badge--update">
                    {t.dshHasUpdate}
                  </span>
                ) : (
                  <span className="adl-app-welcome__badge">{t.dshNoUpdate}</span>
                )}
              </div>
            </div>
          ) : null}

          {/* Latest version */}
          {latestAvailable ? (
            <div className="adl-app-welcome__row">
              <span>{t.dshLatest.replace('{version}', latestAvailable)}</span>
            </div>
          ) : null}

          {/* Uninstall current version hint */}
          {uninstallConfirm && isCurrentSelected ? (
            <div className="adl-app-welcome__hint">
              <span>{t.dshUninstallCurrentHint}</span>
            </div>
          ) : null}

          {/* Action buttons */}
          <div className="adl-app-welcome__actions">
            {/* Upgrade (direct) */}
            {hasUpdate && !showDownloadIcon && !downloading ? (
              <button
                type="button"
                className="adl-btn adl-btn--primary"
                onClick={handleDownloadUpdate}
              >
                {t.dshUpdate}
              </button>
            ) : null}

            {/* Uninstall */}
            {currentSelected ? (
              uninstallConfirm ? (
                <button
                  type="button"
                  className="adl-btn adl-btn--danger"
                  onClick={handleConfirmUninstall}
                >
                  {t.dshUninstall}
                </button>
              ) : (
                <button
                  type="button"
                  className="adl-btn adl-btn--secondary"
                  onClick={handleUninstall}
                >
                  {t.dshUninstall}
                </button>
              )
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
