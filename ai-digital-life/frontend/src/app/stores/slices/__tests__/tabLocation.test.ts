import { describe, it, expect } from 'vitest';
import { isPanelTab } from '../tabLocation';

describe('isPanelTab', () => {
  it('缺省 location 视为面板标签', () => {
    expect(isPanelTab({})).toBe(true);
  });
  it("location='panel' 视为面板标签", () => {
    expect(isPanelTab({ location: 'panel' })).toBe(true);
  });
  it("location='center' 不视为面板标签", () => {
    expect(isPanelTab({ location: 'center' })).toBe(false);
  });
});
