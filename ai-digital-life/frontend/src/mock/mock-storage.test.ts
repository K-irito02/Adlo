import { describe, it, expect } from 'vitest';
import { createMockStorage } from './mock-storage';
import { IMMOVABLE_ENTRY_KEYS } from '../shared/ipc/storage';

describe('mock-storage', () => {
  it('exposes all 11 categories', async () => {
    const s = createMockStorage();
    const res = await s.getStatus();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.categories).toHaveLength(11);
  });

  it('setPaths stores a pending migration', async () => {
    const s = createMockStorage();
    await s.setPaths(
      { mode: 'unified', root: 'D:/adl', categories: {}, retainSource: false },
      false,
    );
    const res = await s.getStatus();
    if (res.ok) expect(res.data.pending).not.toBeNull();
  });

  it('lists the six immovable keys', () => {
    expect(IMMOVABLE_ENTRY_KEYS).toEqual([
      'keyring',
      'machineId',
      'localStorage',
      'indexedDB',
      'webview2',
      'workspaceCache',
    ]);
  });
});
