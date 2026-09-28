import { describe, it, expect } from 'vitest';
import type { CopyDict } from '@i18n';
import {
  localizePreflightIssue,
  localizePreflightIssues,
  localizePreflightMessage,
  preflightMessageKey,
} from '../preflightCopy';

// 与其它存储测试同构：Proxy 桩文案回退为 key 本身，断言不依赖完整 i18n 词典。
const t = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? `L:${key}` : ''),
}) as unknown as CopyDict;

// 分类名/模板类断言用局部词典（Proxy 桩无法表达 {category} 占位模板）。
const dict = {
  storagePreflightIssueWithCategory: '{category}: {message}',
  storagePreflightIdentical: '本地化A',
  storageCategoryDatabase: '数据库',
  storageCategorySiteMetaDb: '网站元数据',
} as unknown as CopyDict;

describe('preflightMessageKey', () => {
  it('maps the four known Rust preflight messages to i18n keys', () => {
    expect(preflightMessageKey('source and target are identical')).toBe(
      'storagePreflightIdentical',
    );
    expect(preflightMessageKey('target is inside source')).toBe('storagePreflightInside');
    expect(preflightMessageKey('cannot create target parent')).toBe('storagePreflightCreateDir');
    expect(preflightMessageKey('target is not writable')).toBe('storagePreflightNotWritable');
  });

  it('matches case-insensitively and returns null for unknown messages', () => {
    expect(preflightMessageKey('Source And Target Are Identical')).toBe(
      'storagePreflightIdentical',
    );
    // 未知消息（OS 错误原文、未来新增类别）→ null，调用方回退原文。
    expect(preflightMessageKey('target unwritable')).toBeNull();
    expect(preflightMessageKey('disk space low: 12 MiB free')).toBeNull();
    expect(preflightMessageKey('')).toBeNull();
  });
});

describe('localizePreflightMessage', () => {
  it('localizes known messages and falls back to the original text otherwise', () => {
    expect(localizePreflightMessage('source and target are identical', t)).toBe(
      'L:storagePreflightIdentical',
    );
    expect(localizePreflightMessage('OS error: Access is denied', t)).toBe(
      'OS error: Access is denied',
    );
  });
});

describe('localizePreflightIssue (structured issue → category prefix, item 9)', () => {
  it('prefixes known category with its localized name and localizes the message', () => {
    expect(
      localizePreflightIssue(
        { category: 'database', message: 'source and target are identical' },
        dict,
      ),
    ).toBe('数据库: 本地化A');
  });

  it('root-level issue (category null) has no prefix', () => {
    expect(localizePreflightIssue({ category: null, message: 'raw text' }, dict)).toBe('raw text');
  });

  it('unknown category key falls back to the key itself', () => {
    expect(localizePreflightIssue({ category: 'not_a_category', message: 'raw text' }, dict)).toBe(
      'not_a_category: raw text',
    );
  });
});

describe('localizePreflightIssues (dedupe by final text, item 9)', () => {
  it('keeps one entry for same category + same message, keeps distinct categories', () => {
    const out = localizePreflightIssues(
      [
        { category: 'database', message: 'source and target are identical' },
        { category: 'database', message: 'source and target are identical' },
        { category: 'site_meta_db', message: 'source and target are identical' },
        { category: null, message: 'raw unknown' },
      ],
      dict,
    );
    expect(out).toEqual(['数据库: 本地化A', '网站元数据: 本地化A', 'raw unknown']);
  });

  it('does not dedupe distinct raw messages that localize differently', () => {
    const out = localizePreflightIssues(
      [
        { category: null, message: 'source and target are identical' },
        { category: null, message: 'OS error: denied' },
      ],
      dict,
    );
    expect(out).toEqual(['本地化A', 'OS error: denied']);
  });
});
