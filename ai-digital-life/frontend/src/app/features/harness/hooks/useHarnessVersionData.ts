import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import type {
  HarnessVersionBridge,
  HarnessVersionCatalog,
  HarnessVersionMutation,
  HarnessVersionResult,
  HarnessVersionSnapshot,
} from '../harnessVersionBridge';
import { useHarnessVersionTaskPoll } from './useHarnessVersionTaskPoll';

/**
 * semver 预发布判定（忽略 `+build` 段）。
 *
 * 只用于「已安装但不在官方目录窗口内」的补录版本：后端目录已带通道归属，
 * 这里没有目录条目可依，只能按 semver 语义兜底；`1.2.3+build-7` 是正式版，
 * `0.0.0-beta-x` 是预发布。
 */
function isPrereleaseVersion(version: string): boolean {
  const plus = version.indexOf('+');
  const core = plus === -1 ? version : version.slice(0, plus);
  return core.includes('-');
}

/**
 * 把已安装、但不在目录窗口内的版本补进对应通道（`publishedAt: null`）。
 *
 * 删除「已安装版本」独立卡后，通道行是切换/卸载/重装的唯一入口；OpenCode 目录
 * 只保留最近 50+50，更早装下的版本否则会彻底失去管理能力。合成在数据层完成，
 * 让通道行、菜单与宽度测量尺消费同一份数组。
 */
function withInstalledInfos(
  infos: HarnessVersionCatalog['stable'],
  installed: string[],
  channel: 'stable' | 'prerelease',
) {
  const known = new Set(infos.map((info) => info.version));
  const extra = installed.filter(
    (version) => !known.has(version) && isPrereleaseVersion(version) === (channel === 'prerelease'),
  );
  return extra.length > 0
    ? [...infos, ...extra.map((version) => ({ version, publishedAt: null }))]
    : infos;
}

/**
 * 版本卡片的数据面：快照、忙碌门与变更执行（任务行由
 * {@link useHarnessVersionTaskPoll} 单独负责）。
 *
 * `run` 负责忙碌态、取消/失败映射、适配器的 `afterMutation` 收尾与成功文案；
 * 具体动作由调用方传入（保持动作定义与界面同层，便于阅读）。
 */
export function useHarnessVersionData<TSource>(bridge: HarnessVersionBridge<TSource>) {
  const { t } = useTCopy();
  // 会话级种子：切组重挂首帧即瞬显（store/模块缓存常驻），后台仍静默再验证；
  // 冷启动无种子时为 null，卡片画骨架。
  const [snapshot, setSnapshot] = useState<HarnessVersionSnapshot<TSource> | null>(() => {
    try {
      return bridge.peekSnapshot?.() ?? null;
    } catch {
      return null;
    }
  });
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

  // 只有「最后发起」的那次 load 允许写回：首屏 effect、显式刷新与操作收尾
  // 都会各自发起 load，若按到达顺序覆盖，先发后到的旧快照会回退读数。
  const loadSeqRef = useRef(0);
  const refresh = useCallback(
    async (options?: { notifyFailure?: boolean }) => {
      const seq = ++loadSeqRef.current;
      try {
        const next = await bridge.load();
        if (seq !== loadSeqRef.current) {
          return;
        }
        applySnapshot(next);
        if (options?.notifyFailure && next.failed === true) {
          bridge.notify(t.harnessVersionLoadFailed, 'error');
        }
      } catch {
        if (seq !== loadSeqRef.current) {
          return;
        }
        applySnapshot({
          status: null,
          catalog: null,
          source: null,
          sourceExtra: null,
          failed: true,
        });
        if (options?.notifyFailure) {
          bridge.notify(t.harnessVersionLoadFailed, 'error');
        }
      }
    },
    [applySnapshot, bridge, t],
  );

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
        // 先刷新再降 busy：刷新期间读数保持扫光、任务行沿用上次阶段（收尾中），
        // 避免「安装成功 → 短暂显示未安装 → 徽章才出现」的闪变（与 DSH 重启长尾同口径）。
        await refresh();
        setBusy(false);
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
  const stableBase = useMemo(() => {
    if (stable.length > 0) {
      return stable;
    }
    return catalog?.latestStable ? [{ version: catalog.latestStable, publishedAt: null }] : [];
  }, [catalog?.latestStable, stable]);
  const prereleaseBase = useMemo(() => catalog?.prerelease ?? [], [catalog]);
  // 目录外已安装版本并入通道（见 withInstalledInfos）；菜单与尺子消费同一份结果。
  const stableInfos = useMemo(
    () => withInstalledInfos(stableBase, installed, 'stable'),
    [stableBase, installed],
  );
  const prereleaseInfos = useMemo(
    () => withInstalledInfos(prereleaseBase, installed, 'prerelease'),
    [prereleaseBase, installed],
  );
  // 目录拉取失败 / 预发布未知：该通道没有任何可展示版本时显示「未知」，不得误报「官方暂无」；
  // 有已安装版本时会并入通道（仍可管理），失败信号由「检查更新」行的提示承担。
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
    source,
    sourceExtra: snapshot?.sourceExtra ?? null,
    current,
    installed,
    stableInfos,
    prereleaseInfos,
    channelUnknown,
    disabled,
    manageVisible,
    shownTask: task.shownTask,
    hasLiveTask: task.hasLiveTask,
    stageText: task.stageText,
    cancelLabel: task.cancelLabel,
  };
}
