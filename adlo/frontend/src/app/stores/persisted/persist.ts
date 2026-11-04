import { scheduleCrossSliceWrite } from '../storageHelpers';
import type { RegistryKey, RegistryValue } from './registry';

/**
 * 唯一的 UI 状态写盘入口。
 *
 * 硬性约束（见规格 §3.2.2）：
 * - 任何 slice 都不得自建去抖写入器，也不得直接调用 localStorage.setItem；
 * - 本函数复用 storageHelpers 的跨切片共享去抖调度器，因此自动被
 *   flushCrossSliceWrites() 覆盖（关窗/卸载时不会丢最后一次改动）；
 * - 写入失败（如配额超限）由 storageHelpers.writeJson 静默吞掉并仅首次告警，
 *   绝不重试、绝不清理其他键。
 */
export function persist<K extends RegistryKey>(key: K, value: RegistryValue<K>): void {
  scheduleCrossSliceWrite(key, value);
}
