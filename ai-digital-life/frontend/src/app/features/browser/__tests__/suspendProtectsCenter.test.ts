import { describe, it, expect } from 'vitest';
import { computeSuspendedTabIds } from '../useBrowserSuspendScheduler';

describe('computeSuspendedTabIds', () => {
  it('不挂起中心活动标签与 dsh 标签', () => {
    const ids = computeSuspendedTabIds({
      allTabIds: ['a', 'b', 'c'],
      panelActiveId: 'a',
      centerActiveId: 'b',
      dshTabId: 'c',
      maxLive: 1,
    });
    expect(ids).toHaveLength(0);
  });
});
