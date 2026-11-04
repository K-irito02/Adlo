import type {
  DshVersionCatalog,
  DshVersionStatus,
  DshSourceStatus,
  DshVersionTask,
  DshVersionSourceMode,
  DshRunningInfo,
  DshSettingsSnapshot,
} from '../../../shared/ipc/dsh';
import type { StoreState } from '../StoreState';
import { readJson, writeJson } from '../storageHelpers';

/** “下次启动生效”的待应用版本来源（localStorage 持久化，重启后由启动逻辑消费）。 */
const PENDING_SOURCE_KEY = 'adl:dsh.versionSourcePending';

function readPendingSource(): DshVersionSourceMode | null {
  const raw = readJson<unknown>(PENDING_SOURCE_KEY, null);
  return raw === 'auto' || raw === 'system' || raw === 'host' ? raw : null;
}

export interface DshSlice {
  /** dsh 版本目录状态（当前选中/已装/最新/是否有更新，含预发布通道） */
  versionStatus: DshVersionStatus | null;
  /** dsh 官方版本目录（正式版/预发布分桶；设置页版本块按需拉取） */
  versionCatalog: DshVersionCatalog | null;
  /** 官方版本目录上次拉取是否失败（用于区分“暂无版本”与“未知”） */
  versionCatalogFailed: boolean;
  /**
   * 首屏快照 source 腿失败且无任何可用来源数据（S3）：
   * true 时读数区显示错误态，不再无限骨架；成功腿到达即清除。
   */
  settingsSnapshotFailed: boolean;
  /** dsh 下载源状态（system / running / versionSource / config） */
  sourceStatus: DshSourceStatus | null;
  /** 当前版本任务真实进度（无任务为 null） */
  versionTask: DshVersionTask | null;
  /** 本次版本任务是否已请求取消（用于抑制取消导致的错误卡片） */
  versionTaskCancelRequested: boolean;
  /** 版本来源“下次启动生效”延迟标记（仅内存态；应用重启后按持久化来源生效） */
  dshVersionSourceDeferred: boolean;
  /**
   * “下次启动生效”待应用的版本来源（localStorage 持久化，重启后由启动逻辑
   * `applyPendingVersionSource` 落盘并重启生效；会话内选择器仍显示当前生效来源）。
   */
  dshVersionSourcePending: DshVersionSourceMode | null;
  /**
   * 最近一次成功拉起/重启的 dsh 入口 URL（仅内存态，不持久化）。
   * 卸载到空时运行中 URL 已无处可查（sourceStatus.running 为 null），用它按
   * origin 同源关闭残留 dsh 标签；query 剥离后再记（凭据红线）。
   */
  dshLastUrl: string | null;
  /**
   * dsh 重启进行中（版本操作后的重启长尾也覆盖；入口页/欢迎页据此拦截提前打开，
   * toast 提示稍候——用户实测 2026-10-21：安装后立即点开会被灰掉几秒）。
   */
  dshRestarting: boolean;

  setDshVersionStatus: (status: DshVersionStatus | null) => void;
  setDshVersionCatalog: (catalog: DshVersionCatalog | null) => void;
  setVersionCatalogFailed: (failed: boolean) => void;
  setDshSourceStatus: (status: DshSourceStatus | null) => void;
  /** 首屏原子快照：三份数据同一次提交，避免分段渲染导致块内跳动。 */
  setDshSettingsSnapshot: (snapshot: DshSettingsSnapshot) => void;
  /** 轻量轮询：更新 running 与「拉起中」标志（sourceStatus 未就绪时为空操作）。 */
  setDshRunning: (running: DshRunningInfo | null, starting: boolean) => void;
  setDshVersionTask: (task: DshVersionTask | null) => void;
  setVersionTaskCancelRequested: (requested: boolean) => void;
  setDshVersionSourceDeferred: (deferred: boolean) => void;
  setDshVersionSourcePending: (mode: DshVersionSourceMode | null) => void;
  setDshLastUrl: (url: string | null) => void;
  setDshRestarting: (restarting: boolean) => void;
  /**
   * 版本变更操作进行中（安装/切换/重装/卸载，已含重启长尾；由 UI 层各 handler
   * 在操作开始时同步置 true、结束时复位——store 级同步标志，无 action 异步间隙）。
   * 入口守卫据此拦截提前打开（轮询到 versionTask 前约一拍的窗口也覆盖）。
   */
  dshOpBusy: boolean;
  setDshOpBusy: (busy: boolean) => void;
}

export const createDshSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): DshSlice => ({
  versionStatus: null,
  versionCatalog: null,
  versionCatalogFailed: false,
  settingsSnapshotFailed: false,
  sourceStatus: null,
  versionTask: null,
  versionTaskCancelRequested: false,
  dshVersionSourceDeferred: false,
  dshVersionSourcePending: readPendingSource(),
  dshLastUrl: null,
  dshRestarting: false,
  dshOpBusy: false,

  setDshVersionStatus: (status) => set({ versionStatus: status }),
  setDshVersionCatalog: (catalog) => set({ versionCatalog: catalog }),
  setVersionCatalogFailed: (failed) => set({ versionCatalogFailed: failed }),
  setDshSourceStatus: (status) => set({ sourceStatus: status }),
  setDshSettingsSnapshot: (snapshot) =>
    set((state) => ({
      // L2 按腿降级：失败腿为 null 时保留旧值，不清空已有读数。
      sourceStatus: snapshot.sourceStatus ?? state.sourceStatus,
      versionStatus: snapshot.versionStatus ?? state.versionStatus,
      // catalog 为 null 表示本次拉取失败：保留旧列表（若有），仅标记未知态。
      versionCatalog: snapshot.catalog ?? state.versionCatalog,
      versionCatalogFailed: snapshot.catalog === null,
      // 快照 source 腿失败且无任何可用来源数据：读数区切错误态，不再无限骨架（S3）。
      settingsSnapshotFailed: snapshot.sourceStatus === null && state.sourceStatus === null,
    })),
  setDshRunning: (running, starting) =>
    set((state) => {
      if (!state.sourceStatus) {
        return {};
      }
      const versionSource = state.sourceStatus.versionSource;
      // 运行状态变化后同步 effective：running 出现恒优先；消失则回退到后端给出的
      // 偏好解析（resolvedByMode[mode]），不在前端复制来源优先级。
      const effective = running ? 'running' : versionSource.resolvedByMode[versionSource.mode];
      return {
        sourceStatus: {
          ...state.sourceStatus,
          running,
          starting,
          versionSource: { ...versionSource, effective },
        },
      };
    }),
  setDshVersionTask: (task) => set({ versionTask: task }),
  setVersionTaskCancelRequested: (requested) => set({ versionTaskCancelRequested: requested }),
  setDshVersionSourceDeferred: (deferred) => set({ dshVersionSourceDeferred: deferred }),
  setDshVersionSourcePending: (mode) => {
    set({ dshVersionSourcePending: mode });
    writeJson(PENDING_SOURCE_KEY, mode);
  },
  setDshLastUrl: (url) => set({ dshLastUrl: url }),
  setDshRestarting: (restarting) => set({ dshRestarting: restarting }),
  setDshOpBusy: (busy) => set({ dshOpBusy: busy }),
});
