/** 工作区树缓存自定义 TTL 纯函数（秒/分/时/天 → 分钟；服务端仍只存 1..=1440 分钟）。 */

/** 自定义 TTL 单位（秒向上取整到分钟；服务端仍只存 1..=1440 分钟）。 */
export type TreeTtlUnit = 's' | 'm' | 'h' | 'd';

/** 单位字符串类型守卫（SettingsSelect 回传 string，非法串拒绝进 state）。 */
export function isTreeTtlUnit(v: string): v is TreeTtlUnit {
  return v === 's' || v === 'm' || v === 'h' || v === 'd';
}

/** 缓存绝对时刻 → 应用语言本地化字符串（中英切换日期格式跟随）。 */
export function formatTreeCacheTime(capturedAt: number, locale: string): string {
  return new Date(capturedAt).toLocaleString(locale);
}

/** 自定义输入 → 分钟：非正数返回 null；否则按单位换算并钳制 1..=1440（上限 1 天）。
 * 取整语义：秒向上取整（30s→1）；分/时/天四舍五入后钳制（1.5 分→2、0.5 时→30）。 */
export function treeTtlMinutesFromCustom(raw: number, unit: TreeTtlUnit): number | null {
  if (!Number.isFinite(raw) || raw <= 0) {
    return null;
  }
  let minutes: number;
  switch (unit) {
    case 's':
      minutes = Math.ceil(raw / 60);
      break;
    case 'm':
      minutes = Math.round(raw);
      break;
    case 'h':
      minutes = Math.round(raw * 60);
      break;
    case 'd':
      minutes = Math.round(raw * 1440);
      break;
  }
  return Math.min(1440, Math.max(1, minutes));
}

/** 分钟 → 指定单位显示串（切单位时同一草稿换算，保持显示与待提交一致）。
 * 小数保留四位（2 位会在天单位下漂移：45 分钟→0.03 天→回算 43 分钟）；
 * 提交时仍经 treeTtlMinutesFromCustom 取整钳制。 */
export function formatMinutesForUnit(minutes: number, unit: TreeTtlUnit): string {
  const raw =
    unit === 's'
      ? minutes * 60
      : unit === 'm'
        ? minutes
        : unit === 'h'
          ? minutes / 60
          : minutes / 1440;
  return String(Math.round(raw * 10000) / 10000);
}
export function treeTtlUnitMax(unit: TreeTtlUnit): number {
  switch (unit) {
    case 's':
      return 86_400;
    case 'm':
      return 1440;
    case 'h':
      return 24;
    case 'd':
      return 1;
  }
}
