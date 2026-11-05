import { useCallback, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { openUrlByMethod } from '@features/preview/openByMethod';
import type { CopyKey } from '@i18n/types';
import { ABOUT_URLS, MIT_LICENSE_TEXT } from './aboutContent';
import { formatArch, formatOs } from './runtimeLabels';
import { AboutTextDialog } from './AboutTextDialog';

type AboutDialog = 'license' | 'credits' | null;

interface CreditItem {
  name: string;
  detailKey: CopyKey;
}

/** 致谢只列**真实使用**的字体 / 组件 / 外部工具；许可条款留给发布前的第三方声明。 */
const CREDIT_GROUPS: { titleKey: CopyKey; items: CreditItem[] }[] = [
  {
    titleKey: 'aboutCreditsFonts',
    items: [
      { name: 'Inter', detailKey: 'aboutCreditsInter' },
      { name: 'JetBrains Mono', detailKey: 'aboutCreditsJetbrains' },
    ],
  },
  {
    titleKey: 'aboutCreditsComponents',
    items: [
      { name: 'Tauri', detailKey: 'aboutCreditsTauri' },
      { name: 'React', detailKey: 'aboutCreditsReact' },
      { name: 'CodeMirror', detailKey: 'aboutCreditsCodemirror' },
      { name: 'xterm.js', detailKey: 'aboutCreditsXterm' },
      { name: 'markdown-it · Starry Night', detailKey: 'aboutCreditsMarkdown' },
      { name: 'Zustand', detailKey: 'aboutCreditsZustand' },
      { name: 'Lucide', detailKey: 'aboutCreditsLucide' },
    ],
  },
  {
    titleKey: 'aboutCreditsTools',
    items: [{ name: 'DSH · OpenCode CLI', detailKey: 'aboutCreditsHarness' }],
  },
];

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
      <p className="adl-about__line">{t.aboutTagline}</p>
      <p className="adl-about__line">{t.aboutLicenseLine}</p>

      <span className="adl-about__rule" aria-hidden="true" />

      <div className="adl-about__links">
        <button
          type="button"
          className="adl-about__link"
          onClick={() => openUrlByMethod(ABOUT_URLS.website)}
        >
          {t.aboutWebsite}
        </button>
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
                {group.items.map((item) => (
                  <li className="adl-about-credits__item" key={item.name}>
                    <span className="adl-about-credits__name">{item.name}</span>
                    <span className="adl-about-credits__desc">{t[item.detailKey]}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </AboutTextDialog>
      ) : null}
    </div>
  );
}
