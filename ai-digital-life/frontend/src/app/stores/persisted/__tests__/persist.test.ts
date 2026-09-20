import { describe, it, expect, beforeEach } from 'vitest';
import { persist } from '../persist';
import { flushCrossSliceWrites } from '@stores/storageHelpers';

describe('persist', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('coalesces the write instead of writing synchronously', () => {
    persist('adl:files.workspaceExpanded', { workspace_a: true });
    expect(localStorage.getItem('adl:files.workspaceExpanded')).toBeNull();
  });

  it('lands the value on flush', () => {
    persist('adl:files.workspaceExpanded', { workspace_a: true });
    flushCrossSliceWrites();
    expect(JSON.parse(localStorage.getItem('adl:files.workspaceExpanded') ?? 'null')).toEqual({
      workspace_a: true,
    });
  });

  it('keeps only the last value for the same key within one flush window', () => {
    persist('adl:files.workspaceExpanded', { workspace_a: true });
    persist('adl:files.workspaceExpanded', { workspace_a: false });
    flushCrossSliceWrites();
    expect(JSON.parse(localStorage.getItem('adl:files.workspaceExpanded') ?? 'null')).toEqual({
      workspace_a: false,
    });
  });
});
