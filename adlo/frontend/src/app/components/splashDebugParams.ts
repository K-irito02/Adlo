/**
 * 开屏定格钩子的参数解析：`?adl-splash-at=<ms>`。
 *
 * 只在参数**真实存在**且是合法毫秒数时返回数值；缺失、空串、非数字、负数一律返回
 * `null`（= 不定格）。
 *
 * 为什么单独成函数：`Number(new URLSearchParams(search).get('adl-splash-at'))` 在
 * 参数缺失时得到 `Number(null) === 0`，会被误判成"定格在 0ms"，从而把开屏的全部
 * 动画 `pause()` 在首帧 —— 首帧是各入场动画的起始态（`grid`/`mark`/`name` 为
 * `opacity: 0`、`rule` 为 `scaleX(0)`、`sweep` 移出视野），表现为启动后只剩纯黑或
 * 纯白的底色。缺失与 0 必须区分开。
 */
export function parseSplashFreezeAt(search: string): number | null {
  const raw = new URLSearchParams(search).get('adl-splash-at');
  if (raw === null || raw.trim() === '') {
    return null;
  }
  const at = Number(raw);
  return Number.isFinite(at) && at >= 0 ? at : null;
}
