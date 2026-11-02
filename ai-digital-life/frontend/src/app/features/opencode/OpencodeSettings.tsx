import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import { anchorFor } from '@components/settings/settingsSearchIndex';
import { SettingsHeader } from '@components/settings/SettingsHeader';
import { SettingsHintButton } from '@components/settings/SettingsHintButton';
import { SettingsRefreshButton } from '@components/settings/SettingsRefreshButton';
import { ConfirmDialog } from '@components/ConfirmDialog';
import {
  HarnessVersionCard,
  type HarnessVersionCardHandle,
  type HarnessVersionSlotContext,
} from '@features/harness/HarnessVersionCard';
import { useHarnessBlockRefresh } from '@features/harness/hooks/useHarnessBlockRefresh';
import type { OpencodeBridge, OpencodeSourceStatus } from '@shared/ipc/opencode';
import {
  createOpencodeVersionBridge,
  peekOpencodeSource,
  prefetchOpencodeSnapshot,
  resetOpencodeSnapshotCache,
} from './opencodeVersionBridge';
import { OpencodeOfficialLinksCard } from './sub-components/OpencodeOfficialLinksCard';
import { OpencodeSourceSummaryCard } from './sub-components/OpencodeSourceSummaryCard';
import { OpencodeVersionSourceNote } from './sub-components/OpencodeVersionSourceNote';
import { executeOpencodeResetPlan } from '@shared/settings-reset/opencodeReset';

/**
 * 终端可用性开关行（OpenCode 专属来源插槽）：新终端窗口自动启用 + 说明小字。
 *
 * 开关走通用 `adl-settings-toggle`（`role=switch`），说明文字下沉为标题下方
 * 中性灰小字；只影响新会话，已打开的终端保持不变。
 */
function TerminalInjectionRows({
  bridge,
  source,
  disabled,
  run,
}: {
  bridge: OpencodeBridge | undefined;
  source: OpencodeSourceStatus | null;
  disabled: boolean;
  run: HarnessVersionSlotContext<OpencodeSourceStatus>['run'];
}) {
  const { t } = useTCopy();
  const enabled = source?.terminalInjection ?? true;
  return (
    <div
      className="adl-settings-row adl-harness-version__row--center"
      data-settings-row={t.opencodeTerminalInjection}
    >
      <div className="adl-settings-row__label">
        <div className="adl-settings-row__label-text">
          <SettingsHintButton content={t.opencodeTerminalInjectionHint} />
          <span>{t.opencodeTerminalInjection}</span>
        </div>
        <small>{t.opencodeTerminalNote}</small>
      </div>
      <div className="adl-settings-row__control">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t.opencodeTerminalInjection}
          disabled={disabled || !bridge}
          className={`adl-settings-toggle${enabled ? ' is-on' : ''}`}
          onClick={() => {
            const next = !enabled;
            void run(async () => {
              if (!bridge) {
                return { ok: false };
              }
              const result = await bridge.setTerminalInjection(next);
              return result.ok ? { ok: true } : { ok: false, error: result.error.message };
            }, t.opencodeTerminalInjectionSaved);
          }}
        >
          <span className="adl-settings-toggle__track">
            <span className="adl-settings-toggle__thumb" />
          </span>
        </button>
      </div>
    </div>
  );
}

/**
 * 「OpenCode CLI」设置组：通用版本卡片 + OpenCode 专属插槽。
 *
 * 与 DSH 组共享同一套后端版本内核（`adl_harness_version`），但没有运行态
 * （无端口/标签/auth）；安装产物是自包含 exe，终端 PATH 注入由服务端在
 * 新会话创建时完成。
 */
