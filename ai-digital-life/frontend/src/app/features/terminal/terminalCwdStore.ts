import { readJson } from '@stores/storageHelpers';
import { persist } from '@stores/persisted/persist';

/**
 * 按**标签 id** 持久化「上次所在目录」（由 shell 通过 OSC 9;9 上报，见 `terminalCwdOsc.ts`）。
 *
 * 为什么按标签而不是按会话：应用重启后旧会话已被 kill、会话 id 会变，
 * 而标签 id 稳定不变，重建会话时正需要用标签 id 取回目录。
 */
export const TERMINAL_CWD_KEY = 'adl:terminal.cwdByTab';

// 模块级缓存：构造期水合（persisted/registry 的 apply 汇聚器）填值，之后 loadAll 直接返回缓存。
// cacheSet 防御：构造期 apply 未运行（测试路径 / 提前调用）时，按需读一次存储避免返回错误空值。
let cache: Record<string, string> = {};
let cacheSet = false;

export const terminalCwdStore = {
  loadAll(): Record<string, string> {
    if (!cacheSet) {
      cache = readJson<Record<string, string>>(TERMINAL_CWD_KEY, {});
      cacheSet = true;
    }
    return cache;
  },
  /** 写入整个映射（去抖，合并高频上报）；退役私有去抖，接入共享去抖与关窗 flush */
  saveAll(map: Record<string, string>): void {
    cache = map;
    cacheSet = true;
    persist(TERMINAL_CWD_KEY, map);
  },
  /** 构造期水合：把校验+剪枝后的值交回模块缓存 */
  apply(value: Record<string, string>): void {
    cache = value;
    cacheSet = true;
  },
};
