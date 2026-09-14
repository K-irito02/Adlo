import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const MIN_BUDGET_GB = 1;
const MAX_BUDGET_GB = 2000;

/** 与 SettingsControls 的 InputControl 一致：输入停顿 500ms 才写回，避免逐键提交。 */
const COMMIT_DEBOUNCE_MS = 500;

function clampGb(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_BUDGET_GB;
  }
  return Math.min(MAX_BUDGET_GB, Math.max(MIN_BUDGET_GB, Math.round(value)));
}

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
 *
 * 自定义输入持有**本地草稿**（GB 字符串），停顿 500ms（或失焦/回车）才提交，与
 * SettingsControls 的 InputControl 同构：偏好是不可乐观、不排队的外部状态，逐键写回会在
 * 并发 patch 被丢弃或写失败时把用户刚敲的字静默弹回。草稿只在偏好**真正变化**且没有
 * 输入在途时重新播种；本组件自己提交造成的回写不会重派编辑态，否则敲出恰好等于档位的值
 * 会让输入框在编辑中途卸载。
 */
export function TerminalSettings() {
  const { t } = useTCopy();
  const configured = useAppStore((s) => s.appInfo?.config?.terminalHistoryBudgetBytes);

  const current = configured ?? TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES;
  const isFollowDisk = current === TERMINAL_HISTORY_BUDGET_FOLLOW_DISK;
  const isPreset = budgetOptionsGb.some((gb) => budgetBytesFromGb(gb) === current);
  const derivedCustom = !isFollowDisk && !isPreset;
  const persistedGb = clampGb(current / GB);

  const [custom, setCustom] = useState(derivedCustom);
  const [draftGb, setDraftGb] = useState(() => String(persistedGb));

  /** 未提交的输入原文：非 null 表示有输入在途，此时草稿优先于偏好。 */
  const pendingGbRef = useRef<string | null>(null);
  /** 本组件刚提交的字节数：回写命中它说明这次变化是自己造成的，不据此重派编辑态。 */
  const selfCommitRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (pendingGbRef.current !== null) {
      return;
    }
    const isSelfEcho = selfCommitRef.current === current;
    selfCommitRef.current = null;
    if (isSelfEcho) {
      return;
    }
    setCustom(derivedCustom);
    setDraftGb(String(persistedGb));
  }, [current, derivedCustom, persistedGb]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const apply = useCallback((bytes: number) => {
    void useAppStore.getState().updatePreferences({ terminalHistoryBudgetBytes: bytes });
  }, []);

  /** 丢弃在途的自定义输入（改选档位/跟随磁盘时必须先调用，否则旧草稿会把新选择覆盖掉）。 */
  const cancelPending = useCallback(() => {
    pendingGbRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const commitCustomBudget = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const raw = pendingGbRef.current;
    pendingGbRef.current = null;
    if (raw === null) {
      return;
    }
    const gb = clampGb(Number(raw));
    const bytes = budgetBytesFromGb(gb);
    setDraftGb(String(gb));
    selfCommitRef.current = bytes;
    apply(bytes);
  }, [apply]);

  const handleCustomChange = (raw: string) => {
    setDraftGb(raw);
    pendingGbRef.current = raw;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(commitCustomBudget, COMMIT_DEBOUNCE_MS);
  };

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

  const selectValue = custom ? CUSTOM_VALUE : isFollowDisk ? FOLLOW_DISK_VALUE : String(current);

  /** 自定义档下上限文案跟随草稿（草稿可能尚未提交）；跟随磁盘档下仍显示本地化模式名。 */
  const limitLabel =
    isFollowDisk && !custom
      ? t.settingsTerminalHistoryBudgetFollowDisk
      : formatBytes(custom ? budgetBytesFromGb(clampGb(Number(draftGb))) : current);

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
              // 先丢弃在途的自定义输入，否则旧草稿会在防抖到期后覆盖掉这次选择。
              cancelPending();
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
              min={MIN_BUDGET_GB}
              max={MAX_BUDGET_GB}
              step={1}
              value={draftGb}
              onChange={(e) => handleCustomChange(e.target.value)}
              onBlur={commitCustomBudget}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitCustomBudget();
                }
              }}
            />
          ) : null}
        </div>
      </div>

      {isFollowDisk && !custom ? (
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
              .replace('{limit}', limitLabel)}
          </small>
        </div>
      </div>
    </div>
  );
}
