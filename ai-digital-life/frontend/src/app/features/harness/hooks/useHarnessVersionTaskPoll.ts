import { useCallback, useEffect, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import type { CopyDict } from '@i18n/types';
import type { HarnessVersionBridge, HarnessVersionTask } from '../harnessVersionBridge';

/** 通用阶段文案（无适配器文案时的兜底；不伪造进度，总量未知按真实阶段显示）。 */
function fallbackStageText(task: HarnessVersionTask, t: CopyDict): string {
  switch (task.phase) {
    case 'preparing':
      return t.harnessVersionPhasePreparing;
    case 'installing':
      return task.total > 0 ? t.harnessVersionPhaseInstalling : t.harnessVersionPhaseDownloading;
    case 'removing':
      return task.total > 0 ? t.harnessVersionPhaseRemoving : t.harnessVersionPhasePreparing;
    default:
      return t.harnessVersionPhaseFinalizing;
  }
}

/**
 * 任务行数据面：忙碌时轮询任务，任务短暂归零（重启长尾/轮询间隙）时沿用最后
 * 一次非 null 快照，彻底空闲才清空 —— 避免进度行闪烁或提前消失。
 */
export function useHarnessVersionTaskPoll<TSource>(
  bridge: HarnessVersionBridge<TSource>,
  busy: boolean,
) {
  const { t } = useTCopy();
  const [task, setTask] = useState<HarnessVersionTask | null>(null);
  const lastTaskRef = useRef<HarnessVersionTask | null>(null);

  useEffect(() => {
    if (!busy || !bridge.available) {
      return;
    }
    let alive = true;
    const id = setInterval(() => {
      void bridge
        .getTask()
        .then((next) => {
          if (alive) {
            setTask(next);
          }
        })
        .catch(() => undefined);
    }, 800);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [busy, bridge]);

  useEffect(() => {
    if (task) {
      lastTaskRef.current = task;
    } else if (!busy) {
      lastTaskRef.current = null;
    }
  }, [task, busy]);

  const shownTask = task ?? (busy ? lastTaskRef.current : null);
  const stageText =
    shownTask === null
      ? ''
      : task !== null
        ? (bridge.taskStageText?.(task) ?? fallbackStageText(task, t))
        : (bridge.taskStageText?.(null) ?? t.harnessVersionPhaseFinalizing);
  const cancelLabel = shownTask
    ? (bridge.taskCancelLabel?.(shownTask) ?? t.harnessVersionCancel)
    : '';

  const clearTask = useCallback(() => setTask(null), []);

  return { clearTask, shownTask, stageText, cancelLabel };
}
