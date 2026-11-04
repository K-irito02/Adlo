import { describe, expect, it } from 'vitest';
import { isPoolTabEvent } from '../browserUrlUtils';

const tabs = [{ id: 'browser-aaa' }, { id: 'browser-bbb' }];

describe('isPoolTabEvent（事项 13）', () => {
  it('已知浏览器标签 id（browser-xxx 形态）放行', () => {
    expect(isPoolTabEvent('browser-aaa', tabs)).toBe(true);
  });

  it('未知 tabId（DSH 独立子窗口等非池 WebView）丢弃', () => {
    expect(isPoolTabEvent('dsh-standalone-1', tabs)).toBe(false);
    expect(isPoolTabEvent('silent_553721f1', tabs)).toBe(false);
  });

  it('无 tabId 走既有分支（放行，由下游按 tab 查找处理）', () => {
    expect(isPoolTabEvent(undefined, tabs)).toBe(true);
    expect(isPoolTabEvent('', tabs)).toBe(true);
  });

  it('旧前缀 adl-browser-view-xxx 非标签 id 不再作为放行依据', () => {
    // Rust 从未以该前缀发出 tabId（仅 WebView label 带该前缀），未知即丢弃。
    expect(isPoolTabEvent('adl-browser-view-browser-aaa', tabs)).toBe(false);
  });
});
