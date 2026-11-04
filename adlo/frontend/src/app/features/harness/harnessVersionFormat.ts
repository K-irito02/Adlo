/**
 * 版本发布时间格式化：`YYYY-MM-DD HH:mm`（旧 DSH 行文案逐字恢复，用户要求）。
 * 缺失返回空串；非法或无时间部分时回退原文，避免把坏数据吞成空白。
 */
export function formatPublishedAt(rfc3339: string | null, _locale?: string): string {
  if (!rfc3339) {
    return '';
  }
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(rfc3339);
  if (match) {
    return `${match[1]} ${match[2]}`;
  }
  return rfc3339;
}
