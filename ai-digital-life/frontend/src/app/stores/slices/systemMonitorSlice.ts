/**
 * 系统监控切片
 * 管理系统资源快照（CPU/内存/磁盘/网络/进程）与面板折叠状态
 */
import type { SystemSnapshot } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';
import { readFlag, writeFlag } from '../shared';

export const SYSMON_COLLAPSED_KEY = 'adl-ui:sysmon-collapsed';

export interface SystemMonitorSlice {
  sysmonSnapshot: SystemSnapshot | null;
  sysmonCollapsed: boolean;

  setSysmonSnapshot: (snap: SystemSnapshot | null) => void;
  toggleSysmonCollapsed: () => void;
}

export const createSystemMonitorSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): SystemMonitorSlice => ({
  sysmonSnapshot: null,
  sysmonCollapsed: readFlag(SYSMON_COLLAPSED_KEY, true),

  setSysmonSnapshot: (snap) => set({ sysmonSnapshot: snap }),
  toggleSysmonCollapsed: () =>
    set((state) => {
      const next = !state.sysmonCollapsed;
      writeFlag(SYSMON_COLLAPSED_KEY, next);
      return { sysmonCollapsed: next };
    }),
});
