import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parsePersistKey } from '../entry';
import { registryEntries } from '../registry';

const LEGACY_PREFIXES = ['adl-ui:', 'adl-terminal:', 'adl-search:', 'adl-browser:'];
const SCAN_ROOT = join(process.cwd(), 'src/app/stores');

// 裁定（第 13 处计划缺陷）：扫描限定已迁移面。
// 以下不在范围内（各自由其归属任务守卫）：
// - __tests__ 目录与 *.test.*：含"旧键已被清除"断言字面量；
// - ciSlice / communicateSlice / githubSlice(+Helpers) / githubRepoSlice(+Helpers) /
//   systemMonitorSlice：T29 登记前保持原样；
// - slices/uiSliceTypes.ts：RIGHT_PANEL_* 待 T22 收敛；
// - persisted/registry.ts：PERSIST_KEEP_KEYS 字面量由 keepListGuard 守卫。
// 全行 // 注释在扫描前剔除：注释提及旧键名是文档需要，不构成读写；
// 门禁只关心代码行的真实引用。
// 死键 adl-ui:browser-workspace-expanded 已由 Task 20 全套删除，本测试为零例外。

const SKIP_BASENAMES = new Set([
  'ciSlice.ts',
  'communicateSlice.ts',
  'githubSlice.ts',
  'githubSliceHelpers.ts',
  'githubRepoSlice.ts',
  'githubRepoSliceHelpers.ts',
  'systemMonitorSlice.ts',
  'uiSliceTypes.ts',
  'registry.ts',
]);

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === '__tests__' ? [] : collectSourceFiles(full);
    }
    if (!/\.(ts|tsx)$/.test(name) || /\.test\.(ts|tsx)$/.test(name)) {
      return [];
    }
    return SKIP_BASENAMES.has(name) ? [] : [full];
  });
}

function stripFullLineComments(content: string): string {
  return content
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

describe('key namespace', () => {
  it('no migrated-surface source references a legacy prefix', () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles(SCAN_ROOT)) {
      const code = stripFullLineComments(readFileSync(file, 'utf8'));
      for (const prefix of LEGACY_PREFIXES) {
        if (code.includes(prefix)) {
          offenders.push(`${file} → ${prefix}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every adl: literal in the registry parses as a valid persist key', () => {
    for (const entry of registryEntries) {
      expect(parsePersistKey(entry.key)).not.toBeNull();
    }
  });
});
