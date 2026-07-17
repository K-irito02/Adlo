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

export * from './shared';
export * from './window';
export * from './app';
export * from './workspace';
export * from './retrieval';
export * from './conversation';
export * from './agent';
export * from './subagent';
export * from './patch';
export * from './command';
export * from './pty';
export * from './task';
export * from './run-activity';
export * from './browser';
export * from './github';
export * from './mcp';
export * from './provider';
export * from './snapshot';
export * from './web_tools';
export * from './commands_config';
export * from './permission';
export * from './compaction';
export * from './session_fork';
export * from './lsp';
export * from './reference';
export * from './custom_agent';
export * from './durable';
export * from './reserved';
export * from './digital-life';
