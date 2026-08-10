import { useEffect, useMemo } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { selectSessionMessages } from './PartStore';
import type { SseWireEvent } from './partStoreTypes';

/**
 * Part 渲染内核 hook（S2 Task 3）：进入会话时**先**拉取历史（getSessionMessages →
 * partHydrate），**再**订阅原始 SSE Part 事件流（subscribeSessionPartEvents →
 * partApplyEvent，按 sessionID 过滤），卸载时取消订阅。
 *
 * 订阅严格排在 hydrate 之后（design §5.1「拉历史 → 再开 EventSource」）：若在
 * hydrate 解析前打开事件流，窗口期内的 `message.part.delta` 会被应用到一个尚未
 * 含该 part 的空 store，且缺失于（更旧的）hydrate 快照 → 流式文本丢失。hydrate
 * 失败（非 ok 或无 data）时仍继续订阅，保证实时路径不依赖历史加载。
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
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      const res = await bridge.conversation.getSessionMessages(sessionId);
      if (cancelled) {
        return;
      }
      if (res.ok && res.data) {
        partHydrate(sessionId, res.data);
      }
      unsubscribe = bridge.subscribeSessionPartEvents((event: SseWireEvent) => {
        if (event.sessionID === sessionId) {
          partApplyEvent(sessionId, event);
        }
      });
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [sessionId, bridge, partHydrate, partApplyEvent]);

  const view = useMemo(
    () => (sessionId ? selectSessionMessages(partBySession ?? {}, sessionId) : undefined),
    [partBySession, sessionId],
  );
  return view;
}
