/** 百分号（含全角）后缀：允许用户直接输入 `120%`，提交前剥掉。 */
const PERCENT_SUFFIX = /[%％]\s*$/;

/** 合法数值：可选正负号 + 数字（可含小数，可省略整数位如 `.5`）。 */
const NUMERIC = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

/**
 * 把用户输入解析为**百分数字面**（`120` / `120%` → `120`）；转比例由 `clampZoomRatio`
 * 负责（除 100），此处不做，避免重复换算。
 * 非法或空输入返回 `null`，调用方据此放弃本次编辑、保持原值。
 *
 * 边界处理：百分号/全角百分号后缀、首尾空白、`+` 号、小数（含 `.5`）、负值与零
 * 都算"合法输入"——越界值由调用方按 [min,max] 钳制，而不是在此丢弃；
 * 真正的非法输入（非数字、混入文字、多个小数点、空串，以及科学计数法如 `1e3`）在此被拒。
 */
export function parseZoomPercentInput(raw: string): number | null {
  const trimmed = raw.trim().replace(PERCENT_SUFFIX, '').trim();
  if (!trimmed || !NUMERIC.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** 比例 → 百分比展示值（100% / 33% / 150%）。 */
export function formatZoomPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * 钳制 + 对齐两位小数后返回比例值。
 * 越界输入（`9999` / `-5`）退化为可预期的边界值而非被静默丢弃；
 * 对齐两位小数避免 `120.1234` 这类小数造成字号抖动。
 */
export function clampZoomRatio(percent: number, min: number, max: number): number {
  return +Math.min(max, Math.max(min, percent / 100)).toFixed(2);
}
