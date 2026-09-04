import type { IpcResult, SystemSnapshot } from '@ai-digital-life/kernel';

export type { IpcResult, SystemSnapshot };

/**
 * 系统状态监控桥接能力
 * 用于: 获取最新系统快照（CPU/内存/磁盘/网络/进程 Top-N）
 * 后端路由: GET /sysmon/snapshot
 */
export interface SystemMonitorBridge {
  /**
   * 获取最新系统快照（CPU/内存/磁盘/网络/进程 Top-N）
   * @returns 系统资源快照
   * @command GET /sysmon/snapshot
   * @see tauri-bridge/index.ts → systemMonitor.snapshot
   * @see mock-bridge.ts → systemMonitor.snapshot
   * @see preview-bridge/index.ts → systemMonitor.snapshot
   */
  snapshot: () => Promise<IpcResult<SystemSnapshot>>;
}
