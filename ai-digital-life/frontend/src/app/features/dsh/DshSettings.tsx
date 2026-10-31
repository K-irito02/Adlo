import { useCallback, useRef, useState } from 'react';
import { anchorFor } from '@components/settings/settingsSearchIndex';
import { SettingsHeader } from '@components/settings/SettingsHeader';
import { SettingsHintButton } from '@components/settings/SettingsHintButton';
import { SettingsRefreshButton } from '@components/settings/SettingsRefreshButton';
import { ConfirmDialog } from '@components/ConfirmDialog';
import {
  HarnessVersionCard,
  type HarnessVersionCardHandle,
} from '@features/harness/HarnessVersionCard';
import { DshVersionReadout } from './DshVersionReadout';
import { DshOfficialLinksCard } from './sub-components/DshOfficialLinksCard';
import { DshSourceSummaryCard } from './sub-components/DshSourceSummaryCard';
import { DshSourceSwitchDialog } from './sub-components/DshSourceSwitchDialog';
import { DshVersionSourceNote } from './sub-components/DshVersionSourceNote';
import { useDshSettings } from './useDshSettings';

/**
 * 「DSH」设置组：通用版本卡片 + DSH 专属插槽与运行态编排。
 *
 * 卡片只消费 `HarnessVersionBridge`；DSH 的 store/actions 全部在
 * `dshVersionBridge` 适配器里。状态编排见 `useDshSettings`，渲染碎块在同目录
 * `sub-components/`。组内固定三块内容：块头（锚点 + 问号 + 标题）、版本管理卡
 * （通用卡片，自带块头隐藏）、当前下载源只读摘要卡。
 */
export function DshSettings() {
  const {
    t,
    bridge,
    deferredSource,
    systemManaged,
    resolvedSource,
    effectiveSource,
    runningSource,
    mode,
    sourceSwitch,
    groupReset,
  } = useDshSettings();

  const cardRef = useRef<HarnessVersionCardHandle>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const handleRefreshAll = useCallback(() => {
    if (refreshingAll) {
      return;
    }
    setRefreshingAll(true);
    void (cardRef.current?.refreshAll() ?? Promise.resolve()).finally(() => {
      setRefreshingAll(false);
    });
  }, [refreshingAll]);

  return (
    <div className="adl-settings-section adl-dsh-settings">
      <div
        className="adl-dsh-settings__header adl-dsh-settings__header--section"
        data-settings-anchor={anchorFor('dsh', 'version')}
      >
        <SettingsHintButton content={t.dshVersionManagementHint} />
        <SettingsHeader
          title={t.dshVersionManagement}
          action={
            <SettingsRefreshButton
              block
              label={t.dshVersionManagement}
              spinning={refreshingAll}
              onRefresh={handleRefreshAll}
            />
          }
        />
      </div>
      <HarnessVersionCard
        ref={cardRef}
        bridge={bridge}
        slots={{
          // 块头复用 DSH 组原有块头（锚点 + 问号 + 版本管理标题）。
          hideHeader: true,
          sourceHint: t.dshVersionSourceHint,
          sourceOptions: [
            { value: 'auto', label: t.dshVersionSourceAuto },
            { value: 'system', label: t.dshVersionSourceSystem },
            { value: 'host', label: t.dshVersionSourceHost },
          ],
          currentHint: t.dshCurrentVersionHint,
          descCurrent: t.dshCurrentVersionDesc,
          checkHint: t.dshCheckUpdateHint,
          descCheck: t.dshCheckUpdateDesc,
          stableHint: t.dshOfficialStableHint,
          descStable: t.dshOfficialStableDesc,
          prereleaseHint: t.dshPrereleaseHint,
          descPrerelease: t.dshPrereleaseDesc,
          sourceNote: (
            <DshVersionSourceNote
              systemManaged={systemManaged}
              deferredSource={deferredSource}
              resolvedSource={resolvedSource}
              effectiveSource={effectiveSource}
              runningSource={runningSource}
              mode={mode}
            />
          ),
          runtimeReadout: ({ busy }) => <DshVersionReadout busy={busy} />,
          // 官方版本信息行：卡片渲染为卡内末行（旧 DSH 行5口径）。
          footer: <DshOfficialLinksCard />,
        }}
      />
      <DshSourceSummaryCard />

      <ConfirmDialog
        open={groupReset.open}
        title={groupReset.title}
        message={groupReset.message}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={groupReset.confirm}
        onCancel={groupReset.cancel}
      />

      <DshSourceSwitchDialog
        state={sourceSwitch.sourceSwitch}
        busy={sourceSwitch.sourceSwitchBusy}
        cancelRef={sourceSwitch.sourceSwitchCancelRef}
        onChoice={(choice) => void sourceSwitch.handleSourceSwitchChoice(choice)}
        onDismiss={() => sourceSwitch.finishSourceSwitch({ ok: true })}
      />
    </div>
  );
}
