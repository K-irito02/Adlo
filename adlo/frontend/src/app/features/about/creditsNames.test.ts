import { describe, expect, it } from 'vitest';
import { CREDITS_EXTRA_NAMES, THIRD_PARTY_NAMES } from './creditsNames';
import { THIRD_PARTY_NOTICE_NAMES } from './thirdPartyNoticeNames.generated';

describe('third-party names index', () => {
  it('is unique and sorted', () => {
    expect(new Set(THIRD_PARTY_NAMES).size).toBe(THIRD_PARTY_NAMES.length);
    expect([...THIRD_PARTY_NAMES].sort()).toEqual(THIRD_PARTY_NAMES);
  });

  it('covers packages, curated notices and external names', () => {
    expect(THIRD_PARTY_NAMES).toContain('react');
    expect(THIRD_PARTY_NAMES).toContain('tauri');
    expect(THIRD_PARTY_NAMES).toContain('bklit-ui');
    expect(THIRD_PARTY_NAMES).toContain('Lucide');
    for (const name of CREDITS_EXTRA_NAMES) {
      expect(THIRD_PARTY_NAMES).toContain(name);
    }
    for (const name of THIRD_PARTY_NOTICE_NAMES) {
      expect(THIRD_PARTY_NAMES).toContain(name);
    }
  });

  it('includes each extra name exactly once', () => {
    for (const name of CREDITS_EXTRA_NAMES) {
      expect(THIRD_PARTY_NAMES.filter((candidate) => candidate === name)).toHaveLength(1);
    }
  });
});
