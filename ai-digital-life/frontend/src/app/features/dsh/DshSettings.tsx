import { useCallback, useEffect, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import { executeDshResetPlan } from '@shared/settings-reset/dshReset';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { SettingsHintButton } from '../../components/settings/SettingsHintButton';
import { DshVersionManagement } from './DshVersionManagement';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { anchorFor } from '@components/settings/settingsSearchIndex';

/**
 * 「DSH」设置组：版本管理块（Task 5 起仅剩此块——源/代理/测试三块已搬入网络组，
 * 类名与锚点 `dsh:version` 不变）+ 挂在块卡最下方的只读源摘要行。
 *
 * 摘要行只读展示当前下载源（`sourceStatus.config.npm_registry`）与跳转入口：
 * `DshSourceStatus` 无延迟字段（延迟仅 `testSource` 探针返回、不常驻 store），
 * 故延迟恒为未知；`sourceStatus` 未知时源同样未知——一律 fail-open 显示未知符，
 * 不阻塞版本管理块。修改走网络组（`setActiveSettingsGroup('network')`，
 * 照抄 `App.tsx::handleOpenShortcutsSettings` 的组跳转语义；本组已在设置面板内，
 * 无需再 `navigateRightTool('settings')`）。
 *
 * 块头（装饰图标 + 主标题）在卡外，块体复用 `DshVersionManagement` 自有卡片
 * （不另套 `adl-settings-card`，避免双层卡嵌套）。
 *
 * 组级恢复走自有流程（侧边栏置 `dshGroupResetPending` → 此处消费开框）：
 * 版本来源=自动，委托共享 `executeDshResetPlan` 单计划一次写入；
 * 维护 `dshBlocksAtDefault` 聚合信号（版本来源是否默认）供侧边栏禁用判定。
 * 源/代理 pending 消费无残留：本文件仅消费 `dshGroupResetPending`
 *（源/代理恢复归网络组，见 `NetworkSettings`）。
 */
export function DshSettings() {
  const { t } = useTCopy();
  const actions = useAppActions();
  const sourceStatus = useAppStore((s) => s.sourceStatus);
  const setActiveSettingsGroup = useAppStore((s) => s.setActiveSettingsGroup);
  const showToast = useAppStore((s) => s.showToast);
  const setDshBlocksAtDefault = useAppStore((s) => s.setDshBlocksAtDefault);
  const dshGroupResetPending = useAppStore((s) => s.dshGroupResetPending);
  const consumeDshGroupReset = useAppStore((s) => s.consumeDshGroupReset);

  const [groupResetOpen, setGroupResetOpen] = useState(false);
  const [groupResetBusy, setGroupResetBusy] = useState(false);

  // 卸载兜底：pending 置位后若组件在消费前卸载，清信号避免下次挂载"迟到弹窗"。
  // 聚合信号卸载不清（事项 12d）：保留最后已知值供侧边栏禁用判定，
  // 切出后由 SettingsPanel 未激活校正随 store 变化刷新。
  useEffect(
    () => () => {
      useAppStore.getState().consumeDshGroupReset();
    },
    [],
  );

  // 源状态缺失时自行静默拉取（与 NetworkSettings 同法）：直接落到持久化的 DSH 组
  // 时也必须有摘要数据，不假设网络组先访问过；失败保持 null，摘要 fail-open。
  useEffect(() => {
    if (useAppStore.getState().sourceStatus === null) {
      void actions.fetchSourceStatus(true);
    }
  }, [actions]);

  // 聚合信号：版本来源=自动 → 默认（供侧边栏 DSH 行禁用）。
  // 保留 sourceStatus 门（未知 → false → 侧边栏启用，本来就是 fail-open）。
  const versionSourceAtDefault = (sourceStatus?.config.version_source ?? 'auto') === 'auto';
  useEffect(() => {
    setDshBlocksAtDefault(sourceStatus !== null && versionSourceAtDefault);
  }, [sourceStatus, versionSourceAtDefault, setDshBlocksAtDefault]);

  /**
   * 组级恢复对话框打开（承接 pending 信号）：守卫先行——组框已开/执行中 →
   * 不消费 pending（信号保留，框关闭后 effect 重试），避免重置意图被
   * 静默吞掉（事项 11 Phase 4 A1-L1）。
   */
  const openGroupResetDialog = useCallback(() => {
    if (groupResetOpen || groupResetBusy) {
      return;
    }
    consumeDshGroupReset();
    setGroupResetOpen(true);
  }, [consumeDshGroupReset, groupResetOpen, groupResetBusy]);

  useEffect(() => {
    if (!dshGroupResetPending) {
      return;
    }
    openGroupResetDialog();
  }, [dshGroupResetPending, openGroupResetDialog]);

  /** 组级恢复：版本来源=自动。乐观执行：点确认立刻关框，后台单计划一次写入；
   * 失败则 toast（action 非 silent 已记全局错误卡，此处再补失败提示），无本地回滚
   * （本组无本地表单态，版本块经自身快照刷新）。 */
  const handleGroupConfirm = useCallback(() => {
    if (groupResetBusy) {
      return;
    }
    setGroupResetBusy(true);
    setGroupResetOpen(false);
    void (async () => {
      try {
        // 版本来源与源/代理分属 dsh/network 两共享计划：本组只写版本来源
        // （Task 5 拆分语义；源/代理恢复归网络组）。
        const save = {
          saveSourceConfig: (cfg: Parameters<typeof actions.saveSourceConfig>[0]) =>
            actions.saveSourceConfig(cfg),
        };
        const result = await executeDshResetPlan(save);
        if (!result.ok) {
          showToast(t.dshSettingsSaveFailed, 'error');
          return;
        }
        showToast(t.settingsResetComplete, 'success');
      } finally {
        setGroupResetBusy(false);
      }
    })();
  }, [groupResetBusy, actions, showToast, t]);

  // 取消无执行中守卫：组确认乐观先关框，busy 为 true 时对话框已卸载，
  // 取消按钮物理不可达（事项 11 Phase 4 B1-A-1 死守卫清理）。
  const handleGroupCancel = useCallback(() => {
    setGroupResetOpen(false);
  }, []);

  const groupResetTitle = formatT(t, 'settingsResetGroupConfirmTitle', { group: t.settingsDsh });
  const groupResetMessage = formatT(t, 'settingsResetGroupConfirmMessage', {
    group: t.settingsDsh,
  });

  const handleGoNetwork = useCallback(() => {
    setActiveSettingsGroup('network');
  }, [setActiveSettingsGroup]);

  const sourceMode = sourceStatus?.config.source_mode;
  const summaryLabel = formatT(t, 'dshSourceSummary', {
    title: t.dshSourceSummaryTitle,
    registry: sourceStatus?.config.npm_registry ?? t.dshSourceSummaryUnknown,
  });
  const summaryMode = formatT(t, 'dshSourceSummaryMode', {
    mode:
      sourceMode === 'auto'
        ? t.dshSettingsSourceAuto
        : sourceMode === 'manual'
          ? t.dshSourceSummaryManual
          : t.dshSourceSummaryUnknown,
  });

  // 当前下载源独立沉底卡（无块标题，照抄存储组数据位置索引卡）：
  // 问号在设置项名称文字左边，卡片无主标题，锚点挂卡片，只读 + 前往修改跳转。
  // 「名称 + 源地址文本」保持主文字色，尾部模式提示用中性灰。
  const sourceSummaryCard = (
    <div
      className="adl-settings-card"
      data-testid="dsh-source-summary-card"
      data-settings-anchor={anchorFor('dsh', 'source')}
    >
      <div className="adl-settings-row" data-settings-row={t.dshSourceSummaryTitle}>
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <SettingsHintButton content={t.dshSourceSummaryHint} />
            <span>{summaryLabel}</span>
            <span className="adl-dsh-settings__source-mode">{summaryMode}</span>
          </div>
        </div>
        <div className="adl-settings-row__control">
          <button type="button" className="adl-dsh-settings__action-btn" onClick={handleGoNetwork}>
            {t.dshSourceSummaryGoModify}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="adl-settings-section adl-dsh-settings">
      <div
        className="adl-dsh-settings__header adl-dsh-settings__header--section"
        data-settings-anchor={anchorFor('dsh', 'version')}
      >
        <SettingsHintButton content={t.dshVersionManagementHint} />
        <SettingsHeader title={t.dshVersionManagement} />
      </div>
      <DshVersionManagement />
      {sourceSummaryCard}

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
