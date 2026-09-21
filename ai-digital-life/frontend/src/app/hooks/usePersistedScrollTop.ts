import { useCallback, useEffect, useRef, useState } from 'react';
import { clamp, readNumber, writeNumber } from '@stores/shared';
import { persist } from '@stores/persisted/persist';

const SAVE_DEBOUNCE_MS = 150;
/** 与旧读写路径一致的上界：readNumber 钳制与 writeNumber 钳制共用，登记表读界引用同一常量 */
export const MAX_SCROLL_TOP = 1000000;

// ─────────────────────────────────────────────────────────────
// 滚动位置的水合缓存（Task 29，登记表 apply 目标）。
//
// sysmon / 剪贴板滚动位置是组件级状态（ref + 恢复编排，不宜上提 store）：
// 构造期水合经 hydrateAll 把校验后的值交回此处；hook 初始值优先读缓存，
// 未水合（任意键）或测试用任意键时回退到直接 readNumber——旧测试的任意键行为不变。
// 已登记键的写入走 persist()（唯一写通道，关窗 flush 兜底）；未登记键保持 writeNumber。
// JSON 与 String(number) 对数值序列化逐字相同，故两种写盘格式互通。
// ─────────────────────────────────────────────────────────────
const scrollTopCache = new Map<string, number>();

/** 经 persist 通道写入的已登记滚动键（两键值类型同为 number，联合约束可精确推导） */
type PersistedScrollKey = 'adl:ui.sysmonScrollTop' | 'adl:ui.clipboardScrollTop';

/** 登记表 `adl:ui.sysmonScrollTop` / `adl:ui.clipboardScrollTop` 的 apply */
export function applyPersistedScrollTop(key: string, value: number): void {
  if (Number.isFinite(value)) {
    scrollTopCache.set(key, value);
  }
}

/** hook 初始值：水合缓存优先，未水合时为 undefined（调用方回退到 readNumber） */
export function readCachedScrollTop(key: string): number | undefined {
  return scrollTopCache.get(key);
}

/** 测试专用：清除模块级缓存，模拟全新启动 */
export function resetScrollTopCacheForTest(): void {
  scrollTopCache.clear();
}

/**
 * 滚动位置持久化（localStorage）。
 *
 * 约定：`storageKey` 须为模块级常量（首挂载时一次性读取 savedTop 并 armed，
 * key 变化不会重读；当前两处调用均为常量）。
 *
 * 根因说明（2026-09-17 修订）：初版用普通 ref + mount 时 useEffect 挂 scroll 监听，
 * 但两处滚动容器都是条件渲染（剪贴板 loading/空态、sysmon 无快照空态），父组件 mount 时
 * 容器尚不存在 → ref 为 null → effect 直接 return 且永不重跑 → 监听从未挂上、
 * scrollTop 从未被保存。用回调 ref 改写：在容器节点到达/离开时挂载/卸载监听。
 *
 * - 挂载/数据就绪时恢复：节点到达时试一次 + `tryRestore` 由调用方在数据信号上触发
 *   （内容多为异步加载，一次性恢复会因内容尚矮而被钳制）；用户一旦手动滚动即接管，
 *   不再回填。
 * - 滚动停止 150ms 后去抖写入；节点离开（含组件卸载/收起）时若有 pending 去抖则同步落盘。
 * - 程序化回填触发的 scroll 事件会被抑制，不会误存/误接管（仅值真正改变时才置标记）。
 */
export function usePersistedScrollTop(
  storageKey: string,
  options?: { usePersistChannel?: boolean },
) {
  const usePersistChannel = options?.usePersistChannel === true;
  const [savedTop] = useState(
    () => readCachedScrollTop(storageKey) ?? readNumber(storageKey, 0, 0, MAX_SCROLL_TOP),
  );
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const restoreArmedRef = useRef(savedTop > 0);
  const suppressScrollRef = useRef(false);
  const saveTimerRef = useRef<number | undefined>(undefined);

  const writeTop = useCallback(
    (value: number) => {
      const next = clamp(Math.round(value), 0, MAX_SCROLL_TOP);
      if (usePersistChannel) {
        persist(storageKey as PersistedScrollKey, next);
      } else {
        writeNumber(storageKey, next);
      }
    },
    [storageKey, usePersistChannel],
  );

  // 仅当有 pending 去抖时才落盘：无滚动、无 pending 的卸载不得以 0 覆盖已存值。
  const flushPending = useCallback(() => {
    if (saveTimerRef.current === undefined) {
      return;
    }
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = undefined;
    if (nodeRef.current) {
      writeTop(nodeRef.current.scrollTop);
    }
  }, [writeTop]);

  const restoreInto = useCallback(
    (el: HTMLDivElement) => {
      if (!restoreArmedRef.current || savedTop <= 0) {
        return;
      }
      const maxScrollable = el.scrollHeight - el.clientHeight;
      if (maxScrollable <= 0) {
        return;
      }
      // 仅值真正改变时才置抑制标记：钳制后相等/内容尚矮时赋值不产生 scroll 事件，
      // 无条件覆写会洗掉待消费的旧标记（连续 tryRestore 时），导致程序化事件被误判为手动。
      // 只置位不清零：no-op 恢复不得清除已有的抑制。
      const before = el.scrollTop;
      el.scrollTop = Math.min(savedTop, maxScrollable);
      if (el.scrollTop !== before) {
        suppressScrollRef.current = true;
      }
      if (maxScrollable >= savedTop) {
        restoreArmedRef.current = false;
      }
    },
    [savedTop],
  );

  const handleScroll = useCallback(() => {
    const el = nodeRef.current;
    if (!el) {
      return;
    }
    if (suppressScrollRef.current) {
      suppressScrollRef.current = false;
      return;
    }
    restoreArmedRef.current = false;
    if (saveTimerRef.current !== undefined) {
      window.clearTimeout(saveTimerRef.current);
    }
    // 去抖回调内读当前节点：150ms 窗口内节点若已切换，不写回旧节点值。
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = undefined;
      if (nodeRef.current) {
        writeTop(nodeRef.current.scrollTop);
      }
    }, SAVE_DEBOUNCE_MS);
  }, [writeTop]);

  // 回调 ref：节点到达时挂监听 + 试恢复；节点离开时卸监听 + 落盘。
  const scrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (nodeRef.current) {
        nodeRef.current.removeEventListener('scroll', handleScroll);
        flushPending();
      }
      nodeRef.current = node;
      if (!node) {
        return;
      }
      node.addEventListener('scroll', handleScroll, { passive: true });
      restoreInto(node);
    },
    [flushPending, handleScroll, restoreInto],
  );

  // 数据后到达（节点已在）：由调用方触发的补充恢复。
  const tryRestore = useCallback(() => {
    if (nodeRef.current) {
      restoreInto(nodeRef.current);
    }
  }, [restoreInto]);

  // 组件卸载兜底（节点已离开时 callback ref 的 null 分支已落盘，此处防万一）。
  useEffect(() => {
    return () => {
      flushPending();
    };
  }, [flushPending]);

  return { scrollRef, tryRestore };
}
