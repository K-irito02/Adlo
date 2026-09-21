import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// 死状态清单（Task 20）：下列符号在 frontend/src 的生产代码中不得再存在。
// - browserWorkspaceExpanded 全套（含 T11 门禁的唯一 grep 例外）：浏览器树工作区行展开
//   由 browserTabTreeExpanded['workspace:<id>'] 驱动（见 useBrowserTreeData.ts 与
//   browserFoldersSlice.ts 的 path 切换），该字段是只写无读的死状态；
// - browserPersisted / browserWorkspaceId(+setter)、terminalPersisted(+setter)：旧水合标志与残留字段；
// - normalizeTerminalShellProfile：T10 已把最后生产调用移交 registry 条目 read；
// - collapseAllFileTreePaths：文件侧（无调用点）；collapseAllChangesTreePaths 有调用点，保留；
// - SESSION_TABS_EXPANDED_KEY：已无残留，作回归哨兵保留。
const DEAD_SYMBOLS = [
  'browserWorkspaceExpanded',
  'browserPersisted',
  'browserWorkspaceId',
  'setBrowserPersisted',
  'setBrowserWorkspaceId',
  'terminalPersisted',
  'setTerminalPersisted',
  'normalizeTerminalShellProfile',
  'collapseAllFileTreePaths',
  'SESSION_TABS_EXPANDED_KEY',
];

function collect(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return collect(full);
    }
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe('dead state is removed', () => {
  it('no production file references any dead symbol', () => {
    const offenders: string[] = [];
    for (const file of collect(join(process.cwd(), 'src'))) {
      if (file.includes('__tests__') || file.endsWith('.test.ts') || file.endsWith('.test.tsx')) {
        continue;
      }
      const content = readFileSync(file, 'utf8');
      for (const symbol of DEAD_SYMBOLS) {
        if (content.includes(symbol)) {
          offenders.push(`${file} → ${symbol}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
