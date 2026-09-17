import { useCallback, useEffect, useRef, useState } from 'react';
import { clamp, readNumber, writeNumber } from '@stores/shared';

const SAVE_DEBOUNCE_MS = 150;
const MAX_SCROLL_TOP = 1000000;

/**
 * 滚动位置持久化（localStorage）。
 *
 * 约定：`storageKey` 须为模块级常量（首挂载时一次性读取 savedTop 并 armed，
 * key 变化不会重读；当前两处调用均为常量，见 R6）。
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
 * - 程序化回填触发的 scroll 事件会被抑制，不会误存/误接管（仅值真正改变时才置标记，R3）。
 */
export function usePersistedScrollTop(storageKey: string) {
  const [savedTop] = useState(() => readNumber(storageKey, 0, 0, MAX_SCROLL_TOP));
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const restoreArmedRef = useRef(savedTop > 0);
  const suppressScrollRef = useRef(false);
  const saveTimerRef = useRef<number | undefined>(undefined);

  const writeTop = useCallback(
    (value: number) => {
      writeNumber(storageKey, clamp(Math.round(value), 0, MAX_SCROLL_TOP));
    },
    [storageKey],
  );

  // 仅当有 pending 去抖时才落盘（R2）：无滚动、无 pending 的卸载不得以 0 覆盖已存值。
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
      // 仅值真正改变时才置抑制标记（R3）：钳制后相等/内容尚矮时赋值不产生 scroll 事件，
      // 无条件置标记会残留并吞掉下一次真实用户滚动。
      const before = el.scrollTop;
      el.scrollTop = Math.min(savedTop, maxScrollable);
      suppressScrollRef.current = el.scrollTop !== before;
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
    // 回调内读 nodeRef.current（R4）：150ms 窗口内节点若已切换，不写回旧节点值。
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
