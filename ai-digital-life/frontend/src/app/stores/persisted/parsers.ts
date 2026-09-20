import { clamp } from '../storageHelpers';

/** 布尔：仅接受真正的 boolean */
export function readFlag(raw: unknown): boolean | undefined {
  return typeof raw === 'boolean' ? raw : undefined;
}

/** 数值 + 区间钳制：越界钳制（宽度类状态越界应纠正而非丢弃），非有限数值判为不合法 */
export function readNumberInRange(min: number, max: number): (raw: unknown) => number | undefined {
  return (raw: unknown) => {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return undefined;
    }
    return clamp(raw, min, max);
  };
}

/** 字符串枚举：不在白名单内判为不合法（避免恢复出无法识别的模式） */
export function readStringEnum<T extends string>(
  allowed: readonly T[],
): (raw: unknown) => T | undefined {
  return (raw: unknown) => {
    if (typeof raw !== 'string') {
      return undefined;
    }
    return (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
  };
}

/** Record<workspaceId, Record<path, boolean>> 两层布尔映射 */
export function readBooleanPropRecord(
  raw: unknown,
): Record<string, Record<string, boolean>> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const result: Record<string, Record<string, boolean>> = {};
  for (const [outerKey, outerValue] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof outerValue !== 'object' || outerValue === null || Array.isArray(outerValue)) {
      return undefined;
    }
    const inner: Record<string, boolean> = {};
    for (const [innerKey, innerValue] of Object.entries(outerValue as Record<string, unknown>)) {
      if (typeof innerValue !== 'boolean') {
        return undefined;
      }
      inner[innerKey] = innerValue;
    }
    result[outerKey] = inner;
  }
  return result;
}
