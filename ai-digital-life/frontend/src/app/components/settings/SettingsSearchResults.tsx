import { useTCopy } from '@i18n/useTCopy';
import { EmptyRow } from '@components/LoadingRow';
import { SETTINGS_GROUPS } from './settingsGroups';
import { anchorFor, type SettingsSearchEntry } from './settingsSearchIndex';
import { highlightMatch } from './SettingsControls';

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
 * 命中词复用 `SettingsControls.highlightMatch`（单一口径）。无结果时回落共享空态。
 */
export function SettingsSearchResults({ entries, query, onSelect }: SettingsSearchResultsProps) {
  const { t } = useTCopy();

  if (entries.length === 0) {
    return (
      <EmptyRow
        message={t.settingsNoResults}
        variant="center"
        className="adl-settings-search-empty"
      />
    );
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
              {groupEntries.map((entry) => (
                <button
                  key={anchorFor(entry.group, entry.anchorId)}
                  type="button"
                  className="adl-settings-search-results__item"
                  onClick={() => onSelect(entry)}
                >
                  {highlightMatch(entry.label, query)}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
