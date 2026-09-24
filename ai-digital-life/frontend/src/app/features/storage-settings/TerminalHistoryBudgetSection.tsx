import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { SettingsSelect } from '../../components/settings/SettingsSelect';
import {
  TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES,
  TERMINAL_HISTORY_BUDGET_FOLLOW_DISK,
  budgetBytesFromCustom,
  budgetBytesFromGb,
  budgetOptionsGb,
  budgetUnitMax,
  budgetUnitMin,
  clampBudgetBytes,
  formatBytesForBudgetUnit,
  isBudgetUnit,
  segmentBytes,
  type BudgetUnit,
} from '@features/terminal/terminalHistoryBudget';
import { terminalHistoryStore } from '@features/terminal/terminalHistoryStore';

const CUSTOM_VALUE = 'custom';
const FOLLOW_DISK_VALUE = 'follow-disk';

const GB = 1 << 30;
const MB = 1 << 20;

/** 与 SettingsControls 的 InputControl 一致：输入停顿 500ms 才写回，避免逐键提交。 */
const COMMIT_DEBOUNCE_MS = 500;

function formatBytes(bytes: number): string {
  if (bytes >= GB) {
    const gb = bytes / GB;
    return `${gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1)} GB`;
  }
  return `${Math.round(bytes / MB)} MB`;
}

/**
 * 「终端历史磁盘预算」区块（原「终端」设置组，Plan C Task 5 移入「存储」组）。
 *
 * 预算是**占用上限**而不是预留空间；低于上限永不自动删除；两种模式都至少保留最近 20 段
 * （见 terminalHistoryBudget 的淘汰实现）。这些语义都在文案里讲清楚，避免误读。
 *
 * 「当前已用」是本组件挂载时对各标签历史分段做的一次性本地聚合（sum of segmentBytes），
 * 不引入新的全局 store 字段：存储组每次选中都会重新挂载，天然是新鲜的。
 *
 * 「自定义…」不是偏好里的一种取值，而是界面上的一个编辑态：偏好里只存字节数，
 * 因此用本地 state 表达它，并在偏好落回档位/跟随磁盘时（含「重置全部」）收回编辑态。
 *
 * 自定义输入持有**本地草稿**（数值字符串 + 单位，仿树缓存自定义 TTL 的数值 + 秒/分/时/天），
 * 停顿 500ms（或失焦/回车）才提交，与 SettingsControls 的 InputControl 同构：偏好是
 * 不可乐观、不排队的外部状态，逐键写回会在并发 patch 被丢弃或写失败时把用户刚敲的字
 * 静默弹回。草稿只在偏好**真正变化**且变化非本组件自己回写时重新播种；**外部变化永远赢
 * 过在途草稿**（如「恢复默认」在用户打字中途点下：在途输入被丢弃、界面回到默认档，
 * 不让防抖到期的旧草稿把刚恢复的默认值覆盖掉）。
 */
