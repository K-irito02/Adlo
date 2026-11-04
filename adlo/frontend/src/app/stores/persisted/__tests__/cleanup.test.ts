import { describe, it, expect, beforeEach } from 'vitest';
import { cleanupUnregisteredKeys } from '../cleanup';
import { registryEntries } from '../registry';

const REGISTERED = registryEntries[0].key;

describe('cleanupUnregisteredKeys', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes unregistered adl: keys', () => {
    localStorage.setItem(REGISTERED, '{"workspace_a":true}');
    localStorage.setItem('adl:legacy.thing', '1');
    const removed = cleanupUnregisteredKeys();
    expect(removed).toEqual(['adl:legacy.thing']);
    expect(localStorage.getItem('adl:legacy.thing')).toBeNull();
  });

  it('keeps registered keys', () => {
    localStorage.setItem(REGISTERED, '{"workspace_a":true}');
    cleanupUnregisteredKeys();
    expect(localStorage.getItem(REGISTERED)).toBe('{"workspace_a":true}');
  });

  it('never touches keys outside the adl: namespace', () => {
    localStorage.setItem('some-other-app:key', '1');
    localStorage.setItem('adl-avatars-db', '2');
    const removed = cleanupUnregisteredKeys();
    expect(removed).toEqual([]);
    expect(localStorage.getItem('some-other-app:key')).toBe('1');
    expect(localStorage.getItem('adl-avatars-db')).toBe('2');
  });

  it('honours the keep allowlist (exceptions recorded from the V2 inventory)', () => {
    localStorage.setItem('adl:exempt.thing', '1');
    const removed = cleanupUnregisteredKeys({ keep: new Set(['adl:exempt.thing']) });
    expect(removed).toEqual([]);
    expect(localStorage.getItem('adl:exempt.thing')).toBe('1');
  });

  it('removes corrupt keys reported by hydrateAll as dirty', () => {
    localStorage.setItem('adl:corrupt.value', '1');
    const removed = cleanupUnregisteredKeys({ extra: ['adl:corrupt.value'] });
    expect(removed).toEqual(['adl:corrupt.value']);
  });

  it('does not throw when storage access is denied', () => {
    const original = Storage.prototype.removeItem;
    Storage.prototype.removeItem = () => {
      throw new Error('denied');
    };
    expect(() => cleanupUnregisteredKeys()).not.toThrow();
    Storage.prototype.removeItem = original;
  });
});
