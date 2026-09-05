/**
 * IPC domain barrel.
 *
 * Convention:
 * - Each domain file (`./<domain>.ts`) exports its own types and bridge
 *   interfaces. This barrel re-exports them all via `export *`.
 * - No two domain files may export a symbol with the same name — ESLint
 *   will not catch this (wildcard re-exports are untyped at the barrel
 *   level). Manually verify before adding a new domain.
 * - New domains: add `export * from './<domain>';` below in alphabetical
 *   order. Run `pnpm --dir frontend run typecheck` to confirm no
 *   collisions.
 */

export * from './app';
export * from './clipboard';
export * from './dsh';
export * from './system_monitor';
export * from './workspace';
export * from './patch';
