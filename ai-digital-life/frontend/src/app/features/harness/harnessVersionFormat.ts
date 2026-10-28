/**
 * 版本发布时间格式化：走 `Intl.DateTimeFormat`（按当前 locale 的短日期 + 短时间），
 * 不在代码里拼固定格式。无法解析时原样返回，避免把坏数据吞成空白。
 */
export function formatPublishedAt(rfc3339: string | null, locale: string): string {
  if (!rfc3339) {
    return '';
  }
  const date = new Date(rfc3339);
  if (Number.isNaN(date.getTime())) {
    return rfc3339;
  }
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(
      date,
    );
  } catch {
    return rfc3339;
  }
}
