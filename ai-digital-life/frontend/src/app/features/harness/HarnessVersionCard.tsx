import type { ReactNode } from 'react';
import { useTCopy } from '@i18n/useTCopy';
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
  pickEffective,
  useHarnessVersionChannelMenu,
} from './hooks/useHarnessVersionChannelMenu';
import { useHarnessVersionActions } from './hooks/useHarnessVersionActions';
import { ChannelRow } from './sub-components/ChannelRow';
import { InstalledVersionsCard } from './sub-components/InstalledVersionsCard';
import { LegacyChannelRows } from './sub-components/LegacyChannelRows';
import { ManualVersionRow } from './sub-components/ManualVersionRow';
import { ResetSourceRow } from './sub-components/ResetSourceRow';
import { SourceCard } from './sub-components/SourceCard';
import { TaskRow } from './sub-components/TaskRow';
import { UpdateRow } from './sub-components/UpdateRow';
import { CurrentVersionRow, StatusRows } from './sub-components/VersionStatusRows';

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
  /** 未安装引导横幅；缺省使用带 `{tool}` 插值的通用文案。 */
  missingBanner?: HarnessVersionSlot<TSource>;
  /** 来源卡片内的说明行（工具专属来源解释）。 */
  sourceNote?: HarnessVersionSlot<TSource>;
  /** 来源卡片尾部的工具内容（如 OpenCode 的终端可用性开关）。 */
  sourceFooter?: HarnessVersionSlot<TSource>;
  /** 当前版本读数旁的运行态内容（DSH 的运行地址/系统安装读数）。 */
  runtimeReadout?: HarnessVersionSlot<TSource>;
  /** 卡片尾部内容。 */
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
 * 通用 harness 版本卡片：安装/更新/切换/卸载/重装、稳定与预发布通道、
 * 手动版本号、来源三态、任务进度与取消。
 *
 * 卡片只依赖 {@link HarnessVersionBridge} 与可选插槽，不读取任何 store，
 * 也不访问 `window.digitalLife`。状态/动作/菜单分别由 hooks 与子组件承载。
 */
export function HarnessVersionCard<TSource = unknown>({
  bridge,
  slots = {},
}: HarnessVersionCardProps<TSource>) {
  const { t, formatT } = useTCopy();
  const data = useHarnessVersionData(bridge);
  const actions = useHarnessVersionActions({
    bridge,
    run: data.run,
    current: data.current,
    latestAvailable: data.status?.latestAvailable ?? null,
  });
  const menu = useHarnessVersionChannelMenu(data.current);

  const stableEffective = pickEffective(data.stableInfos, menu.stableChoice, data.current);
  const prereleaseEffective = pickEffective(
    data.prereleaseInfos,
    menu.prereleaseChoice,
    data.current,
  );

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

  const updateMode = bridge.capabilities?.updateAction ?? 'install';
  const runUpdateAction =
    updateMode === 'check'
      ? () => bridge.checkUpdate?.() ?? Promise.resolve({ ok: false })
      : () => bridge.update();
  const switchVersion = (version: string) =>
    void data.run(() => bridge.revert(version), t.harnessVersionSwitched, 'switch');
  const reinstallCurrent = () =>
    void data.run(() => bridge.reinstall(), t.harnessVersionReinstalled, 'reinstall');
  const channelRow = (channel: 'stable' | 'prerelease') => (
    <ChannelRow
      channel={channel}
      title={
        (channel === 'stable' ? bridge.labels?.stable : bridge.labels?.prerelease) ??
        (channel === 'stable' ? t.harnessVersionStable : t.harnessVersionPrerelease)
      }
      infos={channel === 'stable' ? data.stableInfos : data.prereleaseInfos}
      effective={channel === 'stable' ? stableEffective : prereleaseEffective}
      current={data.current}
      installed={data.installed}
      unknown={data.channelUnknown}
      emptyText={
        channel === 'stable' ? t.harnessVersionStableEmpty : t.harnessVersionPrereleaseEmpty
      }
      disabled={data.disabled}
      menuOpen={menu.openChannel === channel}
      menuStyle={menu.menuStyle}
      menuAnchorRef={menu.menuAnchorRef}
      menuPanelRef={menu.menuPanelRef}
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
          <SettingsHeader
            title={formatT(t, 'harnessVersionTitle', { tool: bridge.toolName })}
          />
        </div>
      )}

      <div className="adl-settings-card">
        <CurrentVersionRow
          current={data.current}
          effectiveLabel={effectiveLabel}
          uninstallHint={bridge.labels?.uninstallCurrentHint}
          armed={actions.uninstallArmed !== null}
          runtimeReadout={renderSlot(slots.runtimeReadout, slotContext)}
        />
        <StatusRows
          failed={data.snapshot?.failed === true}
          showMissing={data.status !== null && data.installed.length === 0}
          missingBanner={
            slots.missingBanner
              ? renderSlot(slots.missingBanner, slotContext)
              : formatT(t, 'harnessVersionMissingBanner', { tool: bridge.toolName })
          }
        />
        {data.manageVisible ? (
          <>
            <UpdateRow
              mode={updateMode}
              hasLatest={data.status?.latestAvailable != null}
              catalogFailed={data.snapshot?.catalogFailed === true}
              hasUpdate={data.status?.hasUpdate === true}
              disabled={data.disabled}
              onInstall={() => void data.run(runUpdateAction, t.harnessVersionUpdated, 'update')}
              onCheck={() => void data.run(runUpdateAction, null)}
            />
            {data.channelPicker ? (
              <>
                {channelRow('stable')}
                {channelRow('prerelease')}
              </>
            ) : (
              <LegacyChannelRows
                stable={data.stable}
                stablePick={actions.stablePick}
                latestPrerelease={data.latestPrerelease}
                disabled={data.disabled}
                onStablePick={actions.setStablePick}
                onInstall={actions.installVersion}
              />
            )}
            <ManualVersionRow
              value={actions.manual}
              disabled={data.disabled}
              onChange={actions.setManual}
              onInstall={actions.installManual}
            />
          </>
        ) : null}
      </div>

      {data.manageVisible ? (
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

      <SourceCard
        source={data.source}
        sourceHint={
          slots.sourceHint ?? formatT(t, 'harnessVersionSourceHint', { tool: bridge.toolName })
        }
        disabled={data.disabled}
        onSourceChange={(mode: HarnessVersionSourceMode) => actions.handleSourceChange(mode)}
        note={renderSlot(slots.sourceNote, slotContext)}
        footer={renderSlot(slots.sourceFooter, slotContext)}
      />

      {data.shownTask ? (
        <TaskRow
          stageText={data.stageText}
          cancelLabel={data.cancelLabel}
          percent={data.shownTask.percent}
          done={data.shownTask.done}
          total={data.shownTask.total}
          cancellable={data.shownTask.cancellable}
          showPercent={bridge.capabilities?.taskPercent !== false}
          showCounts={bridge.capabilities?.taskCounts === true}
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

      {renderSlot(slots.footer, slotContext)}
    </div>
  );
}
