import { useEffect, useMemo } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { selectSessionMessages } from './PartStore';
import type { SseWireEvent } from './partStoreTypes';

/**
 * Part 渲染内核 hook（S2 Task 3）：进入会话时拉取历史（getSessionMessages →
 * partHydrate），并订阅原始 SSE Part 事件流（subscribeSessionPartEvents →
 * partApplyEvent，按 sessionID 过滤），卸载时取消订阅。
 *
 * 返回该会话的 `SessionPartState`（messages / partsByMessage / status /
 * questions）—— `selectSessionMessages` 每次返回新对象，`useMemo` 仅在
 * `partBySession` 或 sessionId 变化时重建视图。
 */
export function usePartStream(sessionId: string | undefined) {
  const partBySession = useAppStore((s) => s.partBySession);
  const partHydrate = useAppStore((s) => s.partHydrate);
  const partApplyEvent = useAppStore((s) => s.partApplyEvent);

  const bridge = typeof window !== 'undefined' ? window.digitalLife : undefined;

  useEffect(() => {
    if (!sessionId || !bridge) {
      return;
    }
    let cancelled = false;
    void bridge.conversation.getSessionMessages(sessionId).then((res) => {
      if (!cancelled && res.ok && res.data) {
        partHydrate(sessionId, res.data);
      }
    });
    const unsubscribe = bridge.subscribeSessionPartEvents((event: SseWireEvent) => {
      if (event.sessionID === sessionId) {
        partApplyEvent(sessionId, event);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sessionId, bridge, partHydrate, partApplyEvent]);

  const view = useMemo(
    () => (sessionId ? selectSessionMessages(partBySession ?? {}, sessionId) : undefined),
    [partBySession, sessionId],
  );
  return view;
}
