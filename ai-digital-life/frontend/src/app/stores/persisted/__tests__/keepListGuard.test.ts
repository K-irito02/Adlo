import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { registryEntries } from '../registry';
import { PERSIST_KEEP_KEYS } from '../registry';

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

function legacyKeysInProductionSource(): string[] {
  const found = new Set<string>();
  for (const file of collectProductionSources(join(process.cwd(), 'src'))) {
    const content = readFileSync(file, 'utf8');
    for (const match of content.matchAll(LEGACY_LITERAL)) {
      found.add(match[1]);
    }
  }
  return [...found];
}

describe('startup-cleanup allowlist guard', () => {
  it('every legacy key literal in production source is either registered or kept', () => {
    const registered = new Set(registryEntries.map((entry) => entry.key));
    const unguarded = legacyKeysInProductionSource().filter(
      (key) => !registered.has(key) && !PERSIST_KEEP_KEYS.has(key),
    );
    expect(
      unguarded,
      'these legacy keys would be deleted by startup cleanup — register them or add them to PERSIST_KEEP_KEYS',
    ).toEqual([]);
  });

  it('no kept key is already registered (migrations must narrow the list)', () => {
    const registered = new Set(registryEntries.map((entry) => entry.key));
    const redundant = [...PERSIST_KEEP_KEYS].filter((key) => registered.has(key));
    expect(redundant, 'remove these from PERSIST_KEEP_KEYS now that they are registered').toEqual(
      [],
    );
  });
});
