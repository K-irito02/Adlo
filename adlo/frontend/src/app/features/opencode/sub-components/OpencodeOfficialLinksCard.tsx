import { useTCopy } from '@i18n/useTCopy';
import { openUrlByMethod } from '@features/preview/openByMethod';

const OFFICIAL_SITE_URL = 'https://opencode.ai';
const NPM_PACKAGE_URL = 'https://www.npmjs.com/package/opencode-ai';
const GITHUB_RELEASES_URL = 'https://github.com/anomalyco/opencode/releases';

/**
 * 「官方版本信息」行：说明文字内嵌与标题同色的链接，跟随「打开方式」网址落点跳转。
 * 链接之间用 `t.inlineLinkSeparator` 分隔（中文顿号 / 英文逗号），与提示小字一并说明官方渠道。
 */
export function OpencodeOfficialLinksCard() {
  const { t } = useTCopy();
  return (
    <div className="adl-settings-row" data-settings-row={t.opencodeOfficialLinksLabel}>
      <div className="adl-settings-row__label">
        <div className="adl-settings-row__label-text">
          <span>{t.opencodeOfficialLinksLabel}</span>
        </div>
        <small>
          {t.opencodeOfficialLinksDesc}{' '}
          <button
            type="button"
            className="adl-harness-version__inline-link"
            onClick={() => openUrlByMethod(OFFICIAL_SITE_URL)}
          >
            {t.opencodeOfficialSite}
          </button>
          {t.inlineLinkSeparator}
          <button
            type="button"
            className="adl-harness-version__inline-link"
            onClick={() => openUrlByMethod(NPM_PACKAGE_URL)}
          >
            {t.opencodeNpmPage}
          </button>
          {t.inlineLinkSeparator}
          <button
            type="button"
            className="adl-harness-version__inline-link"
            onClick={() => openUrlByMethod(GITHUB_RELEASES_URL)}
          >
            {t.opencodeGithubReleases}
          </button>
        </small>
      </div>
    </div>
  );
}
