import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { SettingsHeader } from '@components/settings/SettingsHeader';
import { SettingsHintButton } from '@components/settings/SettingsHintButton';
import type {
  HarnessVersionBridge,
  HarnessVersionResult,
  HarnessVersionSourceMode,
  HarnessVersionSourceStatus,
  HarnessVersionTone,
} from './harnessVersionBridge';
import { useHarnessVersionData } from './hooks/useHarnessVersionData';
import {
  longestVersionOf,
  pickEffective,
  useHarnessVersionChannelMenu,
} from './hooks/useHarnessVersionChannelMenu';
import { useHarnessVersionActions } from './hooks/useHarnessVersionActions';
import { ChannelRow, ChannelSizer, type HarnessChannelTask } from './sub-components/ChannelRow';
import { InstalledVersionsCard } from './sub-components/InstalledVersionsCard';
import { ManualVersionRow } from './sub-components/ManualVersionRow';
import { ResetSourceRow } from './sub-components/ResetSourceRow';
import { SourceRow, SystemPathRow, type HarnessSourceOption } from './sub-components/SourceCard';
import { TaskRow } from './sub-components/TaskRow';
import { UpdateRow } from './sub-components/UpdateRow';
import {
  CurrentVersionRow,
  FallbackReadout,
  MissingBannerRow,
  type HarnessRowRefresh,
} from './sub-components/VersionStatusRows';

export interface HarnessVersionSlotContext<TSource> {
  /** 有任一版本操作进行中。 */
  busy: boolean;
  /** `busy` 或底层桥不可用；插槽内控件应使用它控制 disabled。 */
  disabled: boolean;
  source: HarnessVersionSourceStatus | null;
  /** 工具专属来源数据（适配器提供）。 */
  sourceExtra: TSource | null;
  /** 走卡片的忙碌/反馈/刷新流程执行一个工具专属操作。 */
  run: (
    action: () => Promise<HarnessVersionResult>,
    successMessage: string | null,
  ) => Promise<void>;
  notify: (message: string, tone: HarnessVersionTone) => void;
}

export type HarnessVersionSlot<TSource> =
  | ReactNode
  | ((context: HarnessVersionSlotContext<TSource>) => ReactNode);

export interface HarnessVersionSlots<TSource> {
  /** 宿主已自行渲染块头（标题 + 提示）时置 true，卡片不再重复渲染一块头。 */
  hideHeader?: boolean;
  /** 标题旁「?」提示内容；缺省使用通用说明。 */
  headerHint?: string;
  /** 版本来源行「?」提示内容；缺省使用通用说明。 */
  sourceHint?: string;
  /** 版本来源行描述小字；缺省不渲染。 */
  descSource?: string;
  /** 版本来源三态选项（工具术语不同时覆盖；缺省使用通用来源文案）。 */
  sourceOptions?: HarnessSourceOption[];
  /** 当前版本行「?」提示内容；缺省不渲染。 */
  currentHint?: string;
  /** 当前版本行描述小字；缺省不渲染。 */
  descCurrent?: string;
  /** 检查更新行「?」提示内容；缺省不渲染。 */
  checkHint?: string;
  /** 检查更新行描述小字；缺省不渲染。 */
  descCheck?: string;
  /** 正式版本行「?」提示内容；缺省不渲染。 */
  stableHint?: string;
  /** 正式版本行描述小字；缺省不渲染。 */
  descStable?: string;
  /** 预发布版本行「?」提示内容；缺省不渲染。 */
  prereleaseHint?: string;
  /** 预发布版本行描述小字；缺省不渲染。 */
  descPrerelease?: string;
  /** 未安装引导横幅；缺省使用带 `{tool}` 插值的通用文案。 */
  missingBanner?: HarnessVersionSlot<TSource>;
  /** 版本来源行内的说明行（工具专属来源解释，旧 DSH 行内警告口径）。 */
  sourceNote?: HarnessVersionSlot<TSource>;
  /** 来源行之后、当前版本行之前的工具专属行（如 OpenCode 的终端可用性开关）。 */
  sourceFooter?: HarnessVersionSlot<TSource>;
  /** 当前版本读数旁的运行态内容（DSH 的运行地址/系统安装读数）。 */
  runtimeReadout?: HarnessVersionSlot<TSource>;
  /** 「系统安装路径」行「?」提示内容；缺省不渲染。 */
  systemPathHint?: string;
  /** 「系统安装路径」行描述小字；缺省不渲染。 */
  systemPathDesc?: string;
  /** 「指定版本」行「?」提示内容；缺省不渲染。 */
  manualHint?: string;
  /** 「指定版本」行描述小字；缺省不渲染。 */
  descManual?: string;
  /** 卡片尾部内容（旧 DSH 官方版本信息行，渲染为卡内末行）。 */
  footer?: HarnessVersionSlot<TSource>;
}

