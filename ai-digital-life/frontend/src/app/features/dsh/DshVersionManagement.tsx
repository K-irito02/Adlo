import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import { Spinner } from '@components/Spinner';
import { SettingsHintButton } from '@components/settings/SettingsHintButton';

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
const MENU_MAX_WIDTH = 340;
const MENU_MIN_WIDTH = 280;
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
 * dsh 版本管理块（当前版本行 + 版本操作行）。
 *
 * 由设置面板「DSH」设置组的「版本管理」块承载：与下载源/代理/测试连接三块同构，
 * 块头（`SettingsHeader`）在卡外，块体为一张 `adl-settings-card`（两行）——
 * 「当前版本」行右侧为版本读数（版本号 + 状态徽标 + 最新可用版本），
 * 「版本操作」行右侧为文字按钮组（回退版本 / 检查更新 / 升级到最新版 /
 * 重新安装 / 卸载版本）。两行副标题左侧带行内「?」提示图标（`SettingsHintButton`）。
 *
 * 调用方契约：本组件只渲染行卡片，不自建页面地标，也不渲染块头。
 */
export function DshVersionManagement() {
  const { t } = useTCopy();
  const actions = useAppActions();
  const versionStatus = useAppStore((s) => s.versionStatus);
  const showToast = useAppStore((s) => s.showToast);

  const [uninstallConfirm, setUninstallConfirm] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [reinstalling, setReinstalling] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showVersionMenu, setShowVersionMenu] = useState(false);
  const [uninstallingVersion, setUninstallingVersion] = useState<string | null>(null);
  const [menuGeometry, setMenuGeometry] = useState<MenuGeometry | null>(null);
  const checkingRef = useRef(false);
  const downloadingRef = useRef(false);
  const reinstallingRef = useRef(false);
  const revertingRef = useRef(false);
  const uninstallingRef = useRef<string | null>(null);
  const versionMenuRef = useRef<HTMLDivElement>(null);
  const versionMenuPanelRef = useRef<HTMLDivElement>(null);

  const currentSelected = versionStatus?.currentSelected ?? null;
  const latestAvailable = versionStatus?.latestAvailable ?? null;
  const hasUpdate = versionStatus?.hasUpdate ?? false;
  const installed = versionStatus?.installed ?? [];

  const isCurrentSelected = installed.includes(currentSelected ?? '') && currentSelected !== null;
  const hasMultipleVersions = installed.length > 1;
  // 任一版本操作在途时禁用全部操作按钮，避免并发卸载/回退/升级（防重入仅拦同种操作）。
  const versionBusy =
    checkingUpdate || downloading || reinstalling || reverting || uninstallingVersion !== null;

  // 构建菜单排序：当前版本 → 其余已装版本（保持后端顺序）→ 未装的最新版
  const sortedVersions = (() => {
    const installedSet = new Set(installed);
    const current = currentSelected ? [currentSelected] : [];
    const installedOthers = installed.filter((v) => v !== currentSelected);
    // 只有「最新可用版本」可能未安装：installed 的元素必然已在 installedSet 中。
    const notInstalled =
      latestAvailable && !installedSet.has(latestAvailable) ? [latestAvailable] : [];
    return [...current, ...installedOthers, ...notInstalled];
  })();

  // 目标版本变化（切换/回退/卸载完成）时清除卸载确认态，避免残留的 danger 样式
  // 指向新的当前版本。
  useEffect(() => {
    setUninstallConfirm(false);
  }, [currentSelected]);

  /**
   * 版本菜单几何：菜单经 Portal 挂到 body（fixed），不受设置面板滚动容器
   * （`.adl-settings-panel__content` overflow-y:auto）裁剪。右对齐触发器并钳制在视口内；
   * 下方空间不足则上翻并按上方高度收窄（同 SettingsSelect 口径）。
   */
  const updateMenuGeometry = useCallback(() => {
    const anchor = versionMenuRef.current;
    if (!anchor) {
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(
      MENU_MAX_WIDTH,
      Math.max(MENU_MIN_WIDTH, window.innerWidth - 2 * VIEWPORT_MARGIN),
    );
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
  }, []);

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
      if (
        versionMenuRef.current?.contains(target) ||
        versionMenuPanelRef.current?.contains(target)
      ) {
        return;
      }
      setShowVersionMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [showVersionMenu]);

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
    try {
      const ok = await actions.fetchDshVersionStatus();
      if (!ok) {
        // 失败已由 action 记录全局错误卡片，不再重复弹 toast。
        return;
      }
      const hasNewUpdate = useAppStore.getState().versionStatus?.hasUpdate;
      showToast(hasNewUpdate ? t.dshHasUpdate : t.dshNoUpdate, 'success');
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

  const handleUninstall = useCallback(() => {
    if (!currentSelected) {
      return;
    }
    // 当前版本卸载需二次确认（danger 态），确认后走 handleConfirmUninstall。
    if (isCurrentSelected) {
      setUninstallConfirm(true);
      return;
    }
    void runUninstall(currentSelected);
  }, [currentSelected, isCurrentSelected, runUninstall]);

  const handleConfirmUninstall = useCallback(() => {
    if (!currentSelected) {
      return;
    }
    setUninstallConfirm(false);
    void runUninstall(currentSelected);
  }, [currentSelected, runUninstall]);

  useEffect(() => {
    void actions.fetchDshVersionStatus();
  }, [actions]);

  return (
    <div className="adl-settings-card">
      {/* 行1：当前版本（副标题 + 提示图标；右侧版本号 + 更新徽标 + 最新可用版本）。 */}
      <div className="adl-settings-row" data-settings-row={t.dshCurrentVersionLabel}>
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <SettingsHintButton content={t.dshCurrentVersionHint} />
            <span>{t.dshCurrentVersionLabel}</span>
          </div>
          <small>{t.dshCurrentVersionDesc}</small>
        </div>
        <div className="adl-settings-row__control">
          <div className="adl-dsh-settings__version-readout">
            {currentSelected ? (
              <span className="adl-dsh-settings__version-value">
                {currentSelected}
                {hasUpdate ? (
                  <span className="adl-dsh-settings__badge adl-dsh-settings__badge--update">
                    {t.dshHasUpdate}
                  </span>
                ) : (
                  <span className="adl-dsh-settings__badge">{t.dshNoUpdate}</span>
                )}
              </span>
            ) : (
              <span className="adl-dsh-settings__version-value is-empty">
                {t.dshCurrentVersionNone}
              </span>
            )}
            {latestAvailable ? (
              <small className="adl-dsh-settings__version-latest">
                {t.dshLatest.replace('{version}', latestAvailable)}
              </small>
            ) : null}
          </div>
        </div>
      </div>

      {/* 行2：版本操作（副标题 + 提示图标；右侧文字按钮组）。 */}
      <div className="adl-settings-row" data-settings-row={t.dshVersionActions}>
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <SettingsHintButton content={t.dshVersionActionsHint} />
            <span>{t.dshVersionActions}</span>
          </div>
          <small>{t.dshVersionActionsDesc}</small>
          {uninstallConfirm && isCurrentSelected ? (
            <small className="adl-dsh-settings__row-warn">{t.dshUninstallCurrentHint}</small>
          ) : null}
        </div>
        <div className="adl-settings-row__control adl-dsh-settings__version-actions">
          {/* 版本选择/回退（多版本时）：文字按钮 + Portal 下拉菜单 */}
          {hasMultipleVersions ? (
            <div className="adl-dsh-settings__version-menu-anchor" ref={versionMenuRef}>
              <button
                type="button"
                className="adl-dsh-settings__action-btn"
                onClick={() => setShowVersionMenu((v) => !v)}
                disabled={versionBusy}
                aria-expanded={showVersionMenu}
                title={t.dshRevertHint}
              >
                {reverting ? <Spinner size="sm" speed="normal" /> : t.dshRevert}
              </button>
              {showVersionMenu && menuGeometry
                ? createPortal(
                    <div
                      ref={versionMenuPanelRef}
                      className="adl-dsh-settings__version-menu"
                      style={{
                        top: menuGeometry.top,
                        bottom: menuGeometry.bottom,
                        left: menuGeometry.left,
                        width: menuGeometry.width,
                      }}
                    >
                      <div
                        className="adl-dsh-settings__version-menu-list"
                        style={
                          menuGeometry.maxHeight != null
                            ? { maxHeight: menuGeometry.maxHeight - 8 }
                            : undefined
                        }
                      >
                        {sortedVersions.map((v) => {
                          const isCurrent = v === currentSelected;
                          const isInstalled = installed.includes(v);
                          const time = MOCK_VERSION_TIMELINE[v] ?? '';
                          const revertDisabled =
                            isCurrent || reverting || uninstallingVersion !== null;
                          return (
                            // 行容器为普通 <div>：回退与卸载是两个并列的原生 <button>，
                            // 避免「交互元素嵌套交互元素」（HTML 非法 / ARIA 子项被 presentational 吞掉）。
                            <div
                              key={v}
                              className={`adl-dsh-settings__version-menu-item${
                                isCurrent ? ' adl-dsh-settings__version-menu-item--current' : ''
                              }`}
                            >
                              <button
                                type="button"
                                className="adl-dsh-settings__version-menu-item-revert"
                                aria-current={isCurrent ? 'true' : undefined}
                                onClick={() => void handleRevertToVersion(v)}
                                disabled={revertDisabled}
                              >
                                <span className="adl-dsh-settings__version-menu-item-version">
                                  {v}
                                </span>
                                {time ? (
                                  <span className="adl-dsh-settings__version-menu-item-time">
                                    {time}
                                  </span>
                                ) : null}
                              </button>
                              <div className="adl-dsh-settings__version-menu-item-badges">
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
                                {isInstalled && !isCurrent ? (
                                  <button
                                    type="button"
                                    className="adl-dsh-settings__version-menu-item-uninstall"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void runUninstall(v);
                                    }}
                                    disabled={versionBusy}
                                    title={t.dshUninstall}
                                    aria-label={t.dshUninstall}
                                  >
                                    {uninstallingVersion === v ? (
                                      <Spinner size="sm" speed="normal" />
                                    ) : (
                                      <TrashIcon />
                                    )}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>,
                    document.body,
                  )
                : null}
            </div>
          ) : null}

          {/* 检查更新 */}
          <button
            type="button"
            className="adl-dsh-settings__action-btn"
            onClick={handleCheckUpdate}
            disabled={versionBusy}
            aria-label={checkingUpdate ? t.dshCheckUpdate : undefined}
          >
            {checkingUpdate ? <Spinner size="sm" speed="normal" /> : t.dshCheckUpdate}
          </button>

          {/* 升级到最新版 */}
          {hasUpdate ? (
            <button
              type="button"
              className="adl-dsh-settings__action-btn"
              onClick={handleDownloadUpdate}
              disabled={versionBusy}
              aria-label={downloading ? t.dshUpdate : undefined}
            >
              {downloading ? <Spinner size="sm" speed="normal" /> : t.dshUpdate}
            </button>
          ) : null}

          {/* 重新安装 */}
          <button
            type="button"
            className="adl-dsh-settings__action-btn"
            onClick={handleReinstall}
            disabled={versionBusy}
            aria-label={reinstalling ? t.dshReinstall : undefined}
          >
            {reinstalling ? <Spinner size="sm" speed="normal" /> : t.dshReinstall}
          </button>

          {/* 卸载版本 */}
          {currentSelected ? (
            <button
              type="button"
              className={`adl-dsh-settings__action-btn${
                uninstallConfirm ? ' adl-dsh-settings__action-btn--danger' : ''
              }`}
              onClick={uninstallConfirm ? handleConfirmUninstall : handleUninstall}
              disabled={versionBusy}
              aria-label={uninstallingVersion === currentSelected ? t.dshUninstall : undefined}
            >
              {uninstallingVersion === currentSelected ? (
                <Spinner size="sm" speed="normal" />
              ) : (
                t.dshUninstall
              )}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
