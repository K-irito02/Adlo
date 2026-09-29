import { useTCopy } from '@i18n/useTCopy';
import { EmptyRow } from '@components/LoadingRow';
import { SETTINGS_GROUPS } from './settingsGroups';
import { anchorFor, matchedDetail, type SettingsSearchEntry } from './settingsSearchIndex';
import { highlightMatch, detailWindow } from './settingsHighlight';

interface SettingsSearchResultsProps {
  /** 已按查询过滤的跨组索引条目（`filterSearchIndex` 输出）。 */
  entries: SettingsSearchEntry[];
  /** 当前查询串，用于命中词高亮。 */
  query: string;
  /** 点击某条结果：由面板负责收起搜索并跳转到该条目锚点。 */
  onSelect: (entry: SettingsSearchEntry) => void;
}

/**
 * 跨组搜索结果列表：按 `SETTINGS_GROUPS` 顺序分组，组标题取各组 `labelKey`，
 * 命中词复用共享 `settingsHighlight.highlightMatch`（单一口径）。无结果时回落共享空态。
 *
 * 结果行下方按需补显「命中行」（块主标题没命中、命中的是块内某行的副标题/提示说明时
 * 显示该行文案）—— 判定与面板的跳转落点共用 `settingsSearchIndex.matchedDetail`，防漂移。
 */
export function SettingsSearchResults({ entries, query, onSelect }: SettingsSearchResultsProps) {
  const { t } = useTCopy();

  if (entries.length === 0) {
    return <EmptyRow message={t.settingsNoResults} variant="center" />;
  }

  return (
    <div className="adl-settings-card adl-settings-search-results">
      {SETTINGS_GROUPS.map((group) => {
        const groupEntries = entries.filter((entry) => entry.group === group.id);
        if (groupEntries.length === 0) {
          return null;
        }
        return (
          <div key={group.id} className="adl-settings-search-results__group">
            <h3 className="adl-settings-search-results__title adl-settings-title--serif">
              {t[group.labelKey]}
            </h3>
            <div className="adl-settings-search-results__list">
              {groupEntries.map((entry) => {
                const detail = matchedDetail(entry, query);
                return (
                  <button
                    key={anchorFor(entry.group, entry.anchorId)}
                    type="button"
                    className="adl-settings-search-results__item"
                    onClick={() => onSelect(entry)}
                  >
                    <span className="adl-settings-search-results__label">
                      {highlightMatch(entry.label, query)}
                    </span>
                    {detail && (
                      <span className="adl-settings-search-results__detail">
                        {highlightMatch(detailWindow(detail.text, query), query)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
