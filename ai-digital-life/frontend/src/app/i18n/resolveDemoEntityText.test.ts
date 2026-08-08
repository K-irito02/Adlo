import { describe, it, expect } from 'vitest';
import { resolveDemoEntityText } from './resolveDemoEntityText';

describe('resolveDemoEntityText', () => {
  const t = { demoWorkspaceName: '演示工作区', demoSessionCompleteTitle: '综合演示' };

  it('returns the value unchanged when not an i18n marker', () => {
    expect(resolveDemoEntityText('OnlineEditing', t)).toBe('OnlineEditing');
  });

  it('resolves an i18n marker through the copy dict', () => {
    expect(resolveDemoEntityText('i18n:demoWorkspaceName', t)).toBe('演示工作区');
  });

  it('falls back to the marker when the key is missing', () => {
    expect(resolveDemoEntityText('i18n:missing.key', t)).toBe('i18n:missing.key');
  });
});
