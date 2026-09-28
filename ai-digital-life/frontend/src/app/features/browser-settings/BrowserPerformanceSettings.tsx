import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { DEFAULT_BROWSER_SUSPEND_MS } from '@shared/defaultPreferences';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { SettingsSelect } from '../../components/settings/SettingsSelect';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { IconResetDefaults } from '../../icons';
import {
  SUSPEND_PRESET_MS,
  formatMsForUnit,
  isSuspendPreset,
  isSuspendUnit,
  seedSuspendUnit,
  suspendMsFromCustom,
  suspendUnitMax,
  type SuspendUnit,
} from './suspendDuration';

/** 下拉「自定义…」选项值（非存储值；进入后由数值+单位输入承接编辑）。 */
const SUSPEND_SELECT_CUSTOM = 'custom';
/** 自定义输入防抖提交间隔（树缓存 TTL 同值，见 storage-settings StorageSettings）。 */
const SUSPEND_COMMIT_DEBOUNCE_MS = 500;

/**
 * 「标签挂起时长」块：块级 header（恢复默认图标 + 主标题）在卡片之外，
 * 卡内副标题保留标题、描述落在副标题下（用户指定布局）。
 * 恢复默认经确认对话框写 15 分钟产品默认（settingsResetGroupConfirm* 通用键，
 * WorkspaceSettings 块级确认同源）；自定义输入（秒/分/时/天）防抖提交，
 * 非档位存量值由自定义态承接、不吸附最近档。
 *
 * @param onOpenChange 确认对话框开合通知：父级（浏览器组）把它纳入组级恢复的
 * 入口守卫，避免键盘路径多框叠加（与 DownloadPathBlock 同构）。
 * @param anchor 搜索锚点：由父级按所在设置组传入，挂在块头容器上供「设置搜索」跳转。
 */
