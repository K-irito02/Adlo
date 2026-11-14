import { describe, expect, it } from 'vitest';
import { parseSplashFreezeAt } from '../splashDebugParams';

/**
 * 回归保护：缺失参数绝不能被当成「定格在 0ms」。
 *
 * 事故背景（2026-11-14）：开发态启动后开屏只剩纯黑/纯白底色。原因是
 * `Number(params.get('adl-splash-at'))` 在参数缺失时得到 `0`，钩子据此把所有
 * 开屏动画 `pause()` 在起始态（各入场动画的首帧基本不可见），窗口只剩底色。
 */
describe('parseSplashFreezeAt', () => {
  it.each(['', '?', '?foo=bar', '?adl-splash-at=', '?adl-splash-at=%20'])(
    'returns null when the parameter is absent or empty (%s)',
    (search) => {
      expect(parseSplashFreezeAt(search)).toBeNull();
    },
  );

  it.each([
    ['?adl-splash-at=1200', 1200],
    ['?adl-splash-at=0', 0],
    ['?foo=bar&adl-splash-at=1500', 1500],
  ])('parses a valid freeze timestamp (%s)', (search, expected) => {
    expect(parseSplashFreezeAt(search)).toBe(expected);
  });

  it.each(['?adl-splash-at=abc', '?adl-splash-at=-1', '?adl-splash-at=Infinity'])(
    'returns null for an unusable value (%s)',
    (search) => {
      expect(parseSplashFreezeAt(search)).toBeNull();
    },
  );
});
