import { useTCopy } from '@i18n/useTCopy';
import { openUrlByMethod } from '@features/preview/openByMethod';

/** 官方信息外链（npm 包页 + GitHub Releases），经 openExternal 双端跳转。 */
const NPM_PACKAGE_URL = 'https://www.npmjs.com/package/@deepseek-ai/dsh';
const GITHUB_RELEASES_URL = 'https://github.com/deepseek-ai/deepseek-harness/releases';

/** 「官方版本信息」行卡：说明 + 两个外链按钮。 */
export function DshOfficialLinksCard() {
  const { t } = useTCopy();
  return (
    <div className="adl-settings-card">
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
              onClick={() => openUrlByMethod(NPM_PACKAGE_URL)}
            >
              {t.dshNpmPage}
            </button>{' '}
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
    </div>
  );
}
