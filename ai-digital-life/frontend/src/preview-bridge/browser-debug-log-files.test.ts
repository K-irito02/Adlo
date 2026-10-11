import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  browserDebugLogFileNames,
  writeDebugLogs,
} from '../../dev/previewWorkspaceService/logging';

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
    expect(browserDebugLogFileNames('multi', at).session).toBe(
      'debug-logs-browser-2026-10-11_230509.txt',
    );
  });
});

describe('writeDebugLogs', () => {
  // Closing L7：`now` 可注入使会话文件名确定；失败返回 false（不抛）。
  it('writes fixed + session files in multi mode with injected time', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'adl-logtest-'));
    const at = new Date(2026, 9, 11, 23, 5, 9);
    const ok = await writeDebugLogs(root, 'hello', 'multi', at);
    expect(ok).toBe(true);
    expect(readFileSync(path.join(root, '.adl-logs', 'debug-logs-browser.txt'), 'utf8')).toBe(
      'hello',
    );
    expect(
      readFileSync(
        path.join(root, '.adl-logs', 'debug-logs-browser-2026-10-11_230509.txt'),
        'utf8',
      ),
    ).toBe('hello');
  });

  it('returns false instead of throwing when the directory is unusable', async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'adl-logtest-')), 'blocker');
    writeFileSync(file, 'x');
    // rootPath 本身是文件：mkdir 失败 → false（调用方收到 ok(false) 而非传输异常）。
    await expect(writeDebugLogs(path.join(file, 'sub'), 'hello', 'overwrite')).resolves.toBe(false);
    expect(existsSync(path.join(file, 'sub'))).toBe(false);
  });
});
