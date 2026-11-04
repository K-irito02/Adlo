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
});
