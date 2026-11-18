import { useCallback, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { openUrlByMethod } from '@features/preview/openByMethod';
import { ABOUT_URLS, MIT_LICENSE_TEXT } from './aboutContent';
import { CREDIT_GROUPS } from './creditsData';
import { THIRD_PARTY_NOTICES } from './thirdPartyNotices';
import { formatArch, formatOs } from './runtimeLabels';
import { AboutTextDialog } from './AboutTextDialog';
import { formatRelativeTime } from '@utils/relativeTime';

type AboutDialog = 'license' | 'credits' | 'notices' | null;

/**
 * 设置 ·「关于」组（Colophon 居中版，用户 2026-11-05 选定）。
 *
 * 事实边界：
 * - 只展示应用自身（版本 / 运行时 / 系统）与可核验链接，不展示 Node/Git 等
 *   工具链版本（那些属于「环境」组，且随用户安装时机变化）；
 * - 运行时取 `appInfo.runtime`（后端由壳层 / ad-server 分别填充），未知即「未知」；
 * - 许可与致谢是两个独立弹窗，内容不混排。
 */
export function AboutSettings() {
  const { t } = useTCopy();
  const { appInfo, showToast } = useAppStore(
    useShallow((state) => ({
      appInfo: state.appInfo,
      showToast: state.showToast,
    })),
  );
  const [dialog, setDialog] = useState<AboutDialog>(null);
  const {
    updateStatus,
    updateVersion,
    updateProgress,
    updateLastCheckedAt,
    updateUpToDate,
    updateSource,
    updateError,
    linkOpenMethod,
    checkAppUpdate,
    downloadAppUpdate,
    installAppUpdate,
  } = useAppStore(
    useShallow((state) => ({
      updateStatus: state.appUpdateStatus,
      updateVersion: state.appUpdateVersion,
      updateProgress: state.appUpdateProgress,
      updateLastCheckedAt: state.appUpdatePersisted.lastCheckedAt,
      updateUpToDate: state.appUpdateUpToDate,
      updateSource: state.appUpdateSource,
      updateError: state.appUpdateError,
      linkOpenMethod: state.appInfo?.config?.linkOpenMethod ?? 'panel',
      checkAppUpdate: state.checkAppUpdate,
      downloadAppUpdate: state.downloadAppUpdate,
      installAppUpdate: state.installAppUpdate,
    })),
  );
  const updateSupported =
    typeof window !== 'undefined' && window.digitalLife?.update?.supported === true;
  const updateBusy =
    updateStatus === 'checking' || updateStatus === 'downloading' || updateStatus === 'installing';

  const updatePercent =
    updateProgress?.total && updateProgress.total > 0
      ? Math.min(100, Math.round((updateProgress.downloaded / updateProgress.total) * 100))
      : null;

  const updateStatusText = (() => {
    if (!updateSupported) {
      return t.updateUnsupported;
    }
    switch (updateStatus) {
      case 'checking':
        return t.aboutUpdateChecking;
      case 'downloading':
        return formatT(t, 'updateDownloading', { percent: updatePercent ?? '…' });
      case 'available':
        return formatT(t, 'updateAvailableTitle', { version: updateVersion ?? '' });
      case 'downloaded':
        return t.updateReadyLine;
      case 'installing':
        return t.updateInstalling;
      case 'error':
        return t.updateCheckFailed;
      default: {
        const checked = updateLastCheckedAt
          ? formatT(t, 'aboutUpdateLastChecked', {
              time: formatRelativeTime(updateLastCheckedAt, t),
            })
          : '';
        if (updateUpToDate) {
          return checked ? `${t.aboutUpdateUpToDate} · ${checked}` : t.aboutUpdateUpToDate;
        }
        return checked || t.aboutUpdateNeverChecked;
      }
    }
  })();

  const handleUpdateAction = useCallback(() => {
    if (updateStatus === 'available') {
      void downloadAppUpdate();
      return;
    }
    if (updateStatus === 'downloaded') {
      void installAppUpdate();
      return;
    }
    void checkAppUpdate({ manual: true });
  }, [checkAppUpdate, downloadAppUpdate, installAppUpdate, updateStatus]);

  const handleOpenReleaseNotes = useCallback(() => {
    const releaseBase = updateSource?.includes('gitee.com')
      ? ABOUT_URLS.gitee
      : ABOUT_URLS.repository;
    openUrlByMethod(`${releaseBase}/releases`);
    const target =
      linkOpenMethod === 'external'
        ? t.updateNotesOpenedExternal
        : linkOpenMethod === 'middle'
          ? t.updateNotesOpenedMiddle
          : t.updateNotesOpenedPanel;
    showToast(formatT(t, 'updateNotesOpened', { target }), 'success');
  }, [linkOpenMethod, showToast, t, updateSource]);

  const runtime = appInfo?.runtime;
  const shellLabel = !runtime
    ? t.aboutUnknown
    : runtime.shell === 'tauri'
      ? formatT(t, 'aboutRuntimeTauri', { version: runtime.tauriVersion ?? t.aboutUnknown })
      : t.aboutRuntimeBrowser;
  const engineVersion = runtime?.webviewVersion ?? t.aboutUnknown;
  const systemLabel = `${formatOs(runtime?.os) ?? t.aboutUnknown} · ${
    formatArch(runtime?.arch) ?? t.aboutUnknown
  }`;

  const handleOpenLogs = useCallback(async () => {
    // 优先用后端解析出的「有效日志目录」：debug 构建写仓库根 .adl-logs，
    // release 才写数据根 logs。用存储分类路径会在 debug 下打开空目录。
    const effectiveLogDir = runtime?.logDir?.trim();
    if (effectiveLogDir) {
      const opened = await window.digitalLife.window.openPath(effectiveLogDir);
      if (!opened.ok) {
        showToast(t.operationFailed, 'error');
      }
      return;
    }
    const bridge = window.digitalLife?.storage;
    if (!bridge?.getStatus) {
      showToast(t.operationFailed, 'error');
      return;
    }
    try {
      const status = await bridge.getStatus();
      const logs = status.ok ? status.data.categories.find((item) => item.key === 'logs') : null;
      if (!logs?.path) {
        showToast(t.operationFailed, 'error');
        return;
      }
      const opened = await window.digitalLife.window.openPath(logs.path);
      if (!opened.ok) {
        showToast(t.operationFailed, 'error');
      }
    } catch {
      showToast(t.operationFailed, 'error');
    }
  }, [runtime?.logDir, showToast, t.operationFailed]);

  return (
    <div className="adl-about">
      <img className="adl-about__mark" src="/adlo-icon.png" alt="" aria-hidden="true" />
      <h2 className="adl-about__wordmark">
        {appInfo?.appName ?? 'Adlo'} · {t.aboutAppNameZh}
      </h2>
      <p className="adl-about__version">
        {formatT(t, 'aboutVersion', { version: appInfo?.version ?? t.aboutUnknown })}
      </p>

      <div className="adl-about__update">
        {updateSupported ? (
          <button
            type="button"
            className="adl-about__link"
            onClick={handleUpdateAction}
            disabled={updateBusy}
          >
            {updateStatus === 'available'
              ? t.updateDownload
              : updateStatus === 'downloaded'
                ? t.updateInstallNow
                : updateStatus === 'error'
                  ? t.aboutUpdateRetry
                  : t.aboutUpdateCheck}
          </button>
        ) : null}
        <span
          className={`adl-about__update-status${
            updateBusy ? ' adl-loading-row__text--shimmer' : ''
          }`}
        >
          {updateStatusText}
        </span>
      </div>
      {updateSupported && updateStatus === 'available' ? (
        <div className="adl-about__update-actions">
          <button type="button" className="adl-about__link" onClick={handleOpenReleaseNotes}>
            {t.updateViewNotes}
          </button>
        </div>
      ) : null}
      {updateSupported && updateStatus === 'error' && updateError ? (
        <p className="adl-about__update-warning">
          {updateError.length > 160 ? `${updateError.slice(0, 160)}…` : updateError}
        </p>
      ) : null}
      {updateSupported && updateStatus === 'downloaded' ? (
        <p className="adl-about__update-warning">{t.updateReadyWithHint}</p>
      ) : null}
      <p className="adl-about__line">{t.aboutTagline}</p>
      <p className="adl-about__line">{t.aboutLicenseLine}</p>

      <span className="adl-about__rule" aria-hidden="true" />

      <div className="adl-about__links">
        <button
          type="button"
          className="adl-about__link"
          onClick={() => openUrlByMethod(ABOUT_URLS.repository)}
        >
          {t.aboutRepository}
        </button>
        <button
          type="button"
          className="adl-about__link"
          onClick={() => openUrlByMethod(ABOUT_URLS.issues)}
        >
          {t.aboutIssues}
        </button>
      </div>

      <span className="adl-about__rule" aria-hidden="true" />

      <div className="adl-about__actions">
        <button type="button" className="adl-about__link" onClick={() => setDialog('license')}>
          {t.aboutLicense}
        </button>
        <button type="button" className="adl-about__link" onClick={() => setDialog('credits')}>
          {t.aboutCredits}
        </button>
        <button type="button" className="adl-about__link" onClick={() => setDialog('notices')}>
          {t.aboutThirdPartyNotices}
        </button>
      </div>

      <div className="adl-about__meta">
        <span>
          {shellLabel} · {t.aboutEngine} {engineVersion} · {t.aboutSystem} {systemLabel}
        </span>
        <span>
          <button type="button" className="adl-about__link" onClick={() => void handleOpenLogs()}>
            {t.aboutOpenLogsDir}
          </button>
        </span>
        <span className="adl-about__copyright">{t.aboutCopyright}</span>
      </div>

      {dialog === 'license' ? (
        <AboutTextDialog
          title={t.aboutLicenseTitle}
          subtitle={t.aboutLicenseSubtitle}
          wide
          onClose={() => setDialog(null)}
        >
          <pre className="adl-about-dialog__license">{MIT_LICENSE_TEXT}</pre>
        </AboutTextDialog>
      ) : null}

      {dialog === 'credits' ? (
        <AboutTextDialog
          title={t.aboutCreditsTitle}
          subtitle={t.aboutCreditsSubtitle}
          onClose={() => setDialog(null)}
        >
          {CREDIT_GROUPS.map((group) => (
            <section className="adl-about-credits" key={group.titleKey}>
              <h3 className="adl-about-credits__title">{t[group.titleKey]}</h3>
              <ul className="adl-about-credits__list">
                {group.items.map((item) => {
                  const url = item.url;
                  return (
                    <li className="adl-about-credits__item" key={item.name}>
                      <div className="adl-about-credits__head">
                        {url ? (
                          <button
                            type="button"
                            className="adl-about-credits__name adl-about-credits__link"
                            onClick={() => openUrlByMethod(url)}
                          >
                            {item.name}
                          </button>
                        ) : (
                          <span className="adl-about-credits__name">{item.name}</span>
                        )}
                        {item.license ? (
                          <span className="adl-about-credits__license">{item.license}</span>
                        ) : null}
                      </div>
                      <span className="adl-about-credits__desc">{t[item.detailKey]}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <p className="adl-about-credits__thanks">{t.aboutCreditsGeneralThanks}</p>
          <p className="adl-about-credits__trademark">{t.aboutCreditsTrademarkNote}</p>
        </AboutTextDialog>
      ) : null}

      {dialog === 'notices' ? (
        <AboutTextDialog
          title={t.aboutThirdPartyNoticesTitle}
          subtitle={t.aboutThirdPartyNoticesSubtitle}
          wide
          onClose={() => setDialog(null)}
        >
          {THIRD_PARTY_NOTICES.map((notice) => (
            <section className="adl-about-notice" key={notice.name}>
              <div className="adl-about-notice__head">
                <button
                  type="button"
                  className="adl-about-notice__name adl-about-credits__link"
                  onClick={() => openUrlByMethod(notice.url)}
                >
                  {notice.name}
                </button>
                <span className="adl-about-notice__license">{notice.license}</span>
              </div>
              <p className="adl-about-notice__meta">
                {notice.copyright ?? t.aboutNoticeNoCopyright}
              </p>
              <p className="adl-about-notice__desc">{t[notice.detailKey]}</p>
              <details className="adl-about-notice__details">
                <summary>{t.aboutNoticeLicenseText}</summary>
                <pre className="adl-about-dialog__license">{notice.text}</pre>
              </details>
            </section>
          ))}
          <p className="adl-about-notice__scope">{t.aboutThirdPartyNoticesScope}</p>
        </AboutTextDialog>
      ) : null}
    </div>
  );
}
