import fs from 'node:fs/promises';
import path from 'node:path';

export async function writeDebugLogs(rootPath: string, content: string, mode: 'overwrite' | 'append' | 'multi' = 'overwrite'): Promise<boolean> {
  const logDir = path.resolve(rootPath, '.adl-logs');
  await fs.mkdir(logDir, { recursive: true });

  const fixedFile = path.join(logDir, 'debug-logs.txt');

  switch (mode) {
    case 'overwrite':
      await fs.writeFile(fixedFile, content, 'utf8');
      break;
    case 'append':
      await fs.appendFile(fixedFile, content, 'utf8');
      break;
    case 'multi': {
      const ts = new Date();
      const stamp = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')}_${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}${String(ts.getSeconds()).padStart(2, '0')}`;
      const sessionFile = path.join(logDir, `debug-logs-${stamp}.txt`);
      await fs.writeFile(fixedFile, content, 'utf8');
      await fs.writeFile(sessionFile, content, 'utf8');
      break;
    }
  }
  return true;
}
