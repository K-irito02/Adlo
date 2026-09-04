import type { SystemMonitorBridge, SystemSnapshot } from "../shared/ipc";

/** 一份静态的系统快照 mock 数据（CPU/内存/磁盘/网络/进程）。 */
function mockSnapshot(): SystemSnapshot {
  return {
    cpuTotal: 12.5,
    cpuPerCore: [10.2, 14.1, 12.8, 9.4],
    memoryUsed: 8_388_608_000,
    memoryTotal: 16_777_216_000,
    swapUsed: 0,
    swapTotal: 0,
    disks: [{ mount: "C:", total: 512_000_000_000, available: 256_000_000_000 }],
    networks: [{ name: "ethernet", rxBps: 12_345, txBps: 6_789 }],
    processes: [{ pid: 1, name: "ai-digital-life", cpuUsage: 5.2, memory: 1_234_567_890 }],
    uptimeSecs: 3600,
  };
}

/**
 * 内存版系统状态监控 mock。浏览器 mock / 预览模式在 ad-server 不可达时的回退实现：
 * 返回一份静态系统快照。
 */
export const mockSystemMonitor: SystemMonitorBridge = {
  snapshot: async () => ({ ok: true, data: mockSnapshot() }),
};