export function TerminalHistoryBudgetSection() {
  const { t } = useTCopy();
  const configured = useAppStore((s) => s.appInfo?.config?.terminalHistoryBudgetBytes);

  const current = configured ?? TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES;
  const isFollowDisk = current === TERMINAL_HISTORY_BUDGET_FOLLOW_DISK;
  const isPreset = budgetOptionsGb.some((gb) => budgetBytesFromGb(gb) === current);
  const derivedCustom = !isFollowDisk && !isPreset;

  const [custom, setCustom] = useState(derivedCustom);
  const [draftUnit, setDraftUnit] = useState<BudgetUnit>('gb');
  const [draftValue, setDraftValue] = useState(() =>
    formatBytesForBudgetUnit(clampBudgetBytes(current), 'gb'),
  );

  /** 未提交的输入原文（+ 输入时单位）：非 null 表示有输入在途，此时草稿优先于偏好。 */
  const pendingRef = useRef<{ value: string; unit: BudgetUnit } | null>(null);
  /** 本组件刚提交的字节数：回写命中它说明这次变化是自己造成的，不据此重派编辑态。 */
  const selfCommitRef = useRef<number | null>(null);
  /** 上一次见过的偏好值：只有真正变化时才重播种（StrictMode 双跑 effect 时第二遍空转）。 */
  const prevCurrentRef = useRef(current);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = useCallback((bytes: number) => {
    void useAppStore.getState().updatePreferences({ terminalHistoryBudgetBytes: bytes });
  }, []);

  /** 丢弃在途的自定义输入（改选档位/跟随磁盘/外部变化接管时必须先调用，否则旧草稿会把新选择覆盖掉）。 */
  const cancelPending = useCallback(() => {
    pendingRef.current = null;
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
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending === null) {
      return;
    }
    // 空输入（清空后失焦/回车）不是"选 0"：回滚显示到当前偏好，不写桥（M3）。
    // 展示侧 limitLabel 已对空草稿回退 current，提交侧与之对齐。
    if (pending.value.trim() === '') {
      setDraftValue(formatBytesForBudgetUnit(clampBudgetBytes(current), pending.unit));
      return;
    }
    // 在途草稿自带单位提交，不受提交前最后一次切单位影响（仿树缓存 TTL）。
    const bytes = budgetBytesFromCustom(Number(pending.value), pending.unit);
    setDraftUnit(pending.unit);
    setDraftValue(formatBytesForBudgetUnit(bytes, pending.unit));
    selfCommitRef.current = bytes;
    apply(bytes);
  }, [apply, current]);

  const rearmTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(commitCustomBudget, COMMIT_DEBOUNCE_MS);
  }, [commitCustomBudget]);

  useEffect(() => {
    if (prevCurrentRef.current === current) {
      return;
    }
    prevCurrentRef.current = current;
    const isSelfEcho = selfCommitRef.current === current;
    selfCommitRef.current = null;
    if (isSelfEcho) {
      return;
    }
    // 外部变化（含「恢复默认」）赢过在途草稿：先丢弃，再重播种。
    cancelPending();
    setCustom(derivedCustom);
    setDraftValue(formatBytesForBudgetUnit(clampBudgetBytes(current), draftUnit));
  }, [current, derivedCustom, draftUnit, cancelPending]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCustomChange = (raw: string) => {
    setDraftValue(raw);
    pendingRef.current = { value: raw, unit: draftUnit };
    rearmTimer();
  };

  const handleUnitChange = (v: string) => {
    if (!isBudgetUnit(v)) {
      return;
    }
    // 切单位是继续编辑同一草稿：在途输入换算到新单位后显示与待提交一致，
    // 不丢草稿、不立即写桥（仍走防抖）；非法草稿则丢弃（仿树缓存 TTL）。
    const pending = pendingRef.current;
    if (pending !== null) {
      if (!Number.isFinite(Number(pending.value)) || Number(pending.value) <= 0) {
        cancelPending();
        setDraftUnit(v);
        setDraftValue(formatBytesForBudgetUnit(clampBudgetBytes(current), v));
        return;
      }
      const bytes = budgetBytesFromCustom(Number(pending.value), pending.unit);
      const converted = formatBytesForBudgetUnit(bytes, v);
      pendingRef.current = { value: converted, unit: v };
      setDraftValue(converted);
      rearmTimer();
    } else {
      // 无在途输入：同一预算按新单位换算显示，不提交。草稿非法（空/NaN）时
      // 不抬成下限，回退按当前偏好重显（与 limitLabel 的 B2 回退对齐，I7）。
      const draftNum = Number(draftValue);
      if (!Number.isFinite(draftNum) || draftValue.trim() === '') {
        setDraftValue(formatBytesForBudgetUnit(clampBudgetBytes(current), v));
      } else {
        const bytes = budgetBytesFromCustom(draftNum, draftUnit);
        setDraftValue(formatBytesForBudgetUnit(bytes, v));
      }
    }
    setDraftUnit(v);
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

  /** 自定义档下上限文案跟随草稿（草稿可能尚未提交）；跟随磁盘档下仍显示本地化模式名。
   * 草稿非法（空串/非数字）时回退显示当前偏好值，不显示钳制下限误导为「1 GB」（B2）。 */
  const draftBytes = Number(draftValue);
  const limitLabel =
    isFollowDisk && !custom
      ? t.settingsTerminalHistoryBudgetFollowDisk
      : formatBytes(
          custom && Number.isFinite(draftBytes) && draftValue.trim() !== ''
            ? budgetBytesFromCustom(draftBytes, draftUnit)
            : current,
        );

  const handleSelectChange = useCallback(
    (value: string) => {
      // 先丢弃在途的自定义输入，否则旧草稿会在防抖到期后覆盖掉这次选择。
      cancelPending();
      if (value === CUSTOM_VALUE) {
        setCustom(true);
        return;
      }
      setCustom(false);
      apply(value === FOLLOW_DISK_VALUE ? TERMINAL_HISTORY_BUDGET_FOLLOW_DISK : Number(value));
    },
    [apply, cancelPending],
  );

  const budgetOptions = useMemo(
    () => [
      ...budgetOptionsGb.map((gb) => ({
        value: String(budgetBytesFromGb(gb)),
        label: `${gb} GB`,
      })),
      { value: CUSTOM_VALUE, label: t.settingsTerminalHistoryBudgetCustom },
      { value: FOLLOW_DISK_VALUE, label: t.settingsTerminalHistoryBudgetFollowDisk },
    ],
    [t.settingsTerminalHistoryBudgetCustom, t.settingsTerminalHistoryBudgetFollowDisk],
  );

  const budgetUnitOptions = useMemo(
    () => [
      { value: 'mb', label: t.settingsTerminalHistoryBudgetUnitMb },
      { value: 'gb', label: t.settingsTerminalHistoryBudgetUnitGb },
    ],
    [t.settingsTerminalHistoryBudgetUnitMb, t.settingsTerminalHistoryBudgetUnitGb],
  );

  return (
    <div className="adl-settings-section adl-terminal-settings">
      {/* 预算行与下方「已用…」属同一语义分组：去分隔线、右侧控件垂直居中。 */}
      <div className="adl-settings-row adl-settings-row--path-center adl-settings-row--no-divider">
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{t.settingsTerminalHistoryBudget}</span>
          </div>
          <small>{t.settingsTerminalHistoryBudgetDesc}</small>
        </div>
        <div className="adl-settings-row__control adl-settings-row__control--inline">
          {custom ? (
            <>
              <input
                type="number"
                className="adl-settings-input adl-settings-input--narrow"
                min={budgetUnitMin(draftUnit)}
                max={budgetUnitMax(draftUnit)}
                step={1}
                value={draftValue}
                onChange={(e) => handleCustomChange(e.target.value)}
                onBlur={commitCustomBudget}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    commitCustomBudget();
                  }
                }}
              />
              {/* 自定义态顺序：数值 → 单位 → 默认选项（仿树缓存 TTL）。 */}
              <SettingsSelect
                value={draftUnit}
                options={budgetUnitOptions}
                onChange={handleUnitChange}
                label={t.settingsTerminalHistoryBudgetUnitLabel}
              />
            </>
          ) : null}
          <SettingsSelect
            value={selectValue}
            options={budgetOptions}
            onChange={handleSelectChange}
            label={t.settingsTerminalHistoryBudget}
          />
        </div>
      </div>

      {isFollowDisk && !custom ? (
        <div className="adl-settings-row adl-settings-row--no-divider">
          <div className="adl-settings-row__label">
            <small>{t.settingsTerminalHistoryBudgetFollowDiskDesc}</small>
          </div>
        </div>
      ) : null}

      <div className="adl-settings-row adl-settings-row--compact">
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
