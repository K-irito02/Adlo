import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import {
  TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES,
  TERMINAL_HISTORY_BUDGET_FOLLOW_DISK,
  segmentBytes,
} from '@features/terminal/terminalHistoryBudget';
import { terminalHistoryStore } from '@features/terminal/terminalHistoryStore';

/** 预设档位（GB）。1 GiB = 1 << 30，与偏好默认值口径一致。 */
export const budgetOptionsGb = [1, 2, 5, 10, 20];

export function budgetBytesFromGb(gb: number): number {
  return gb * (1 << 30);
}

const CUSTOM_VALUE = 'custom';
const FOLLOW_DISK_VALUE = 'follow-disk';

const GB = 1 << 30;
const MB = 1 << 20;

function formatBytes(bytes: number): string {
  if (bytes >= GB) {
    const gb = bytes / GB;
    return `${gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1)} GB`;
  }
  return `${Math.round(bytes / MB)} MB`;
}

/**
 * 「终端」设置组。
 *
 * 预算是**占用上限**而不是预留空间；低于上限永不自动删除；两种模式都至少保留最近 20 段
 * （见 terminalHistoryBudget 的淘汰实现）。这些语义都在文案里讲清楚，避免误读。
 *
 * 「当前已用」是本组件挂载时对各标签历史分段做的一次性本地聚合（sum of segmentBytes），
 * 不引入新的全局 store 字段：设置面板每次选中该组都会重新挂载，天然是新鲜的。
 *
 * 「自定义…」不是偏好里的一种取值，而是界面上的一个编辑态：偏好里只存字节数，
 * 因此用本地 state 表达它，并在偏好落回档位/跟随磁盘时（含「重置全部」）收回编辑态。
 */
export function TerminalSettings() {
  const { t } = useTCopy();
  const configured = useAppStore((s) => s.appInfo?.config?.terminalHistoryBudgetBytes);

  const current = configured ?? TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES;
  const isFollowDisk = current === TERMINAL_HISTORY_BUDGET_FOLLOW_DISK;
  const isPreset = budgetOptionsGb.some((gb) => budgetBytesFromGb(gb) === current);
  const derivedCustom = !isFollowDisk && !isPreset;

  const [custom, setCustom] = useState(derivedCustom);

  useEffect(() => {
    setCustom(derivedCustom);
  }, [derivedCustom]);

  const historyUsedBytes = useMemo(() => {
    let total = 0;
    const all = terminalHistoryStore.loadAll();
    for (const segments of Object.values(all)) {
      for (const seg of segments) {
        total += segmentBytes(seg);
      }
    }
    return total;
  }, []);

  const apply = (bytes: number) => {
    void useAppStore.getState().updatePreferences({ terminalHistoryBudgetBytes: bytes });
  };

  const selectValue = custom ? CUSTOM_VALUE : isFollowDisk ? FOLLOW_DISK_VALUE : String(current);

  return (
    <div className="adl-settings-section adl-terminal-settings">
      <SettingsHeader title={t.settingsTerminal} description={t.settingsTerminalHistoryGroupDesc} />

      <div className="adl-settings-row">
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{t.settingsTerminalHistoryBudget}</span>
          </div>
          <small>{t.settingsTerminalHistoryBudgetDesc}</small>
        </div>
        <div className="adl-settings-row__control">
          <select
            className="adl-settings-select"
            value={selectValue}
            onChange={(e) => {
              const value = e.target.value;
              if (value === CUSTOM_VALUE) {
                setCustom(true);
                return;
              }
              setCustom(false);
              apply(
                value === FOLLOW_DISK_VALUE ? TERMINAL_HISTORY_BUDGET_FOLLOW_DISK : Number(value),
              );
            }}
          >
            {budgetOptionsGb.map((gb) => (
              <option key={gb} value={budgetBytesFromGb(gb)}>
                {gb} GB
              </option>
            ))}
            <option value={CUSTOM_VALUE}>{t.settingsTerminalHistoryBudgetCustom}</option>
            <option value={FOLLOW_DISK_VALUE}>{t.settingsTerminalHistoryBudgetFollowDisk}</option>
          </select>

          {custom ? (
            <input
              type="number"
              className="adl-settings-input"
              min={1}
              max={2000}
              step={1}
              value={Math.max(1, Math.round(current / GB))}
              onChange={(e) => {
                const gb = Math.min(2000, Math.max(1, Number(e.target.value) || 1));
                apply(budgetBytesFromGb(gb));
              }}
            />
          ) : null}
        </div>
      </div>

      {isFollowDisk ? (
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <small>{t.settingsTerminalHistoryBudgetFollowDiskDesc}</small>
          </div>
        </div>
      ) : null}

      <div className="adl-settings-row">
        <div className="adl-settings-row__label">
          <small>
            {t.settingsTerminalHistoryBudgetUsed
              .replace('{used}', formatBytes(historyUsedBytes))
              .replace(
                '{limit}',
                isFollowDisk ? t.settingsTerminalHistoryBudgetFollowDisk : formatBytes(current),
              )}
          </small>
        </div>
      </div>
    </div>
  );
}
