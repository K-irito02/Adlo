import { describe, expect, it } from 'vitest';
import { THIRD_PARTY_NOTICES } from './thirdPartyNotices';

/**
 * 人工维护的「随包素材 / 移植代码」声明数据。
 *
 * 生成物只覆盖锁文件依赖；这里的 5 条资产声明是手抄正文，必须逐条锁住，
 * 否则正文被替换、版权行被改写或 URL 退化都不会被发现。
 */
describe('third-party notices', () => {
  it('keeps names unique and every entry complete', () => {
    const names = THIRD_PARTY_NOTICES.map((notice) => notice.name);
    expect(new Set(names).size).toBe(names.length);
    for (const notice of THIRD_PARTY_NOTICES) {
      expect(notice.name.length).toBeGreaterThan(0);
      expect(notice.detailKey.length).toBeGreaterThan(0);
      expect(notice.url, notice.name).toMatch(/^https:\/\//);
      expect(notice.text.length, notice.name).toBeGreaterThan(500);
    }
  });

  it('declares the upstream license per entry', () => {
    const byName = new Map(THIRD_PARTY_NOTICES.map((notice) => [notice.name, notice]));
    expect(byName.get('bklit-ui')?.license).toBe('MIT');
    expect(byName.get('React Symbols')?.license).toBe('MIT');
    expect(byName.get('Untitled UI')?.license).toBe('MIT');
    expect(byName.get('Devicons')?.license).toBe('MIT');
    expect(byName.get('Lucide')?.license).toBe('ISC');
  });

  it('keeps the full MIT text for every MIT entry', () => {
    for (const notice of THIRD_PARTY_NOTICES) {
      if (notice.license !== 'MIT') {
        continue;
      }
      expect(notice.text, notice.name).toContain('MIT License');
      expect(notice.text, notice.name).toContain('Permission is hereby granted');
      expect(notice.text, notice.name).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
    }
  });

  it('keeps both the ISC and the Feather-derived MIT section for Lucide', () => {
    const lucide = THIRD_PARTY_NOTICES.find((notice) => notice.name === 'Lucide');
    expect(lucide).toBeDefined();
    expect(lucide?.text).toContain('ISC License');
    expect(lucide?.text).toContain('The MIT License (MIT)');
    expect(lucide?.text).toContain('Permission is hereby granted');
    expect(lucide?.url).toBe('https://lucide.dev/');
    expect(lucide?.copyright).toBe('Copyright (c) 2026 Lucide Icons and Contributors');
  });

  it('records the upstream copyright lines (Devicons has none upstream)', () => {
    const byName = new Map(THIRD_PARTY_NOTICES.map((notice) => [notice.name, notice]));
    expect(byName.get('bklit-ui')?.copyright).toBe('Copyright (c) 2026 uixmat');
    expect(byName.get('React Symbols')?.copyright).toBe('Copyright (c) 2022 Pablo Hernández');
    expect(byName.get('Untitled UI')?.copyright).toBe('Copyright (c) 2025 Untitled UI');
    expect(byName.get('Devicons')?.copyright).toBeUndefined();
  });
});