export function BrowserPerformanceSettings({
  onOpenChange,
  anchor,
}: {
  onOpenChange?: (open: boolean) => void;
  anchor?: string;
}) {
  const { t } = useTCopy();
  const showToast = useAppStore((s) => s.showToast);
  const isLoadingSettings = useAppStore((s) => s.isLoadingSettings);
  const raw = useAppStore((s) => s.appInfo?.config?.browserInactiveTabSuspendMs);
  // config 未加载回退产品默认（显示 15 分钟档；恢复按钮按 raw 判定 fail-open）。
  const currentMs = raw ?? DEFAULT_BROWSER_SUSPEND_MS;
  const isPreset = isSuspendPreset(currentMs);

  /** 自定义编辑态（本地草稿，不直接等于存储值）。 */
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [customUnit, setCustomUnit] = useState<SuspendUnit>('m');
  /** 在途自定义草稿（值 + 输入时单位 + 输入时外部值）：timer 到期按自带单位提交，
   * 不受后续切单位影响；提交前校验外部值未变——组级恢复等外部写入到达后，
   * 旧草稿必须丢弃而非覆盖新值（F1）。 */
  const pendingRef = useRef<{
    value: string;
    unit: SuspendUnit;
    base: number | undefined;
  } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    onOpenChange?.(confirm);
  }, [confirm, onOpenChange]);

  /** 恢复默认可用性：config 未加载（raw undefined）→ 未知不禁用（fail-open）；
   * 加载中禁用，与下载模式块口径一致（U2）。 */
  const atDefault = raw !== undefined && raw === DEFAULT_BROWSER_SUSPEND_MS;
  const resetDisabled = atDefault || isLoadingSettings;
  const showCustom = customMode || !isPreset;
  const selectValue = showCustom ? SUSPEND_SELECT_CUSTOM : String(currentMs);

  const writeSuspend = useCallback(
    async (ms: number): Promise<boolean> => {
      const ok = await useAppStore
        .getState()
        .updatePreferences({ browserInactiveTabSuspendMs: ms });
      if (!ok) {
        showToast(t.settingsUpdateFailed, 'error');
      }
      return ok;
    },
    [showToast, t],
  );

  const cancelPendingSuspend = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
  }, []);

  // 自定义防抖计时器卸载清理。
  useEffect(() => cancelPendingSuspend, [cancelPendingSuspend]);

  /** 外部值变化时同步自定义态：预设档退出自定义（组级恢复写默认即此路径），
   * 非档位按新值重播种，避免显示旧草稿。 */
  const syncDraftToExternal = useCallback((externalMs: number) => {
    if (isSuspendPreset(externalMs)) {
      setCustomMode(false);
      setCustomValue('');
      setCustomUnit('m');
      return;
    }
    const unit = seedSuspendUnit(externalMs);
    setCustomUnit(unit);
    setCustomValue(formatMsForUnit(externalMs, unit));
  }, []);

  const commitSuspendCustom = useCallback(() => {
    // 只清 timer、先读草稿再清 pending（顺序颠倒会把 pending 置空导致提交永空转）。
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending === null) {
      return;
    }
    // 提交前校验：草稿在途期间外部值若已变化（组级恢复写默认等），丢弃旧草稿
    // 并同步显示，不写桥（F1）。时序分工：raw effect 覆盖“外部已落盘”
    // （timer 后到期）；本校验覆盖“timer 抢跑”（raw 尚未变时放行，终态仍由
    // 后写的外部写入矫正）——两重缺一即 reopen 竞态，勿删其一（L5）。
    const latest = useAppStore.getState().appInfo?.config?.browserInactiveTabSuspendMs;
    if (pending.base !== undefined && latest !== undefined && latest !== pending.base) {
      syncDraftToExternal(latest);
      return;
    }
    // 按草稿自带单位换算（切单位后 timer 重排仍用旧单位口径，不错位）。
    const ms = suspendMsFromCustom(Number(pending.value), pending.unit);
    // 非法输入（空/0/负/NaN）静默丢弃不出桥：输入框保留草稿，继续键入即重新排队。
    if (ms === null) {
      return;
    }
    void writeSuspend(ms);
  }, [writeSuspend, syncDraftToExternal]);

  /** 重排防抖 timer（调用方已更新 pending；回调读 ref，单位恒新鲜）。 */
  const rearmSuspendTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(commitSuspendCustom, SUSPEND_COMMIT_DEBOUNCE_MS);
  }, [commitSuspendCustom]);

  const handleSelectChange = useCallback(
    (v: string) => {
      cancelPendingSuspend();
      if (v === SUSPEND_SELECT_CUSTOM) {
        setCustomMode(true);
        // Off（0ms）进自定义时播种产品默认：number input min=1，'0' 非法且与之矛盾（F6）。
        // 单位口径与非档位重播种一致（最大整单位），防漂移（L-4）。
        const seedMs = currentMs > 0 ? currentMs : DEFAULT_BROWSER_SUSPEND_MS;
        const seedUnit = seedSuspendUnit(seedMs);
        setCustomUnit(seedUnit);
        setCustomValue(formatMsForUnit(seedMs, seedUnit));
        return;
      }
      setCustomMode(false);
      setCustomValue('');
      const next = Number(v);
      if (!Number.isFinite(next)) {
        return;
      }
      void writeSuspend(next);
    },
    [cancelPendingSuspend, currentMs, writeSuspend],
  );

  const handleCustomChange = useCallback(
    (rawValue: string) => {
      setCustomValue(rawValue);
      pendingRef.current = { value: rawValue, unit: customUnit, base: raw };
      rearmSuspendTimer();
    },
    [customUnit, raw, rearmSuspendTimer],
  );

  const handleUnitChange = useCallback(
    (v: string) => {
      if (!isSuspendUnit(v)) {
        return;
      }
      // 切单位是继续编辑同一草稿：在途输入换算到新单位后显示与待提交一致，
      // 不丢草稿、不立即写桥（仍走防抖）；非法草稿则丢弃。
      const pending = pendingRef.current;
      if (pending !== null) {
        const ms = suspendMsFromCustom(Number(pending.value), pending.unit);
        if (ms === null) {
          cancelPendingSuspend();
        } else {
          const converted = formatMsForUnit(ms, v);
          pendingRef.current = { value: converted, unit: v, base: pending.base };
          setCustomValue(converted);
          rearmSuspendTimer();
        }
      } else if (customValue !== '') {
        // 无在途输入但有显示值（播种后未键入即切单位）：按旧单位换算显示，
        // 否则数字配新单位造成量级错位（U1：7 分钟切小时显示 "7" 即 7 小时）。
        const shown = Number(customValue);
        if (Number.isFinite(shown)) {
          const ms = suspendMsFromCustom(shown, customUnit);
          if (ms !== null) {
            setCustomValue(formatMsForUnit(ms, v));
          }
        }
      }
      setCustomUnit(v);
    },
    [cancelPendingSuspend, customUnit, customValue, rearmSuspendTimer],
  );

  // 后端合法但不在预设档的挂起时长（如 7 分钟）：进入自定义态时播种草稿
  // （不覆盖在途输入）——预设档永远显示档位、不吸附最近档。
  useEffect(() => {
    if (isPreset || pendingRef.current !== null || customMode) {
      return;
    }
    const unit = seedSuspendUnit(currentMs);
    setCustomUnit(unit);
    setCustomValue(formatMsForUnit(currentMs, unit));
  }, [isPreset, currentMs, customMode]);

  // 外部写入到达时（组级恢复写默认 / 他处修改）：丢弃在途草稿并同步显示（F1）。
  // 正常键入不改变 raw，不误杀；用户自己的提交先清 pending 再写桥，
  // raw 变化时显示已与新值一致，重播种为同一值（无闪动）。
  const prevRawRef = useRef(raw);
  useEffect(() => {
    if (prevRawRef.current === raw) {
      return;
    }
    prevRawRef.current = raw;
    if (pendingRef.current === null && !customMode) {
      return;
    }
    cancelPendingSuspend();
    if (raw === undefined) {
      return;
    }
    syncDraftToExternal(raw);
  }, [raw, customMode, cancelPendingSuspend, syncDraftToExternal]);

  /** 恢复默认：确认后写 15 分钟产品默认并退出自定义态；失败保持对话框供重试。
   * 草稿只在成功时清：失败保留用户输入，检查后可直接重试同一值（L-2）。 */
  const handleResetConfirm = useCallback(() => {
    cancelPendingSuspend();
    void writeSuspend(DEFAULT_BROWSER_SUSPEND_MS).then((ok) => {
      if (ok) {
        setCustomMode(false);
        setCustomValue('');
        setConfirm(false);
      }
    });
  }, [cancelPendingSuspend, writeSuspend]);

  // options 身份稳定，避免下游 SettingsSelect 订阅 effect 每渲染重绑监听。
  const selectOptions = useMemo(
    () => [
      ...SUSPEND_PRESET_MS.map((ms) => ({
        value: String(ms),
        label:
          ms === 0
            ? t.browserSettingsSuspendOff
            : t.browserSettingsSuspendMin.replace('{n}', String(ms / 60_000)),
      })),
      { value: SUSPEND_SELECT_CUSTOM, label: t.browserSettingsSuspendCustom },
    ],
    [t.browserSettingsSuspendOff, t.browserSettingsSuspendMin, t.browserSettingsSuspendCustom],
  );

  const unitOptions = useMemo(
    () => [
      { value: 's', label: t.browserSettingsSuspendUnitSecond },
      { value: 'm', label: t.browserSettingsSuspendUnitMinute },
      { value: 'h', label: t.browserSettingsSuspendUnitHour },
      { value: 'd', label: t.browserSettingsSuspendUnitDay },
    ],
    [
      t.browserSettingsSuspendUnitSecond,
      t.browserSettingsSuspendUnitMinute,
      t.browserSettingsSuspendUnitHour,
      t.browserSettingsSuspendUnitDay,
    ],
  );

  const resetLabel = formatT(t, 'settingsResetGroupToDefault', {
    group: t.browserSettingsSuspendTitle,
  });

  return (
    <>
      <div className="adl-settings-browser__header" data-settings-anchor={anchor}>
        <button
          type="button"
          className="adl-settings-row__reset"
          aria-label={resetLabel}
          title={resetLabel}
          data-testid="suspend-reset"
          disabled={resetDisabled}
          onClick={() => setConfirm(true)}
        >
          <IconResetDefaults size={14} decorative />
        </button>
        <SettingsHeader title={t.browserSettingsSuspendTitle} />
      </div>
      <div className="adl-settings-card adl-browser-settings">
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span>{t.browserSettingsSuspendTitle}</span>
            </div>
            <small>{t.browserSettingsSuspendDesc}</small>
          </div>
          <div className="adl-settings-row__control adl-settings-row__control--inline">
            {showCustom ? (
              <>
                <input
                  type="number"
                  className="adl-settings-input adl-settings-input--narrow"
                  min={1}
                  max={suspendUnitMax(customUnit)}
                  step={1}
                  aria-label={t.browserSettingsSuspendCustom}
                  value={customValue}
                  onChange={(e) => handleCustomChange(e.target.value)}
                  onBlur={commitSuspendCustom}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      commitSuspendCustom();
                    }
                  }}
                />
                <SettingsSelect
                  value={customUnit}
                  options={unitOptions}
                  onChange={handleUnitChange}
                  label={t.browserSettingsSuspendUnitLabel}
                />
              </>
            ) : null}
            {/* 默认选项下拉恒在最右（自定义态顺序：数值 → 单位 → 默认选项）。 */}
            <SettingsSelect
              value={selectValue}
              options={selectOptions}
              onChange={handleSelectChange}
              label={t.browserSettingsSuspendTitle}
              disabled={isLoadingSettings}
            />
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        title={formatT(t, 'settingsResetGroupConfirmTitle', {
          group: t.browserSettingsSuspendTitle,
        })}
        message={formatT(t, 'settingsResetGroupConfirmMessage', {
          group: t.browserSettingsSuspendTitle,
        })}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={handleResetConfirm}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}
