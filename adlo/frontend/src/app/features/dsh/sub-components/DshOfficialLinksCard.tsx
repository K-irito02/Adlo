import { useTCopy } from '@i18n/useTCopy';
import { openUrlByMethod } from '@features/preview/openByMethod';

const OFFICIAL_SITE_URL = 'https://www.deepseek.com/harness';
const NPM_PACKAGE_URL = 'https://www.npmjs.com/package/@deepseek-ai/dsh';
const GITHUB_RELEASES_URL = 'https://github.com/deepseek-ai/deepseek-harness/releases';

/**
 * 「官方版本信息」行（旧 DSH 卡内末行）：说明文字内嵌与标题同色的链接，
 * 跟随「打开方式」网址落点跳转。由通用卡片渲染为卡内末行，不自带卡片容器。
 * 链接之间用 `t.inlineLinkSeparator` 分隔（中文顿号 / 英文逗号），与提示小字一并说明官方渠道。
 */
export function DshOfficialLinksCard() {
  const { t } = useTCopy();
  return (
    <div className="adl-settings-row" data-settings-row={t.dshOfficialLinksLabel}>
      <div className="adl-settings-row__label">
        <div className="adl-settings-row__label-text">
          <span>{t.dshOfficialLinksLabel}</span>
        </div>
        <small>
          {t.dshOfficialLinksDesc}{' '}
          <button
            type="button"
            className="adl-harness-version__inline-link"
            onClick={() => openUrlByMethod(OFFICIAL_SITE_URL)}
          >
            {t.dshOfficialSite}
          </button>
          {t.inlineLinkSeparator}
          <button
            type="button"
            className="adl-harness-version__inline-link"
            onClick={() => openUrlByMethod(NPM_PACKAGE_URL)}
          >
            {t.dshNpmPage}
          </button>
          {t.inlineLinkSeparator}
          <button
            type="button"
            className="adl-harness-version__inline-link"
            onClick={() => openUrlByMethod(GITHUB_RELEASES_URL)}
          >
            {t.dshGithubReleases}
          </button>
        </small>
      </div>
    </div>
  );
}