export interface HarnessVersionCardProps<TSource = unknown> {
  bridge: HarnessVersionBridge<TSource>;
  slots?: HarnessVersionSlots<TSource>;
}

function renderSlot<TSource>(
  slot: HarnessVersionSlot<TSource> | undefined,
  context: HarnessVersionSlotContext<TSource>,
): ReactNode {
  if (typeof slot === 'function') {
    return slot(context);
  }
  return slot ?? null;
}

/**
 * 通用 harness 版本卡片（旧 DSH 版本管理块的单卡结构，可复用）：
 * 来源 → 当前版本 → 检查更新 → 正式版本 → 预发布版本 → 官方信息，
 * 行内通道选择器（菜单 Portal + 实测同宽）、行内任务、行内读数。
 *
 * 卡片只依赖 {@link HarnessVersionBridge} 与可选插槽，不读取任何 store，
 * 也不访问 `window.digitalLife`。状态/动作/菜单分别由 hooks 与子组件承载。
 * 手动版本行与已安装版本独立卡由 `capabilities.extraRows` 门控（缺省不渲染）。
 */
export function HarnessVersionCard<TSource = unknown>({
  bridge,
  slots = {},
}: HarnessVersionCardProps<TSource>) {
  const { t } = useTCopy();
  const data = useHarnessVersionData(bridge);
  const actions = useHarnessVersionActions({
    bridge,
    run: data.run,
    current: data.current,
    latestAvailable: data.status?.latestAvailable ?? null,
  });
  const menu = useHarnessVersionChannelMenu({
    current: data.current,
    stableInfos: data.stableInfos,
    prereleaseInfos: data.prereleaseInfos,
  });

  const stableEffective = pickEffective(data.stableInfos, menu.stableChoice, data.current);
  const prereleaseEffective = pickEffective(
    data.prereleaseInfos,
    menu.prereleaseChoice,
    data.current,
  );

  // 分腿刷新在途的行键（`current`/`check`/`stable`/`prerelease`；null = 空闲）。
  // 后端只有整快照重载口（`load` 三腿并发），分腿只是视觉口径：
  // 按钮转圈 + 该行控件区扫光，不展示中途值。
  const [refreshing, setRefreshing] = useState<string | null>(null);
  // 任一分腿刷新在途：行内变更按钮禁用，保证读数一致（DSH 无刷新按钮，恒 false）。
  const refreshBusy = refreshing !== null;
  // data 整对象每渲染更新身份：解构出稳定的 refresh 回调，避免按钮 props 无谓抖动。
  const { refresh: reloadSnapshot, disabled: cardDisabled } = data;
  const runRefresh = useCallback(
    async (leg: string) => {
      if (!bridge.available || cardDisabled || refreshing !== null) {
        return;
      }
      setRefreshing(leg);
      try {
        await reloadSnapshot();
      } finally {
        setRefreshing(null);
      }
    },
    [bridge.available, cardDisabled, reloadSnapshot, refreshing],
  );
  const showRefresh = bridge.capabilities?.refreshRows === true;
  const refreshFor = (leg: string, label: string): HarnessRowRefresh | undefined =>
    showRefresh
      ? { label, spinning: refreshing === leg, onRefresh: () => void runRefresh(leg) }
      : undefined;

  // 检查更新发现的新版本提示（标题下方蓝色小字；静默检查与手动检查共用，
  // 无新版本时不渲染）。两工具共用正式/预发布两套通用文案。
  const updateNote = (() => {
    if (!data.manageVisible) {
      return null;
    }
    const st = data.status;
    if (!st) {
      return null;
    }
    const notes: ReactNode[] = [];
    if (st.hasUpdate && st.latestAvailable) {
      notes.push(
        <small key="stable" className="adl-harness-version__row-warn">
          {formatT(t, 'harnessVersionUpdateFoundStable', { version: st.latestAvailable })}
        </small>,
      );
    }
    if (st.hasPrereleaseUpdate && st.prereleaseAvailable) {
      notes.push(
        <small key="prerelease" className="adl-harness-version__row-warn">
          {formatT(t, 'harnessVersionUpdateFoundPrerelease', { version: st.prereleaseAvailable })}
        </small>,
      );
    }
    return notes.length > 0 ? <>{notes}</> : null;
  })();

  // 冷启动骨架（会话内无快照种子时）：按关组前的来源偏好定形，
  // `system` 不含管理三行，其余按含画（自动解析为系统后行隐藏）。
  // peek 异常回退未知（骨架按含管理行画；失败态由快照 failed 支路承载，不走这里）。
  if (data.snapshot === null) {
    let skeletonManaged = true;
    try {
      skeletonManaged = (bridge.peekSourceMode?.() ?? 'auto') !== 'system';
    } catch {
      skeletonManaged = true;
    }
    const skeletonRows = [
      t.harnessVersionSourceTitle,
      t.harnessVersionCurrent,
      ...(skeletonManaged
        ? [t.harnessVersionUpdate, t.harnessVersionStable, t.harnessVersionPrerelease]
        : []),
    ];
    return (
      <div className="adl-harness-version">
        {slots.hideHeader ? null : (
          <div className="adl-settings-storage__header adl-settings-storage__header--section">
            <SettingsHintButton
              content={
                slots.headerHint ?? formatT(t, 'harnessVersionHint', { tool: bridge.toolName })
              }
            />
            <SettingsHeader title={formatT(t, 'harnessVersionTitle', { tool: bridge.toolName })} />
          </div>
        )}
        <div className="adl-settings-card" role="status" aria-label={t.harnessVersionLoading}>
          {skeletonRows.map((label) => (
            <div className="adl-settings-row" key={label}>
              <div className="adl-settings-row__label">
                <span className="adl-harness-version__skeleton-bar" aria-hidden="true" />
              </div>
              <div className="adl-settings-row__control">
                <span className="adl-harness-version__skeleton-control" aria-hidden="true" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const effectiveLabel = (() => {
    switch (data.source?.effective) {
      case 'running':
        return bridge.labels?.runningSource ?? t.harnessVersionSourceRunning;
      case 'host':
        return t.harnessVersionSourceHost;
      case 'system':
        return t.harnessVersionSourceSystem;
      default:
        return t.harnessVersionSourceNone;
    }
  })();

  const slotContext: HarnessVersionSlotContext<TSource> = {
    busy: data.busy,
    disabled: data.disabled,
    source: data.source,
    sourceExtra: data.sourceExtra,
    run: data.run,
    notify: bridge.notify,
  };

  const extraRows = bridge.capabilities?.extraRows ?? 'none';
  const showExtraRows = extraRows === 'manual+installed';
  const updateMode = bridge.capabilities?.updateAction ?? 'install';
  const runUpdateAction =
    updateMode === 'check'
      ? () => bridge.checkUpdate?.() ?? Promise.resolve({ ok: false })
      : () => bridge.update();
  const switchVersion = (version: string) =>
    void data.run(() => bridge.revert(version), t.harnessVersionSwitched, 'switch');
  const reinstallCurrent = () =>
    void data.run(() => bridge.reinstall(), t.harnessVersionReinstalled, 'reinstall');

  const showCounts =
    bridge.capabilities?.taskCounts === true &&
    data.hasLiveTask &&
    (data.shownTask?.phase === 'installing' || data.shownTask?.phase === 'removing');
  const channelTask = (effective: string | null): HarnessChannelTask | null => {
    const shown = data.shownTask;
    if (!shown || shown.version !== effective) {
      return null;
    }
    return {
      shownTask: shown,
      hasLiveTask: data.hasLiveTask,
      stageText: data.stageText,
      countsText:
        showCounts && shown.total > 0
          ? formatT(t, 'harnessVersionTaskCount', { done: shown.done, total: shown.total })
          : '',
      cancelLabel: data.cancelLabel,
      cancellable: shown.cancellable,
      onCancel: () => void bridge.cancel(),
    };
  };

  const sourceOptions: HarnessSourceOption[] = slots.sourceOptions ?? [
    { value: 'auto', label: t.harnessVersionSourceAuto },
    { value: 'system', label: t.harnessVersionSourceSystem },
    { value: 'host', label: t.harnessVersionSourceHost },
  ];

  const channelRow = (channel: 'stable' | 'prerelease') => (
    <ChannelRow
      channel={channel}
      title={
        (channel === 'stable' ? bridge.labels?.stable : bridge.labels?.prerelease) ??
        (channel === 'stable' ? t.harnessVersionStable : t.harnessVersionPrerelease)
      }
      hint={channel === 'stable' ? slots.stableHint : slots.prereleaseHint}
      desc={channel === 'stable' ? slots.descStable : slots.descPrerelease}
      infos={channel === 'stable' ? data.stableInfos : data.prereleaseInfos}
      effective={channel === 'stable' ? stableEffective : prereleaseEffective}
      current={data.current}
      installed={data.installed}
      unknown={data.channelUnknown}
      emptyText={
        channel === 'stable' ? t.harnessVersionStableEmpty : t.harnessVersionPrereleaseEmpty
      }
      disabled={data.disabled}
      // 任一分腿刷新在途时行内变更按钮禁用（读数一致性；DSH 无刷新按钮恒为 null，无影响）。
      refreshBusy={refreshBusy}
      refresh={refreshFor(
        channel,
        channel === 'stable' ? t.harnessVersionStable : t.harnessVersionPrerelease,
      )}
      spinning={refreshing === channel}
      menuOpen={menu.openChannel === channel}
      menuGeometry={menu.menuGeometry}
      menuPanelRef={menu.menuPanelRef}
      fixedWidth={channel === 'stable' ? menu.menuWidths.stable : menu.menuWidths.prerelease}
      task={channelTask(channel === 'stable' ? stableEffective : prereleaseEffective)}
      uninstallArmed={actions.uninstallArmed}
      onToggle={menu.toggleChannelMenu}
      onPick={menu.pickChannelVersion}
      onInstall={actions.installVersion}
      onUninstall={actions.handleUninstall}
      onReinstall={actions.handleVersionReinstall}
      onSwitch={switchVersion}
    />
  );

  return (
    <div className="adl-harness-version">
      {slots.hideHeader ? null : (
        <div className="adl-settings-storage__header adl-settings-storage__header--section">
          <SettingsHintButton
            content={
              slots.headerHint ?? formatT(t, 'harnessVersionHint', { tool: bridge.toolName })
            }
          />
          <SettingsHeader title={formatT(t, 'harnessVersionTitle', { tool: bridge.toolName })} />
        </div>
      )}

      <div className="adl-settings-card">
        <SourceRow
          mode={data.source?.mode ?? 'auto'}
          options={sourceOptions}
          hint={slots.sourceHint ?? t.harnessVersionSourceHint}
          desc={slots.descSource}
          disabled={data.disabled}
          note={renderSlot(slots.sourceNote, slotContext)}
          onChange={(mode: HarnessVersionSourceMode) => actions.handleSourceChange(mode)}
        />
        {showExtraRows ? (
          <SystemPathRow
            systemPath={data.source?.systemPath ?? null}
            systemVersion={data.source?.systemVersion ?? null}
            hint={slots.systemPathHint}
            desc={slots.systemPathDesc}
          />
        ) : null}
        {renderSlot(slots.sourceFooter, slotContext)}
        <CurrentVersionRow
          hint={slots.currentHint}
          desc={slots.descCurrent}
          updateNote={updateNote}
          disabled={data.disabled}
          refresh={refreshFor('current', t.harnessVersionCurrent)}
          spinning={refreshing === 'current'}
          uninstallWarn={
            actions.uninstallArmed !== null ? bridge.labels?.uninstallCurrentHint : undefined
          }
        >
          {renderSlot(slots.runtimeReadout, slotContext) ?? (
            <FallbackReadout
              current={data.current}
              effectiveLabel={effectiveLabel}
              failed={data.snapshot?.failed === true}
            />
          )}
        </CurrentVersionRow>
        {showExtraRows && data.manageVisible ? (
          <MissingBannerRow visible={data.status !== null && data.installed.length === 0}>
            {slots.missingBanner
              ? renderSlot(slots.missingBanner, slotContext)
              : formatT(t, 'harnessVersionMissingBanner', { tool: bridge.toolName })}
          </MissingBannerRow>
        ) : null}
        {data.manageVisible ? (
          <>
            <UpdateRow
              mode={updateMode}
              hasLatest={data.status?.latestAvailable != null}
              catalogFailed={data.snapshot?.catalogFailed === true}
              hasUpdate={data.status?.hasUpdate === true}
              hint={slots.checkHint}
              desc={slots.descCheck}
              disabled={data.disabled}
              refreshBusy={refreshBusy}
              refresh={refreshFor('check', t.harnessVersionUpdate)}
              onInstall={() => void data.run(runUpdateAction, t.harnessVersionUpdated, 'update')}
              onCheck={() => void data.run(runUpdateAction, null)}
            />
            {channelRow('stable')}
            {channelRow('prerelease')}
            {showExtraRows ? (
              <ManualVersionRow
                value={actions.manual}
                disabled={data.disabled}
                refreshBusy={refreshBusy}
                hint={slots.manualHint}
                desc={slots.descManual}
                onChange={actions.setManual}
                onInstall={actions.installManual}
              />
            ) : null}
          </>
        ) : null}
        {renderSlot(slots.footer, slotContext)}
      </div>

      {/* 测量尺挂卡外：行律契约要求末行是链接行本身（`:last-child` 收边）。
          尺子 `position:absolute + visibility:hidden`，不依赖卡片容器即可实测；
          放卡内时，无页脚槽的形态（OpenCode）末行收边失效、多出一条分隔线。 */}
      <ChannelSizer
        longestStable={longestVersionOf(data.stableInfos)}
        longestPrerelease={longestVersionOf(data.prereleaseInfos)}
        refs={menu.sizerRefs}
      />

      {showExtraRows && data.manageVisible ? (
        <InstalledVersionsCard
          installed={data.installed}
          current={data.current}
          disabled={data.disabled}
          uninstallArmed={actions.uninstallArmed}
          onSwitch={switchVersion}
          onUninstall={actions.handleUninstall}
          onReinstall={reinstallCurrent}
        />
      ) : null}

      {!data.channelPicker && data.shownTask ? (
        <TaskRow
          stageText={data.stageText}
          cancelLabel={data.cancelLabel}
          percent={data.shownTask.percent}
          done={data.shownTask.done}
          total={data.shownTask.total}
          hasLiveTask={data.hasLiveTask}
          cancellable={data.shownTask.cancellable}
          showPercent={bridge.capabilities?.taskPercent !== false}
          showCounts={showCounts}
          onCancel={() => void bridge.cancel()}
        />
      ) : null}

      {bridge.capabilities?.resetSourceAction !== false ? (
        <ResetSourceRow
          disabled={data.disabled}
          atDefault={data.source?.mode === 'auto'}
          onReset={() => void data.run(() => bridge.resetSourceMode(), t.harnessVersionResetDone)}
        />
      ) : null}
    </div>
  );
}
