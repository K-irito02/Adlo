/**
 * Type declarations for `dev/ad-server-launch.mjs`'s pure helpers, consumed by
 * `src/preview-bridge/ad-server-launch-core.test.ts`. The orchestrator body is
 * guarded to run only as the main module, so importing this module is
 * side-effect free (spawns nothing).
 */

export interface ProbeHealthOptions {
  timeoutMs?: number;
  intervalMs?: number;
  fetchImpl?: (input: string) => Promise<{ ok: boolean }>;
}

/** Health-probe `/health` until it answers ok or the timeout elapses. */
export function probeAdServerHealth(
  baseUrl: string,
  options?: ProbeHealthOptions,
): Promise<boolean>;

/** 后端引擎的 Cargo 包名（与 `crates/server/Cargo.toml` 的 `name` 同源，单测校验）。 */
export const AD_SERVER_PACKAGE: string;

/** 后端引擎产物名（win32 带 `.exe`）。 */
export const AD_SERVER_BIN_NAME: string;

/** Decide the injected baseUrl; `null` means fall back to the preview/mock bridge. */
export function decideServerBaseUrl(
  port: number | null | undefined,
  healthy: boolean,
): string | null;

/** 组装 Vite 子进程 env（日志 flag 经 env 注入 + VITE_ 映射；Closing L6）。 */
export function buildViteEnv(
  baseEnv: Record<string, string | undefined>,
  logFlagsEnv: Record<string, string>,
  adServerBaseUrl: string | null,
): Record<string, string | undefined>;

/** 组装 ad-server 子进程 env（env 是唯一传递通道；Closing L6）。 */
export function buildAdServerEnv(
  baseEnv: Record<string, string | undefined>,
  logFlagsEnv: Record<string, string>,
): Record<string, string | undefined>;

/** ad-server dev 数据目录：工作树实例落在各自 target 下，主工作树沿用 tmp。 */
export function resolveDevDataDir(
  repoRoot: string,
  env?: Record<string, string | undefined>,
): string;
