import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { SettingsHeader } from '../../components/settings/SettingsHeader';

const MINUTE_MS = 60_000;
// { min: number | null } — null means Off (0).
const OPTIONS: { min: number | null; value: number }[] = [
  { min: null, value: 0 },
  { min: 5, value: 5 * MINUTE_MS },
  { min: 15, value: 15 * MINUTE_MS },
  { min: 30, value: 30 * MINUTE_MS },
  { min: 60, value: 60 * MINUTE_MS },
  { min: 120, value: 120 * MINUTE_MS },
];

// F-L2：把存储值映射到可显示的档位值——undefined（AppInfo 未加载）回退到 60 分钟档，
// 非档位值回退到最近档位，避免闪"Off"或 select 显示空白。
function nearestSuspendMs(raw: number | undefined): number {
  if (raw === undefined) {
    return 60 * MINUTE_MS;
  }
  const exact = OPTIONS.find((o) => o.value === raw);
  if (exact) {
    return exact.value;
  }
  return OPTIONS.reduce(
    (best, o) => (Math.abs(o.value - raw) < Math.abs(best.value - raw) ? o : best),
    OPTIONS[0],
  ).value;
}

export function BrowserPerformanceSettings() {
  const { t } = useTCopy();
  const current = nearestSuspendMs(
    useAppStore((s) => s.appInfo?.config?.browserInactiveTabSuspendMs),
  );

  const handleChange = (ms: number) => {
    useAppStore.getState().updatePreferences({ browserInactiveTabSuspendMs: ms });
  };

  return (
    <div className="adl-settings-section adl-browser-settings">
      <SettingsHeader
        title={t.browserSettingsSuspendTitle}
        description={t.browserSettingsSuspendDesc}
      />
      <div className="adl-settings-row">
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{t.browserSettingsSuspendTitle}</span>
          </div>
        </div>
        <div className="adl-settings-row__control">
          <select
            className="adl-settings-select"
            value={String(current)}
            onChange={(e) => handleChange(Number(e.target.value))}
          >
            {OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.min === null
                  ? t.browserSettingsSuspendOff
                  : t.browserSettingsSuspendMin.replace('{n}', String(opt.min))}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
