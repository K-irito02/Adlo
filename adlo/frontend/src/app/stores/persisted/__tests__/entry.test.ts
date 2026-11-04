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

  it('rejects a kebab-case name (legacy style)', () => {
    expect(parsePersistKey('adl:files.kebab-case')).toBeNull();
    expect(parsePersistKey('adl:browser.tab_folders')).toBeNull();
    expect(parsePersistKey('adl:files.1startsWithDigit')).toBeNull();
  });

  // Task 9 的键表（计划 §Task 9 登记清单）含全小写单词名：adl:browser.tabs /
  // history / bookmarks / shortcuts。计划原文要求这些键名逐字使用，故名称段必须
  // 允许全小写单词 —— Task 2 为满足本文件旧用例而加的"至少含一个大写字母"约束
  // 与之互斥（同一字符串不可能同时通过两者），此处按计划键表放开。
  it('accepts a single-token lowercase name mandated by the plan key table', () => {
    expect(parsePersistKey('adl:browser.tabs')).toEqual({
      domain: 'browser',
      name: 'tabs',
      version: 1,
    });
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
