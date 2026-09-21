import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Task 29 收尾门禁（全仓）：过渡保留名单 PERSIST_KEEP_KEYS 已删除，
// 生产源码中不得再残留任何遗留键字面量（adl-ui: / adl-terminal: /
// adl-search: / adl-browser:）。此前受保护的 17 个键已全部收编——
// 16 个登记进 registry，adl-ui:github-access-token 在生产代码中本就不存在
// （仅 mock-ci 注释，ledger F），注释示例已改为新式键名。
// 新式 adl:<domain>.<name> 键不在本表达式覆盖范围内。
// 用例内字面量与 mock 注释中的新式示例键不受影响（仅扫描遗留前缀）。

const LEGACY_LITERAL = /'(adl-(?:ui|terminal|search|browser):[a-zA-Z0-9:._-]+)'/g;

function collectProductionSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === '__tests__' ? [] : collectProductionSources(full);
    }
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe('startup-cleanup allowlist guard', () => {
  it('no legacy key literal remains in production source (keep-list retired)', () => {
    const offenders: string[] = [];
    for (const file of collectProductionSources(join(process.cwd(), 'src'))) {
      const content = readFileSync(file, 'utf8');
      for (const match of content.matchAll(LEGACY_LITERAL)) {
        offenders.push(`${file}: ${match[1]}`);
      }
    }
    expect(
      offenders,
      'legacy keys must be registered under a new adl: key (or removed) — the transition keep-list no longer exists',
    ).toEqual([]);
  });
});
