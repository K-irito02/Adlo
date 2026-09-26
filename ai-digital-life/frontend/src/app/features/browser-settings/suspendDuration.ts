/** 「不活跃标签挂起时长」自定义输入纯函数（秒/分/时/天 → 毫秒）。
 * 存储单位为毫秒，合法窗口 1 秒 .. 30 天；预设档位判定与草稿播种沿用树缓存 TTL
 * 范式（storage-settings/treeCacheTtl.ts），防两处自定义输入行为漂移。 */

/** 自定义时长单位（与树缓存 TTL 单位同构，SettingsSelect 回传 string）。 */
export type SuspendUnit = 's' | 'm' | 'h' | 'd';

/** 合法窗口：1 秒 .. 30 天（毫秒）。 */
export const SUSPEND_MIN_MS = 1_000;
export const SUSPEND_MAX_MS = 30 * 86_400_000;

/** 预设档位（含 Off = 0）：非档位存量值由自定义态承接，不吸附最近档。 */
export const SUSPEND_PRESET_MS = [
  0,
  5 * 60_000,
  15 * 60_000,
  30 * 60_000,
  60 * 60_000,
  120 * 60_000,
] as const;

const UNIT_MS: Record<SuspendUnit, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** 单位字符串类型守卫（SettingsSelect 回传 string，非法串拒绝进 state）。 */
export function isSuspendUnit(v: string): v is SuspendUnit {
  return v === 's' || v === 'm' || v === 'h' || v === 'd';
}

/** 自定义输入 → 毫秒：非正数/非法返回 null；否则按单位换算并钳制 1 秒 .. 30 天。 */
export function suspendMsFromCustom(raw: number, unit: SuspendUnit): number | null {
  if (!Number.isFinite(raw) || raw <= 0) {
    return null;
  }
  return Math.min(SUSPEND_MAX_MS, Math.max(SUSPEND_MIN_MS, Math.round(raw * UNIT_MS[unit])));
}

/** 毫秒 → 指定单位显示串（切单位时同一草稿换算，保持显示与待提交一致）。
 * 小数保留四位（天单位下 2 位会漂移）；提交时仍经 suspendMsFromCustom 钳制。 */
export function formatMsForUnit(ms: number, unit: SuspendUnit): string {
  return String(Math.round((ms / UNIT_MS[unit]) * 10000) / 10000);
}

/** 单位输入框上限（30 天窗口按单位折算，与 suspendUnitMax 钳制同口径）。 */
export function suspendUnitMax(unit: SuspendUnit): number {
  return Math.floor(SUSPEND_MAX_MS / UNIT_MS[unit]);
}

/** 是否预设档位：undefined（config 未加载）视为非档位（fail-open，不误判默认）。 */
export function isSuspendPreset(ms: number | undefined): boolean {
  return ms !== undefined && (SUSPEND_PRESET_MS as readonly number[]).includes(ms);
}

/** 自定义草稿播种单位：按存储值取最大整单位（7 分 → m、90 秒 → s、12 时 → h、1 天 → d）；
 * Off(0) 与非法值兜底分钟（草稿仍可编辑，0 提交时被 null 拒绝）。 */
export function seedSuspendUnit(ms: number): SuspendUnit {
  if (ms > 0) {
    if (ms % UNIT_MS.d === 0) {
      return 'd';
    }
    if (ms % UNIT_MS.h === 0) {
      return 'h';
    }
    if (ms % UNIT_MS.m === 0) {
      return 'm';
    }
    return 's';
  }
  return 'm';
}
