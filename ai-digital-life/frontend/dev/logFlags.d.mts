/**
 * Type declarations for `dev/logFlags.mjs`'s pure helpers, consumed by
 * `src/preview-bridge/log-flags-core.test.ts`. `dev/` is outside the tsc
 * `include: ["src"]` scope, so the `.mjs` needs an explicit declaration here.
 */

/** CLI flag → 环境变量键。 */
export const LOG_FLAG_ENV: Record<string, string>;

export interface ParsedLogFlags {
  /** 注入给子进程环境（shell 派生的 ad-server 会继承）——唯一传递通道。 */
  env: Record<string, string>;
  /** 未消费的其余参数（原样转发给 Vite）。 */
  restArgs: string[];
}

export function parseLogFlags(
  argv: string[],
  warn?: (message: string) => void,
): ParsedLogFlags;

export function debugLogModeForVite(env: Record<string, string>): string | undefined;