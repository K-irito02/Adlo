import { useTCopy } from '@i18n/useTCopy';

interface LegacyChannelRowsProps {
  stable: { version: string }[];
  stablePick: string;
  latestPrerelease: { version: string } | null;
  disabled: boolean;
  onStablePick: (version: string) => void;
  onInstall: (version: string) => void;
}

/**
 * 无行内选择器时的通道行（OpenCode）：正式版单个下拉框 + 最新预发布一行。
 * DSH 走 `ChannelRow` 的双通道选择器。
 */
export function LegacyChannelRows({
  stable,
  stablePick,
  latestPrerelease,
  disabled,
  onStablePick,
  onInstall,
}: LegacyChannelRowsProps) {
  const { t } = useTCopy();
  return (
    <>
      <div className="adl-settings-row" data-settings-row={t.harnessVersionStable}>
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{t.harnessVersionStable}</span>
          </div>
        </div>
        <div className="adl-settings-row__control">
          <select
            className="adl-settings-dropdown"
            value={stablePick}
            disabled={disabled || stable.length === 0}
            onChange={(event) => onStablePick(event.target.value)}
          >
            {stable.map((info) => (
              <option key={info.version} value={info.version}>
                {info.version}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="adl-harness-version__action-btn"
            disabled={disabled || !stablePick}
            onClick={() => onInstall(stablePick)}
          >
            {t.harnessVersionInstall}
          </button>
        </div>
      </div>

      {latestPrerelease ? (
        <div className="adl-settings-row" data-settings-row={t.harnessVersionPrerelease}>
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span>{t.harnessVersionPrerelease}</span>
            </div>
          </div>
          <div className="adl-settings-row__control">
            <span className="adl-harness-version__value">{latestPrerelease.version}</span>
            <button
              type="button"
              className="adl-harness-version__action-btn"
              disabled={disabled}
              onClick={() => onInstall(latestPrerelease.version)}
            >
              {t.harnessVersionInstall}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
