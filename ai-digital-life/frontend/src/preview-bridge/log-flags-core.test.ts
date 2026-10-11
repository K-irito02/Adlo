import { describe, it, expect, vi } from 'vitest';

/**
 * 开发阶段日志 CLI 参数解析（`dev/logFlags.mjs`）。
 *
 * `dev/` 不在 tsc 的 `include: ["src"]` 范围内，故测试置于 `src/` 并直接导入
 * 纯 ESM helper（与 `ad-server-launch-core.test.ts` 同一约定）。
 *
 * 注意：日志覆盖**只经环境变量传递**——`cargo tauri dev` 会把 `--` 之后的参数
 * 当成 cargo 自身的参数（实测 `unexpected argument '--log-level'`），因此本
 * helper 不再产出 `appArgs`。
 */
import { LOG_FLAG_ENV, debugLogModeForVite, parseLogFlags } from '../../dev/logFlags.mjs';

describe('parseLogFlags', () => {
  it('maps all three flags to their env keys', () => {
    const { env, restArgs } = parseLogFlags([
      '--log-level',
      'trace',
      '--terminal-log-mode',
      'multi',
      '--debug-log-mode',
      'append',
    ]);

    expect(env).toEqual({
      ADL_LOG_LEVEL: 'trace',
      ADL_TERMINAL_LOG_MODE: 'multi',
      ADL_DEBUG_LOG_MODE: 'append',
    });
    expect(restArgs).toEqual([]);
  });

  it('maps the shorthand --log-mode to the combined env key', () => {
    const { env } = parseLogFlags(['--log-mode', 'multi']);
    expect(env).toEqual({ ADL_CLI_LOG_MODE: 'multi' });
    expect(LOG_FLAG_ENV['--log-mode']).toBe('ADL_CLI_LOG_MODE');
  });

  it('keeps unrelated args in restArgs (e.g. vite --port) and never forwards log flags', () => {
    const { restArgs, env } = parseLogFlags(['--port', '5174', '--log-level', 'debug']);
    expect(restArgs).toEqual(['--port', '5174']);
    expect(env).toEqual({ ADL_LOG_LEVEL: 'debug' });
    // 日志 flag 不得进入 restArgs（否则会被转发给 vite / cargo 而报错）。
    expect(restArgs).not.toContain('--log-level');
  });

  it('warns and skips a flag with no value', () => {
    const warn = vi.fn();
    const { env, restArgs } = parseLogFlags(['--log-level', '--log-mode', 'append'], warn);

    expect(warn).toHaveBeenCalledWith('[adl-run] ignoring --log-level with no value');
    expect(env).toEqual({ ADL_CLI_LOG_MODE: 'append' });
    expect(restArgs).toEqual([]);
  });

  it('warns and skips a trailing flag with no value', () => {
    const warn = vi.fn();
    const { env } = parseLogFlags(['--debug-log-mode'], warn);
    expect(warn).toHaveBeenCalled();
    expect(env).toEqual({});
  });
});

describe('debugLogModeForVite', () => {
  it('prefers the specific debug mode over the shorthand', () => {
    expect(debugLogModeForVite({ ADL_DEBUG_LOG_MODE: 'append', ADL_CLI_LOG_MODE: 'multi' })).toBe(
      'append',
    );
  });

  it('falls back to the shorthand and to undefined', () => {
    expect(debugLogModeForVite({ ADL_CLI_LOG_MODE: 'multi' })).toBe('multi');
    expect(debugLogModeForVite({})).toBeUndefined();
  });
});
