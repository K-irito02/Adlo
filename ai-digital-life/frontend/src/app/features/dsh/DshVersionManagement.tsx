import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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
 * dsh 版本管理卡片（当前/最新版本 + 检查更新 / 升级 / 卸载 / 重装 / 版本选择）。
 *
 * 由中心 launcher 承载（原 `WelcomePage` 已随 dsh 统一为普通浏览器标签而退役）。
 * `leading` 渲染在顶部操作栏左侧（launcher 放三入口）；
 * 右侧为版本操作图标组，下方为版本信息卡片。
 *
 * 调用方契约：页面地标（带 `aria-label` 的 `section`）由调用方
 * （`CenterLauncherPage`）提供，本组件只渲染操作栏 + 版本卡片，不自建地标。
 *
 * 样式沿用 `adl-app-welcome__*`：本卡片历史上属于欢迎页，类名保留原命名以避免
 * 大面积样式回归（不改名）。
 */
export function DshVersionManagement({ leading }: { leading?: ReactNode }) {
  const { t } = useTCopy();
  const actions = useAppActions();
  const versionStatus = useAppStore((s) => s.versionStatus);
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
  const downloadingRef = useRef(false);
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

  // 有更新时自动显示下载图标（刻意只在 hasUpdate 翻转时评估一次：下载中/已显示
  // 不重复触发；通过 ref 读取最新状态，避免把 downloading/showDownloadIcon 加入
  // 依赖造成下载结束后图标循环重现）。
  useEffect(() => {
    if (hasUpdate && !downloadingRef.current && downloadTimerRef.current === null) {
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
      const ok = await actions.fetchDshVersionStatus();
      if (!ok) {
        // 失败已由 action 记录全局错误卡片，不再重复弹 toast。
        return;
      }
      const hasNewUpdate = useAppStore.getState().versionStatus?.hasUpdate;
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
      showToast(t.dshCheckUpdateFailed, 'error');
    } finally {
      checkingRef.current = false;
      setCheckingUpdate(false);
    }
  }, [actions, showToast, t]);

  const handleDownloadUpdate = useCallback(async () => {
    if (downloadingRef.current) {
      return;
    }
    downloadingRef.current = true;
    setDownloading(true);
    setShowDownloadIcon(false);
    if (downloadTimerRef.current) {
      clearTimeout(downloadTimerRef.current);
      downloadTimerRef.current = null;
    }
    try {
      const ok = await actions.updateDsh();
      if (ok) {
        showToast(t.dshUpdate, 'success');
      }
    } catch {
      // 意外异常兜底；常规失败已由 action 记录全局错误卡片。
      showToast(t.dshUpdateFailed, 'error');
    } finally {
      downloadingRef.current = false;
      setDownloading(false);
    }
  }, [actions, showToast, t]);

  const handleRevertToVersion = useCallback(
    async (version: string) => {
      if (revertingRef.current || version === currentSelected) {
        return;
      }
      revertingRef.current = true;
      setReverting(true);
      setShowVersionMenu(false);
      try {
        const ok = await actions.revertDsh(version);
        if (ok) {
          showToast(t.dshRevertedTo.replace('{version}', version), 'success');
        }
      } catch {
        // 意外异常兜底；常规失败已由 action 记录全局错误卡片。
        showToast(t.dshRevertFailed, 'error');
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
        const ok = await actions.uninstallDsh(version);
        if (ok) {
          showToast(t.dshUninstallSuccess.replace('{version}', version), 'success');
        }
      } catch {
        // 意外异常兜底；常规失败已由 action 记录全局错误卡片。
        showToast(t.dshUninstallFailed, 'error');
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
      const ok = await actions.reinstallDsh();
      if (ok) {
        showToast(t.dshReinstall, 'success');
      }
    } catch {
      // 意外异常兜底；常规失败已由 action 记录全局错误卡片。
      showToast(t.dshReinstallFailed, 'error');
    } finally {
      reinstallingRef.current = false;
      setReinstalling(false);
    }
  }, [actions, showToast, t]);

  const handleUninstall = useCallback(async () => {
    if (!currentSelected) {
      return;
    }
    if (isCurrentSelected) {
      setUninstallConfirm(true);
      return;
    }
    try {
      const ok = await actions.uninstallDsh(currentSelected);
      if (ok) {
        showToast(t.dshUninstallSuccess.replace('{version}', currentSelected), 'success');
      }
    } catch {
      // 意外异常兜底；常规失败已由 action 记录全局错误卡片。
      showToast(t.dshUninstallFailed, 'error');
    }
  }, [actions, currentSelected, isCurrentSelected, showToast, t]);

  const handleConfirmUninstall = useCallback(async () => {
    if (!currentSelected) {
      return;
    }
    setUninstallConfirm(false);
    try {
      const ok = await actions.uninstallDsh(currentSelected);
      if (ok) {
        showToast(t.dshUninstallSuccess.replace('{version}', currentSelected), 'success');
      }
    } catch {
      // 意外异常兜底；常规失败已由 action 记录全局错误卡片。
      showToast(t.dshUninstallFailed, 'error');
    }
  }, [actions, currentSelected, showToast, t]);

  useEffect(() => {
    void actions.fetchDshVersionStatus();
  }, [actions]);

  return (
    <>
      {/* Top action bar: leading slot left, version icon buttons right */}
      <div className="adl-app-welcome__topbar">
        {leading}

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
                            <span className="adl-app-welcome__version-menu-item-version">{v}</span>
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
    </>
  );
}
