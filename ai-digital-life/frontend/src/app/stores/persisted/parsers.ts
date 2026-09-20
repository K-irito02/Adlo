import { clamp } from '../storageHelpers';
import { normalizeIgnoredEntry } from '../../../shared/ipc/searchIgnore';

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

/**
 * 数值 + 区间钳制 + 取整：承接旧读路径 `Math.floor(readNumber(...))` 的语义
 * （见 Task 11：旧写路径存 `String(value)`，读路径先 clamp 再 floor）。
 * 仅做钳制会丢失 floor（持久化的 `200.7` 由 200 变为 200.7），故此处钳制后再取整。
 * 非有限数值判为不合法。
 */
export function readFlooredNumberInRange(
  min: number,
  max: number,
): (raw: unknown) => number | undefined {
  return (raw: unknown) => {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return undefined;
    }
    return Math.floor(clamp(raw, min, max));
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

/** 字符串：仅接受真正的 string（空串是合法值） */
export function readString(raw: unknown): string | undefined {
  return typeof raw === 'string' ? raw : undefined;
}

/** Record<string, string> 扁平字符串映射；任一值非字符串即整字段判为不合法 */
export function readStringRecord(raw: unknown): Record<string, string> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'string') {
      return undefined;
    }
    result[key] = value;
  }
  return result;
}

/** 数字数组；任一元素非有限数值即整字段判为不合法 */
export function readNumberArray(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const result: number[] = [];
  for (const item of raw) {
    if (typeof item !== 'number' || !Number.isFinite(item)) {
      return undefined;
    }
    result.push(item);
  }
  return result;
}

/**
 * 对象数组 + 逐项校验：任一项不是普通对象、或不通过 `isItem` 即整字段判为不合法。
 *
 * 逐项校验是必要的 —— 数组元素随后会作为完整领域对象写入 store，
 * 单个畸形元素（字符串/null/缺字段）会在渲染期才暴露，故在读盘处整体拒绝。
 */
export function readObjectArray<T>(
  isItem: (item: Record<string, unknown>) => boolean,
): (raw: unknown) => T[] | undefined {
  return (raw: unknown) => {
    if (!Array.isArray(raw)) {
      return undefined;
    }
    const result: T[] = [];
    for (const item of raw) {
      if (!isPlainRecord(item) || !isItem(item)) {
        return undefined;
      }
      result.push(item as T);
    }
    return result;
  };
}

/** Record<string, T[]> 两层映射：外层值为数组、且每项通过 `isItem` */
export function readObjectArrayRecord<T>(
  isItem: (item: Record<string, unknown>) => boolean,
): (raw: unknown) => Record<string, T[]> | undefined {
  const readArray = readObjectArray<T>(isItem);
  return (raw: unknown) => {
    if (!isPlainRecord(raw)) {
      return undefined;
    }
    const result: Record<string, T[]> = {};
    for (const [key, value] of Object.entries(raw)) {
      const items = readArray(value);
      if (items === undefined) {
        return undefined;
      }
      result[key] = items;
    }
    return result;
  };
}

/** 普通对象判定（排除 null 与数组）—— 供各形状校验器复用 */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

/**
 * 检索手动忽略名单的读侧归一化（Task 11）。
 *
 * 入口收敛脏输入（前导斜杠 / `\` / 尾斜杠）并去重：复用 searchIgnore 的
 * `normalizeIgnoredEntry`，全应用只有这一份清洗（写侧 `toggleIgnoredPath` 本就产出
 * 归一化值，此处是读侧兜底，与迁移前 searchSlice 的旧 `readSearchIgnoredPaths` 语义一致）。
 * 外层非对象 / 任一 workspace 的值非数组 ⇒ 整字段判为不合法（回退 fallback）。
 */
export function readSearchIgnoredPaths(raw: unknown): Record<string, string[]> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const result: Record<string, string[]> = {};
  for (const [workspaceId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) {
      return undefined;
    }
    const seen = new Set<string>();
    const list: string[] = [];
    for (const p of value) {
      if (typeof p !== 'string') {
        continue;
      }
      const normalized = normalizeIgnoredEntry(p);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        list.push(normalized);
      }
    }
    result[workspaceId] = list;
  }
  return result;
}

/**
 * 检索 `.gitignore` 开关的读侧映射（Task 11）。
 * 任一值非布尔 ⇒ 整字段判为不合法（回退 fallback）；非对象外层同样判为不合法。
 */
export function readSearchUseGitignore(raw: unknown): Record<string, boolean> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const result: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'boolean') {
      return undefined;
    }
    result[key] = value;
  }
  return result;
}
