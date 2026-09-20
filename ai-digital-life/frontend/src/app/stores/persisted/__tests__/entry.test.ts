import { describe, it, expect } from 'vitest';
import { defineEntry, parsePersistKey } from '../entry';

describe('parsePersistKey', () => {
  it('parses a plain domain.name key with default version 1', () => {
    expect(parsePersistKey('adl:files.workspaceExpanded')).toEqual({
      domain: 'files',
      name: 'workspaceExpanded',
      version: 1,
    });
  });

  it('parses an explicit version segment', () => {
    expect(parsePersistKey('adl:files.workspaceExpanded.v2')).toEqual({
      domain: 'files',
      name: 'workspaceExpanded',
      version: 2,
    });
  });

  it('rejects an unknown domain', () => {
    expect(parsePersistKey('adl:unknown.thing')).toBeNull();
  });

  it('rejects legacy prefixes', () => {
    expect(parsePersistKey('adl-ui:file-tree-expanded')).toBeNull();
    expect(parsePersistKey('adl-terminal:cwd-by-tab')).toBeNull();
  });

  it('rejects a lowercase-starting name', () => {
    expect(parsePersistKey('adl:files.lowercase')).toBeNull();
  });
});

describe('defineEntry', () => {
  it('returns the entry unchanged so the registry stays declarative', () => {
    const entry = defineEntry<Record<string, boolean>>({
      key: 'adl:files.workspaceExpanded',
      field: 'workspaceTreeExpandedInFileNav',
      fallback: {},
      scope: 'byWorkspaceId',
    });
    expect(entry.scope).toBe('byWorkspaceId');
    expect(entry.sync).toBeUndefined();
  });
});
