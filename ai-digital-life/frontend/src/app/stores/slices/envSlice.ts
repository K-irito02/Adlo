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

  setEnvStatus: (status: EnvStatus | null) => void;
  setEnvBusy: (busy: boolean) => void;
  setEnvWizardDone: (done: boolean) => void;
  setEnvWizardSkippedAt: (at: number | null) => void;
}

export const createEnvSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): EnvSlice => ({
  envStatus: null,
  envBusy: false,
  envWizardDone: false,
  envWizardSkippedAt: null,

  setEnvStatus: (status) => set({ envStatus: status }),
  setEnvBusy: (busy) => set({ envBusy: busy }),
  setEnvWizardDone: (done) => set(persistField('adl:env.wizardDone', done)),
  setEnvWizardSkippedAt: (at) => set(persistField('adl:env.wizardSkippedAt', at)),
});
