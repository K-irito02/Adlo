import { describe, expect, it } from 'vitest';
import { shouldApplyEngineReswitch } from '../engineReswitchGuard';

const base = {
  activeHostTabId: 'tab-1',
  sourceTabId: 'tab-1',
  currentTabUrl: 'https://www.baidu.com/s?wd=q',
  startUrl: 'https://www.baidu.com/s?wd=q',
};

describe('shouldApplyEngineReswitch', () => {
  it('applies when the tab is still shown and its URL did not change', () => {
    expect(shouldApplyEngineReswitch(base)).toBe(true);
  });

  it('aborts when the host switched to another tab', () => {
    expect(shouldApplyEngineReswitch({ ...base, activeHostTabId: 'tab-2' })).toBe(false);
  });

  it('aborts when the same tab navigated elsewhere during the precheck', () => {
    expect(shouldApplyEngineReswitch({ ...base, currentTabUrl: 'https://example.com/newer' })).toBe(
      false,
    );
  });

  it('aborts when the source tab disappeared', () => {
    expect(shouldApplyEngineReswitch({ ...base, currentTabUrl: undefined })).toBe(false);
  });
});
