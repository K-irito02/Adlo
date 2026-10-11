import fs from 'node:fs/promises';
import path from 'node:path';

/** 浏览器模式调试日志文件名（`multi` 另写一份按时间戳的会话文件）。 */
export function browserDebugLogFileNames(
  mode: 'overwrite' | 'append' | 'multi',
  now: Date = new Date(),
): { fixed: string; session: string | null } {
  const fixed = 'debug-logs-browser.txt';
  if (mode !== 'multi') {
    return { fixed, session: null };
  }
  const stamp =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` +
    `_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  return { fixed, session: `debug-logs-browser-${stamp}.txt` };
}

/**
 * 写入浏览器模式的调试日志到 `<rootPath>/.adl-logs/`。
 *
 * 文件名固定为 `debug-logs-browser*.txt`：Tauri 桌面壳写的是 `debug-logs*.txt`
 * （同为 `<仓库根>/.adl-logs/`），二者若同名会在 `dev:both`（双端并行）下互相
 * 覆盖；按进程/模式分名后互不干扰。
 */
export async function writeDebugLogs(rootPath: string, content: string, mode: 'overwrite' | 'append' | 'multi' = 'overwrite'): Promise<boolean> {
  const logDir = path.resolve(rootPath, '.adl-logs');
  await fs.mkdir(logDir, { recursive: true });

  const { fixed, session } = browserDebugLogFileNames(mode);
  const fixedFile = path.join(logDir, fixed);

  switch (mode) {
    case 'overwrite':
      await fs.writeFile(fixedFile, content, 'utf8');
      break;
    case 'append':
      await fs.appendFile(fixedFile, content, 'utf8');
      break;
    case 'multi': {
      // `session` 在 multi 分支恒非空（见 browserDebugLogFileNames）：显式守卫
      // 代替 `as string`，避免未来 mode 联合扩展而此处忘更新时把 null 变成运行时
      // TypeError（Phase 4 F11；编译期即可发现）。
      if (session === null) {
        throw new Error('browserDebugLogFileNames returned no session file for multi mode');
      }
      await fs.writeFile(fixedFile, content, 'utf8');
      await fs.writeFile(path.join(logDir, session), content, 'utf8');
      break;
    }
  }
  return true;
}
