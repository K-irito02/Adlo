import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parsePersistKey } from '../entry';
import { registryEntries } from '../registry';

const LEGACY_PREFIXES = ['adl-ui:', 'adl-terminal:', 'adl-search:', 'adl-browser:'];
const SCAN_ROOT = join(process.cwd(), 'src/app/stores');

// 范围注记：Task 29 完成后，已迁移面即 stores 全面——此前按 T18 预检裁定
// （第 13 处计划缺陷）跳过的 CI/GitHub/通信/系统监控/uiSliceTypes 文件已全部收编，
// 不再需要 SKIP 例外；全仓（src/）的遗留字面量门禁由 keepListGuard 承担。
// 全行 // 注释在扫描前剔除：注释提及旧键名不算实际引用，
// 断言只关心代码中的真实使用。

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === '__tests__' ? [] : collectSourceFiles(full);
    }
    if (!/\.(ts|tsx)$/.test(name) || /\.test\.(ts|tsx)$/.test(name)) {
      return [];
    }
    return [full];
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
          offenders.push(`${file} references ${prefix}`);
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
