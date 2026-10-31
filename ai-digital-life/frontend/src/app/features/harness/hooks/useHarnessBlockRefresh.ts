import { useCallback, useState } from 'react';
import type { RefObject } from 'react';
import type { HarnessVersionCardHandle } from '../HarnessVersionCard';

/**
 * 设置组块级「刷新全部」的宿主侧状态（DSH / OpenCode 共用）：
 *
 * - `cardBusy`：卡片忙碌（安装/卸载/检查在途或桥不可用）时由卡片回调透出，
 *   宿主据此禁用块级刷新按钮，避免 `refreshAll` 门控直接返回造成「点了没反应」。
 * - `refreshAll`：驱动整卡重载；在途时重复点击由 `refreshingAll` 挡住。
 */
export function useHarnessBlockRefresh(cardRef: RefObject<HarnessVersionCardHandle | null>) {
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [cardBusy, setCardBusy] = useState(false);

  const refreshAll = useCallback(() => {
    if (refreshingAll) {
      return;
    }
    setRefreshingAll(true);
    void (cardRef.current?.refreshAll() ?? Promise.resolve()).finally(() => {
      setRefreshingAll(false);
    });
  }, [cardRef, refreshingAll]);

  return { refreshingAll, cardBusy, setCardBusy, refreshAll };
}
