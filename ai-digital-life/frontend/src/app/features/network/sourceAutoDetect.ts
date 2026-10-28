import { NPMJS_URL } from '@shared/settings-reset/networkReset';

/**
 * 下载源自动检测的共享候选与选优规则。
 *
 * 仅当 `source_mode=auto` 时调用；`manual` 模式下任何入口都不得自动改写用户选择。
 * 网络组、harness 向导与设置组的安装前置检查共用同一套候选与判定，避免三处漂移。
 */

export const NPMMIRROR_URL = 'https://registry.npmmirror.com';

export const AUTO_SOURCE_CANDIDATES = [NPMJS_URL, NPMMIRROR_URL] as const;

export interface SourceProbe {
  reachable: boolean;
  latency_ms: number | null;
}

/** 从探测结果中取可达且延迟最低者；全部不可达返回 null。 */
export function pickFastestSource<T extends SourceProbe>(
  probes: readonly (T | null | undefined)[],
): T | null {
  let best: T | null = null;
  for (const probe of probes) {
    if (!probe || probe.reachable !== true) {
      continue;
    }
    if (
      best === null ||
      (probe.latency_ms ?? Number.MAX_SAFE_INTEGER) < (best.latency_ms ?? Number.MAX_SAFE_INTEGER)
    ) {
      best = probe;
    }
  }
  return best;
}

/**
 * 并发探测全部候选并返回最快者（失败静默，不抛错）。
 * `testSource` 由调用方注入（通常是 dsh actions 的探针）。
 */
export async function detectFastestSource(
  testSource: (url: string, silent: boolean) => Promise<SourceProbe | null | undefined>,
  silent = true,
): Promise<string | null> {
  const results = await Promise.all(
    AUTO_SOURCE_CANDIDATES.map((url) => testSource(url, silent).catch(() => null)),
  );
  const probes = results.map((result, i) =>
    result ? { url: AUTO_SOURCE_CANDIDATES[i], ...result } : null,
  );
  return pickFastestSource(probes)?.url ?? null;
}
