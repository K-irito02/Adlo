import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import type {
  HarnessVersionBridge,
  HarnessVersionMutation,
  HarnessVersionResult,
  HarnessVersionSnapshot,
} from '../harnessVersionBridge';
import { useHarnessVersionTaskPoll } from './useHarnessVersionTaskPoll';

/**
 * 版本卡片的数据面：快照、忙碌门与变更执行（任务行由
 * {@link useHarnessVersionTaskPoll} 单独负责）。
 *
 * `run` 负责忙碌态、取消/失败映射、适配器的 `afterMutation` 收尾与成功文案；
 * 具体动作由调用方传入（保持动作定义与界面同层，便于阅读）。
 */
export function useHarnessVersionData<TSource>(bridge: HarnessVersionBridge<TSource>) {
  const { t } = useTCopy();
  const [snapshot, setSnapshot] = useState<HarnessVersionSnapshot<TSource> | null>(null);
  const [busy, setBusy] = useState(false);
  const task = useHarnessVersionTaskPoll(bridge, busy);

  const applySnapshot = useCallback((next: HarnessVersionSnapshot<TSource>) => {
    setSnapshot((previous) => ({
      // 腿级降级：某一路读取失败时保留上一次的值（与迁移前 OpenCode 行为一致）。
      status: next.status ?? previous?.status ?? null,
      catalog: next.catalog ?? previous?.catalog ?? null,
      source: next.source ?? previous?.source ?? null,
      sourceExtra: next.sourceExtra ?? previous?.sourceExtra ?? null,
      failed: next.failed === true && next.status === null && (previous?.status ?? null) === null,
      catalogFailed: next.catalogFailed === true,
    }));
  }, []);

  const refresh = useCallback(async () => {
    try {
      applySnapshot(await bridge.load());
    } catch {
      applySnapshot({
        status: null,
        catalog: null,
        source: null,
        sourceExtra: null,
        failed: true,
      });
    }
  }, [applySnapshot, bridge]);

  // 首屏与操作后共用同一刷新路径（避免两处各写一份失败快照字面量）。
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const { clearTask } = task;
  const run = useCallback(
    async (
      action: () => Promise<HarnessVersionResult>,
      successMessage: string | null,
      mutation?: HarnessVersionMutation,
    ) => {
      if (!bridge.available) {
        return;
      }
      setBusy(true);
      clearTask();
      try {
        const result = await action();
        if (!result.ok) {
          if (result.cancelled) {
            bridge.notify(t.harnessVersionCancelled, 'warning');
          } else if (!result.silent) {
            bridge.notify(result.error || t.harnessVersionOpFailed, 'error');
          }
          return;
        }
        let follow: HarnessVersionResult | null = null;
        if (mutation && bridge.afterMutation) {
          follow = await bridge.afterMutation(mutation);
          if (!follow.ok) {
            if (follow.cancelled) {
              bridge.notify(t.harnessVersionCancelled, 'warning');
            } else if (!follow.silent) {
              bridge.notify(follow.error || t.harnessVersionOpFailed, 'error');
            }
            return;
          }
        }
        // 适配器可提供工具专属完成文案；`null` 表示由适配器自行提示。
        const message = follow?.message ?? result.message ?? successMessage;
        if (message) {
          bridge.notify(message, 'success');
        }
      } catch {
        bridge.notify(t.harnessVersionOpFailed, 'error');
      } finally {
        clearTask();
        setBusy(false);
        await refresh();
      }
    },
    [bridge, clearTask, refresh, t],
  );

  const status = snapshot?.status ?? null;
  const catalog = snapshot?.catalog ?? null;
  const source = snapshot?.source ?? null;
  const current = status?.currentSelected ?? null;
  const installed = useMemo(() => status?.installed ?? [], [status]);
  const stable = useMemo(() => catalog?.stable ?? [], [catalog]);
  // 稳定桶为空但后端给出 latestStable 时，稳定行仍要能解析到该版本。
  const stableInfos = useMemo(() => {
    if (stable.length > 0) {
      return stable;
    }
    return catalog?.latestStable
      ? [{ version: catalog.latestStable, publishedAt: null }]
      : [];
  }, [catalog?.latestStable, stable]);
  const prereleaseInfos = useMemo(() => catalog?.prerelease ?? [], [catalog]);
  // 目录拉取失败 / 预发布未知：通道显示「未知」，不得误报「官方暂无」。
  const channelUnknown = snapshot?.catalogFailed === true || status?.prereleaseUnknown === true;
  const disabled = busy || !bridge.available;
  // 适配器拥有来源模型（DSH）时，来源未就绪前不渲染管理项，避免首帧闪现。
  const manageVisible = bridge.capabilities?.sourceManaged
    ? source?.ready === true && source.managed !== false
    : source?.managed !== false;

  return {
    snapshot,
    busy,
    refresh,
    run,
    status,
    catalog,
    source,
    sourceExtra: snapshot?.sourceExtra ?? null,
    current,
    installed,
    stable,
    stableInfos,
    prereleaseInfos,
    latestPrerelease: catalog?.prerelease[0] ?? null,
    channelUnknown,
    channelPicker: bridge.capabilities?.channelPicker === true,
    disabled,
    manageVisible,
    shownTask: task.shownTask,
    stageText: task.stageText,
    cancelLabel: task.cancelLabel,
  };
}
