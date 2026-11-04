/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Spinner } from '../Spinner';
import { IconCheck, IconClose } from '../../icons';

export type ActionPhase = 'loading' | 'success' | 'error';

/** 成功/失败回显停留时长（事项 1c）：足够感知，不过久挡路。 */
const FLASH_DISPLAY_MS = 1400;

/**
 * 行级操作三态机（事项 1/1c，R1-ENV-01 修为按 key 独立槽位）：
 * 每键独立 `loading`（圆圈）→ `success`（打勾）/ `error`（打叉），
 * 回显停留后自动回到空闲。`result === false` 判失败（与各 action 的布尔语义对齐），
 * 抛错同样判失败。卸载时清全部定时器，不写已卸载组件。
 */
export function useActionFlash(displayMs = FLASH_DISPLAY_MS) {
  const [phases, setPhases] = useState<Record<string, ActionPhase>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});

  useEffect(
    () => () => {
      for (const timer of Object.values(timersRef.current)) {
        if (timer) {
          clearTimeout(timer);
        }
      }
    },
    [],
  );

  const settle = useCallback(
    (key: string, phase: ActionPhase) => {
      setPhases((prev) => ({ ...prev, [key]: phase }));
      timersRef.current[key] = setTimeout(() => {
        timersRef.current[key] = undefined;
        setPhases((prev) => {
          if (!(key in prev)) {
            return prev;
          }
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }, displayMs);
    },
    [displayMs],
  );

  const run = useCallback(
    (key: string, task: () => Promise<unknown>) => {
      const prev = timersRef.current[key];
      if (prev) {
        clearTimeout(prev);
        timersRef.current[key] = undefined;
      }
      setPhases((phases) => ({ ...phases, [key]: 'loading' }));
      void Promise.resolve()
        .then(task)
        .then(
          (result) => settle(key, result === false ? 'error' : 'success'),
          () => settle(key, 'error'),
        );
    },
    [settle],
  );

  return { phases, run };
}

/** 取某键当前相（无 flash 返回 null，调用方据此锁自身）。 */
export function flashPhaseFor(
  phases: Record<string, ActionPhase>,
  key: string,
): ActionPhase | null {
  return phases[key] ?? null;
}

/** 覆盖层图标：圆圈 → 打勾（成功色）/ 打叉（失败色），按钮内水平垂直居中。 */
export function FlashIcon({ phase }: { phase: ActionPhase }) {
  if (phase === 'loading') {
    return <Spinner size="sm" speed="normal" />;
  }
  if (phase === 'success') {
    return <IconCheck size={14} decorative />;
  }
  return <IconClose size={14} decorative />;
}
