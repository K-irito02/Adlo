import type { EnvStatus } from '../../../shared/ipc/env';
import type { StoreState } from '../StoreState';
import { persistField } from '../persisted/apply';

export interface EnvSlice {
  /** 环境依赖全量状态（node/git/bash/webview2/adlserver/netprobe/task/dshReady，8 键） */
  envStatus: EnvStatus | null;
  /** 用户发起的环境操作进行中（拉取/切换/安装/路径/重检；静默后台同步不碰） */
  envBusy: boolean;
  /**
   * 环境引导已完成（persisted registry `adl:env.wizardDone`，Task 8 读写；
   * 本任务只定义字段与读写器）。
   */
  envWizardDone: boolean;
  /**
   * 环境引导跳过时间戳（ms；persisted registry `adl:env.wizardSkippedAt`，
   * null = 未跳过；Task 8 读写，本任务只定义字段与读写器）。
   */
  envWizardSkippedAt: number | null;
  /**
   * 向导重新打开请求序号（session-only，不落盘）：每次「继续向导」自增，
   * App 侧 effect 以它为依赖重新打开向导。`envWizardDone` 已为 false 时
   * 单纯置 false 不会产生状态变化，故必须靠这个 nonce 触发。
   */
  envWizardRequestId: number;

  setEnvStatus: (status: EnvStatus | null) => void;
  setEnvBusy: (busy: boolean) => void;
  setEnvWizardDone: (done: boolean) => void;
  setEnvWizardSkippedAt: (at: number | null) => void;
  /** 请求打开首启向导：重置 done（持久化）+ 自增 session nonce。 */
  requestEnvWizard: () => void;
}

export const createEnvSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): EnvSlice => ({
  envStatus: null,
  envBusy: false,
  envWizardDone: false,
  envWizardSkippedAt: null,
  envWizardRequestId: 0,

  setEnvStatus: (status) => set({ envStatus: status }),
  setEnvBusy: (busy) => set({ envBusy: busy }),
  setEnvWizardDone: (done) => set(persistField('adl:env.wizardDone', done)),
  setEnvWizardSkippedAt: (at) => set(persistField('adl:env.wizardSkippedAt', at)),
  requestEnvWizard: () =>
    set((state) => ({
      ...persistField('adl:env.wizardDone', false),
      envWizardRequestId: state.envWizardRequestId + 1,
    })),
});
