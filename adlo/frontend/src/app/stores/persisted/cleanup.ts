import { registryEntries } from './registry';

export interface CleanupOptions {
  /** V2 盘点中登记的例外键（不属于本次接管范围但共用 adl 前缀），一律保留 */
  keep?: ReadonlySet<string>;
  /** 需要额外删除的键（如 hydrateAll 报告的解析失败/形状不合法的坏数据） */
  extra?: readonly string[];
}

/**
 * 启动清理：删除 adl: 命名空间下所有"不在登记表内"的键。
 *
 * 这是取代迁移代码的机制（规格 §3.5.3）：schema 变更时直接换键名或加版本段，
 * 旧键在下一次启动被本函数清除，因此不需要写任何读取旧格式的代码。
 */
export function cleanupUnregisteredKeys(options: CleanupOptions = {}): string[] {
  const registered = new Set(registryEntries.map((entry) => entry.key));
  const keep = options.keep ?? new Set<string>();
  const doomed = new Set<string>(options.extra ?? []);
  const removed: string[] = [];

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith('adl:') || registered.has(key) || keep.has(key)) {
        continue;
      }
      doomed.add(key);
    }
  } catch {
    return removed;
  }

  for (const key of doomed) {
    try {
      localStorage.removeItem(key);
      removed.push(key);
    } catch {
      // 存储不可用：静默跳过，绝不阻塞启动
    }
  }
  return removed;
}
