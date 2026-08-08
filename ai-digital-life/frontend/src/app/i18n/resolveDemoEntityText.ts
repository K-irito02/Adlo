const DEMO_MARKER_PREFIX = 'i18n:';

export function resolveDemoEntityText(value: string, t?: Record<string, string>): string {
  if (!value.startsWith(DEMO_MARKER_PREFIX)) {
    return value;
  }
  const key = value.slice(DEMO_MARKER_PREFIX.length);
  return t?.[key] ?? value;
}
