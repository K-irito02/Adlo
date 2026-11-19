import { useEffect, useMemo, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { openUrlByMethod } from '@features/preview/openByMethod';
import { THIRD_PARTY_NOTICES } from './thirdPartyNotices';
import { loadThirdPartyNoticeData } from './thirdPartyNoticeData';
import { filterNoticePackages } from './thirdPartyNoticeSearch';
import type { ThirdPartyNoticeData, ThirdPartyNoticePackage } from './thirdPartyNoticesTypes';

function NoticeTextBlocks({
  pkg,
  texts,
}: {
  pkg: ThirdPartyNoticePackage;
  texts: ThirdPartyNoticeData['licenseTexts'];
}) {
  return (
    <>
      {pkg.texts.map((ref) => (
        <div className="adl-about-notices__text" key={ref.key}>
          {pkg.texts.length > 1 ? (
            <span className="adl-about-notices__text-label">{ref.label}</span>
          ) : null}
          <pre className="adl-about-dialog__license">{texts[ref.key] ?? ''}</pre>
        </div>
      ))}
    </>
  );
}

function DependencyNotice({
  pkg,
  texts,
}: {
  pkg: ThirdPartyNoticePackage;
  texts: ThirdPartyNoticeData['licenseTexts'];
}) {
  const { t } = useTCopy();
  const meta = `${pkg.version} · ${pkg.ecosystem === 'cargo' ? 'Cargo' : 'npm'}`;
  const url = pkg.url;
  return (
    <li className="adl-about-notice adl-about-notice--dependency">
      <div className="adl-about-notice__head">
        {url ? (
          <button
            type="button"
            className="adl-about-notice__name adl-about-credits__link"
            onClick={() => openUrlByMethod(url)}
          >
            {pkg.name}
          </button>
        ) : (
          <span className="adl-about-notice__name">{pkg.name}</span>
        )}
        <span className="adl-about-notice__license">
          {pkg.license || t.aboutNoticesUnknownLicense}
        </span>
      </div>
      <p className="adl-about-notice__meta">{meta}</p>
      {pkg.copyright ? <p className="adl-about-notices__copyright">{pkg.copyright}</p> : null}
      {pkg.texts.length > 0 ? (
        <details className="adl-about-notice__details">
          <summary>{t.aboutNoticeLicenseText}</summary>
          {pkg.textSource === 'canonical' ? (
            <p className="adl-about-notices__note">{t.aboutNoticesCanonicalText}</p>
          ) : null}
          <NoticeTextBlocks pkg={pkg} texts={texts} />
        </details>
      ) : (
        <p className="adl-about-notices__missing">{t.aboutNoticesMissingText}</p>
      )}
    </li>
  );
}

/**
 * 「第三方声明」弹窗正文：随包素材/移植代码（人工维护）+ 全量依赖清单（生成）。
 *
 * 顶部提示把范围与统计合成一行；搜索框同时过滤人工条目与生成清单。
 * 全量数据按需加载；清单先截断到 200 条，再靠搜索缩小范围。缺失许可证、
 * 多许可证、缺少正文都按上游原文如实展示，不补造。
 */
export function ThirdPartyNoticesPanel() {
  const { t } = useTCopy();
  const [data, setData] = useState<ThirdPartyNoticeData | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    loadThirdPartyNoticeData().then(
      (loaded) => {
        if (alive) {
          setData(loaded);
        }
      },
      () => {
        if (alive) {
          setFailed(true);
        }
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  const curated = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === '') {
      return THIRD_PARTY_NOTICES;
    }
    return THIRD_PARTY_NOTICES.filter((notice) => {
      const description = t[notice.detailKey] ?? '';
      return (
        notice.name.toLowerCase().includes(needle) ||
        notice.license.toLowerCase().includes(needle) ||
        (notice.copyright ?? '').toLowerCase().includes(needle) ||
        description.toLowerCase().includes(needle)
      );
    });
  }, [query, t]);

  const result = useMemo(
    () => (data ? filterNoticePackages(data.packages, query) : null),
    [data, query],
  );

  const intro = data
    ? `${t.aboutThirdPartyNoticesSubtitle} · ${formatT(t, 'aboutNoticesTotals', {
        total: data.totals.total,
        unknown: data.totals.unknownLicense,
        missing: data.totals.missingText,
      })}`
    : t.aboutThirdPartyNoticesSubtitle;

  const noResults = data && curated.length === 0 && (result?.visible.length ?? 0) === 0;

  return (
    <div className="adl-about-notices">
      <div className="adl-about-notices__top">
        <p className="adl-about-notices__intro">{intro}</p>
        <input
          type="search"
          className="adl-about-notices__search"
          value={query}
          placeholder={t.aboutNoticesSearchPlaceholder}
          aria-label={t.aboutNoticesSearchPlaceholder}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {failed ? <p className="adl-about-notices__status">{t.aboutNoticesLoadFailed}</p> : null}
      {!failed && !data ? (
        <p className="adl-about-notices__status">{t.aboutNoticesLoading}</p>
      ) : null}
      {noResults ? <p className="adl-about-notices__status">{t.aboutNoticesNoResults}</p> : null}

      {curated.length > 0 ? (
        <section className="adl-about-notices__section">
          {curated.map((notice) => (
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
        </section>
      ) : null}

      {data && result && result.visible.length > 0 ? (
        <section className="adl-about-notices__section">
          <ul className="adl-about-notices__list">
            {result.visible.map((pkg) => (
              <DependencyNotice
                key={`${pkg.ecosystem}:${pkg.name}@${pkg.version}`}
                pkg={pkg}
                texts={data.licenseTexts}
              />
            ))}
          </ul>
          {result.truncated ? (
            <p className="adl-about-notices__note">
              {formatT(t, 'aboutNoticesShowingFirst', {
                shown: result.visible.length,
                total: result.matched.length,
              })}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
