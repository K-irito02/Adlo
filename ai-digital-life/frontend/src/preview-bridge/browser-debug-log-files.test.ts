import { describe, it, expect } from 'vitest';
import { browserDebugLogFileNames } from '../../dev/previewWorkspaceService/logging';

/**
 * 浏览器模式调试日志文件名必须与 Tauri 桌面壳写的 `debug-logs*.txt` 区分开：
 * 二者同落 `<仓库根>/.adl-logs/`，同名会在 `dev:both`（双端并行）下互相覆盖。
 */
describe('browserDebugLogFileNames', () => {
  const at = new Date(2026, 9, 11, 23, 5, 9); // 2026-10-11 23:05:09 (local)

  it('uses a browser-specific fixed name (never collides with the shell debug-logs.txt)', () => {
    expect(browserDebugLogFileNames('overwrite').fixed).toBe('debug-logs-browser.txt');
    expect(browserDebugLogFileNames('append').fixed).toBe('debug-logs-browser.txt');
    expect(browserDebugLogFileNames('multi').fixed).toBe('debug-logs-browser.txt');
  });

  it('adds a timestamped session file only in multi mode', () => {
    expect(browserDebugLogFileNames('overwrite', at).session).toBeNull();
    expect(browserDebugLogFileNames('append', at).session).toBeNull();
    expect(browserDebugLogFileNames('multi', at).session).toBe('debug-logs-browser-2026-10-11_230509.txt');
  });
});