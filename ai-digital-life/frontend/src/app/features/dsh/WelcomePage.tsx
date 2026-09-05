import { useCallback, useEffect } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';

/**
 * 中间区欢迎引导页（dsh 关闭后显示）。
 * - 主导按钮"打开 DeepSeek Harness" → 进入中间区 dsh。
 * - 版本管理区：当前版本/最新版本/有更新徽标 + 升级 / 重装 / 卸载当前选中。
 * - 加载时拉取 dsh 版本状态。
 */
export function WelcomePage() {
  const { t } = useTCopy();
  const actions = useAppActions();
  const versionStatus = useAppStore((s) => s.versionStatus);
  const appReady = useAppStore((s) => s.appReady);

  const handleOpen = useCallback(() => {
    void actions.openDsh();
  }, [actions]);

  useEffect(() => {
    void actions.fetchDshVersionStatus();
  }, [actions]);

  const currentSelected = versionStatus?.currentSelected ?? null;
  const latestAvailable = versionStatus?.latestAvailable ?? null;
  const hasUpdate = versionStatus?.hasUpdate ?? false;
  const installed = versionStatus?.installed ?? [];

  return (
    <section className="adl-center adl-center--dsh-placeholder" aria-label={t.dshTitle}>
      <div className="welcome-state dsh-welcome">
        {appReady ? (
          <button
            type="button"
            className="welcome-state__primary-btn"
            onClick={handleOpen}
            title={t.dshOpenButtonHint}
          >
            {t.dshOpenButton}
          </button>
        ) : null}

        <div className="dsh-welcome__version">
          {currentSelected ? (
            <div className="dsh-welcome__row">
              <span>{t.dshVersion.replace('{version}', currentSelected)}</span>
              {hasUpdate ? (
                <span className="dsh-welcome__badge dsh-welcome__badge--update">
                  {t.dshHasUpdate}
                </span>
              ) : (
                <span className="dsh-welcome__badge">{t.dshNoUpdate}</span>
              )}
            </div>
          ) : null}
          {latestAvailable ? (
            <div className="dsh-welcome__row">
              <span>{t.dshLatest.replace('{version}', latestAvailable)}</span>
            </div>
          ) : null}

          <div className="dsh-welcome__actions">
            {hasUpdate ? (
              <button
                type="button"
                className="adl-btn adl-btn--primary"
                onClick={() => void actions.updateDsh()}
              >
                {t.dshUpdate}
              </button>
            ) : null}
            <button
              type="button"
              className="adl-btn adl-btn--secondary"
              onClick={() => void actions.reinstallDsh()}
            >
              {t.dshReinstall}
            </button>
            {currentSelected ? (
              <button
                type="button"
                className="adl-btn adl-btn--secondary"
                onClick={() => void actions.uninstallDsh(currentSelected)}
              >
                {t.dshUninstall}
              </button>
            ) : null}
          </div>

          {installed.length > 0 ? (
            <div className="dsh-welcome__installed">
              <span>{t.dshInstalledVersions}</span>
              <ul>
                {installed.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}