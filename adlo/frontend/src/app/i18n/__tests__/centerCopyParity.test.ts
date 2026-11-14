import { describe, it, expect } from 'vitest';
import { enUS } from '../en-US/index';
import { zhCN } from '../zh-CN/index';

/**
 * 中心标签宿主（center tab host）实际引用的 `t.center*` key 集合。
 * 由 `rg "t\.center[A-Z]" src` 收集而来：
 * - CenterTabStrip / CenterEntryPage / CenterPane 等中心相关代码
 * - 浏览器标签菜单与终端的「在中心显示」入口
 */
const KEYS = [
  'centerNewTab',
  'centerTabStripLabel',
  'centerTabShowInBrowserPanel',
  'centerTabShowInTerminalPanel',
  'centerTabShowInCenter',
  'centerTabOpenInCenter',
  'centerTabOpenAllInCenter',
  'centerLauncherOpenDsh',
  'centerLauncherOpenBrowser',
  'centerLauncherOpenTerminal',
  'centerContentLabel',
  'centerLauncherLabel',
  'centerBrowserTabMissing',
] as const;

describe('center i18n parity', () => {
  it('两端均有非空文案', () => {
    for (const k of KEYS) {
      expect(zhCN[k]?.length, `zh-CN missing ${k}`).toBeGreaterThan(0);
      expect(enUS[k]?.length, `en-US missing ${k}`).toBeGreaterThan(0);
    }
  });

  it('钉死本轮用户可见文案（改回旧词会变红）', () => {
    expect(zhCN.browserViewModeList).toBe('书签列表');
    expect(enUS.browserViewModeList).toBe('Bookmark list');
    expect(zhCN.centerTabShowInBrowserPanel).toBe('在右侧面板显示');
    expect(zhCN.centerTabShowInTerminalPanel).toBe('在右侧面板显示');
    expect(zhCN.centerTabShowInCenter).toBe('在「中间区」显示'); // glossary-allow: 用户指定文案
    expect(zhCN.centerTabOpenInCenter).toBe('在「中间区」打开'); // glossary-allow: 用户指定文案
    expect(zhCN.centerTabOpenAllInCenter).toBe('全部在「中间区」打开'); // glossary-allow: 用户指定文案
    expect(enUS.centerTabShowInCenter).toBe('Show in middle area');
    expect(enUS.centerTabOpenInCenter).toBe('Open in middle area');
    expect(enUS.centerTabOpenAllInCenter).toBe('Open all in middle area');
    expect(enUS.centerTabShowInBrowserPanel).toBe('Show in right panel');
    expect(enUS.centerTabShowInTerminalPanel).toBe('Show in right panel');
  });
});