export function OpencodeSettings() {
  const { t } = useTCopy();
  const showToast = useAppStore((s) => s.showToast);
  const actions = useAppActions();
  const rawBridge = typeof window !== 'undefined' ? window.digitalLife?.opencode : undefined;
  const opencodeGroupResetPending = useAppStore((s) => s.opencodeGroupResetPending);
  const consumeOpencodeGroupReset = useAppStore((s) => s.consumeOpencodeGroupReset);
  const setOpencodeBlocksAtDefault = useAppStore((s) => s.setOpencodeBlocksAtDefault);
  const [summarySource, setSummarySource] = useState<OpencodeSourceStatus | null>(() =>
    peekOpencodeSource(),
  );

  const bridge = useMemo(
    () =>
      createOpencodeVersionBridge({
        bridge: rawBridge,
        toolName: t.settingsOpencode,
        t,
        testSource: actions.testSource,
        saveSourceConfig: actions.saveSourceConfig,
        notify: (message, tone) => {
          showToast(message, tone);
        },
        onSource: (source) => {
          // 摘要卡数据源：失败时清空，进入骨架→超时失败态（不保留上一次的「当前」）。
          setSummarySource(source);
          if (!source) {
            return;
          }
          // 聚合信号（供侧边栏行禁用判定；来源未知时保持启用 fail-open）。
          setOpencodeBlocksAtDefault(
            source.versionSource.mode === 'auto' && source.terminalInjection === true,
          );
        },
      }),
    [
      rawBridge,
      t,
      actions.testSource,
      actions.saveSourceConfig,
      showToast,
      setOpencodeBlocksAtDefault,
    ],
  );

  // 组级恢复后强制卡片重挂：重挂经 peek 拿到重置后的新鲜快照并静默再验证。
  const [cardEpoch, setCardEpoch] = useState(0);
  const [groupResetOpen, setGroupResetOpen] = useState(false);
  const [groupResetBusy, setGroupResetBusy] = useState(false);
  const cardRef = useRef<HarnessVersionCardHandle>(null);
  // 块级刷新：卡片忙碌时禁用按钮，点击驱动整卡重载（宿主侧状态与 DSH 共用）。
  const {
    refreshingAll,
    cardBusy,
    setCardBusy,
    refreshAll: handleRefreshAll,
  } = useHarnessBlockRefresh(cardRef);

  // 卸载兜底：pending 置位后若组件在消费前卸载，清信号避免下次挂载"迟到弹窗"。
  useEffect(
    () => () => {
      useAppStore.getState().consumeOpencodeGroupReset();
    },
    [],
  );

  const openGroupResetDialog = useCallback(() => {
    if (groupResetOpen || groupResetBusy) {
      return;
    }
    consumeOpencodeGroupReset();
    setGroupResetOpen(true);
  }, [consumeOpencodeGroupReset, groupResetOpen, groupResetBusy]);

  useEffect(() => {
    if (!opencodeGroupResetPending) {
      return;
    }
    openGroupResetDialog();
  }, [opencodeGroupResetPending, openGroupResetDialog]);

  const handleGroupConfirm = useCallback(() => {
    if (groupResetBusy) {
      return;
    }
    if (!rawBridge) {
      setGroupResetOpen(false);
      showToast(t.harnessVersionOpFailed, 'error');
      return;
    }
    setGroupResetBusy(true);
    setGroupResetOpen(false);
    void (async () => {
      try {
        const result = await executeOpencodeResetPlan({
          saveVersionSource: async (mode) => (await rawBridge.saveVersionSource(mode)).ok,
          setTerminalInjection: async (enabled) =>
            (await rawBridge.setTerminalInjection(enabled)).ok,
        });
        if (!result.ok) {
          showToast(t.harnessVersionOpFailed, 'error');
          return;
        }
        showToast(t.settingsResetComplete, 'success');
        // 先清旧快照再预热：否则预热 no-op，重挂首帧闪现旧值。
        resetOpencodeSnapshotCache();
        await prefetchOpencodeSnapshot();
        setCardEpoch((epoch) => epoch + 1);
      } catch {
        showToast(t.harnessVersionOpFailed, 'error');
      } finally {
        setGroupResetBusy(false);
      }
    })();
  }, [groupResetBusy, rawBridge, showToast, t]);

  const handleGroupCancel = useCallback(() => {
    setGroupResetOpen(false);
  }, []);

  const groupResetTitle = formatT(t, 'settingsResetGroupConfirmTitle', {
    group: t.settingsOpencode,
  });
  const groupResetMessage = formatT(t, 'settingsResetGroupConfirmMessage', {
    group: t.settingsOpencode,
  });

  return (
    <div className="adl-settings-section adl-opencode-settings">
      <div
        className="adl-settings-storage__header adl-settings-storage__header--section"
        data-settings-anchor={anchorFor('opencode', 'version')}
      >
        <SettingsHintButton content={t.opencodeVersionHint} />
        <SettingsHeader
          title={t.opencodeVersionTitle}
          action={
            <SettingsRefreshButton
              block
              label={t.opencodeVersionTitle}
              spinning={refreshingAll}
              disabled={cardBusy}
              onRefresh={handleRefreshAll}
            />
          }
        />
      </div>
      <HarnessVersionCard
        key={cardEpoch}
        ref={cardRef}
        bridge={bridge}
        onBusyChange={setCardBusy}
        slots={{
          // 块头复用 OpenCode 组原有块头（锚点 + 问号 + 版本管理标题）。
          hideHeader: true,
          sourceOptions: [
            { value: 'auto', label: t.opencodeSourceAuto },
            { value: 'system', label: t.opencodeSourceSystem },
            { value: 'host', label: t.opencodeSourceHost },
          ],
          sourceHint: t.opencodeSourceHint,
          descSource: t.opencodeSourceDesc,
          sourceNote: ({ sourceExtra }) => {
            const mode = sourceExtra?.versionSource.mode ?? 'auto';
            const resolved = sourceExtra?.versionSource.resolvedByMode?.[mode] ?? null;
            const systemManaged = mode === 'system' || resolved === 'system';
            return (
              <OpencodeVersionSourceNote
                systemManaged={systemManaged}
                resolvedSource={resolved}
                mode={mode}
              />
            );
          },
          currentHint: t.opencodeCurrentVersionHint,
          descCurrent: t.opencodeCurrentVersionDesc,
          checkHint: t.opencodeUpdateHint,
          descCheck: t.opencodeUpdateDesc,
          stableHint: t.opencodeStableHint,
          descStable: t.opencodeStableDesc,
          prereleaseHint: t.opencodePrereleaseHint,
          descPrerelease: t.opencodePrereleaseDesc,
          sourceFooter: ({ sourceExtra, disabled, run }) => (
            <TerminalInjectionRows
              bridge={rawBridge}
              source={sourceExtra}
              disabled={disabled}
              run={run}
            />
          ),
          // 官方版本信息行：卡片渲染为卡内末行。
          footer: <OpencodeOfficialLinksCard />,
        }}
      />
      <OpencodeSourceSummaryCard source={summarySource} />

      <ConfirmDialog
        open={groupResetOpen}
        title={groupResetTitle}
        message={groupResetMessage}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={handleGroupConfirm}
        onCancel={handleGroupCancel}
      />
    </div>
  );
}
