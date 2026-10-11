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
