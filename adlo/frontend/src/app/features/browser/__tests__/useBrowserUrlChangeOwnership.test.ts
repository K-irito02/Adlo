import { describe, expect, it } from 'vitest';
import { shouldSyncPanelAddressForTab } from '../browserUrlUtils';

describe('shouldSyncPanelAddressForTab', () => {
  it('允许面板归属标签写回面板地址栏', () => {
    expect(shouldSyncPanelAddressForTab({ location: 'panel' })).toBe(true);
    expect(shouldSyncPanelAddressForTab({ location: undefined })).toBe(true);
  });

  it('中心归属标签不得覆盖右侧面板地址栏', () => {
    expect(shouldSyncPanelAddressForTab({ location: 'center' })).toBe(false);
  });

  it('事件尚无法解析到标签时保持旧行为（放行）', () => {
    expect(shouldSyncPanelAddressForTab(undefined)).toBe(true);
  });
});
