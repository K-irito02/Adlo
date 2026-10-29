import { useTCopy } from '@i18n/useTCopy';
import { openUrlByMethod } from '@features/preview/openByMethod';

const NPM_PACKAGE_URL = 'https://www.npmjs.com/package/@deepseek-ai/dsh';
const GITHUB_RELEASES_URL = 'https://github.com/deepseek-ai/deepseek-harness';

/**
 * 「官方版本信息」行（旧 DSH 卡内末行）：说明文字内嵌与标题同色的链接，
 * 跟随「打开方式」网址落点跳转。由通用卡片渲染为卡内末行，不自带卡片容器。
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
  );
}
