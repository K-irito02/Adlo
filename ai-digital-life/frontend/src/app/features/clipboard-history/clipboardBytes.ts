const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * 把字节数格式化为人类可读字符串（中性单位 B/KB/MB/GB/TB，缩放后保留 1 位小数）。
 * 单位与数值均不随语言变化；非有限值或负数返回空串，供调用方省略该读数。
 */
export function formatClipboardBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '';
  }
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = unit === 0 ? `${value}` : value.toFixed(1);
  return `${text} ${BYTE_UNITS[unit]}`;
}
