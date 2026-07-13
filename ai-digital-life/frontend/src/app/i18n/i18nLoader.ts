import type { CopyDict, Locale } from './types';

export async function loadLocale(locale: Locale): Promise<CopyDict> {
  if (locale === 'zh-CN') {
    const m = await import('./zh-CN/index');
    return m.zhCN;
  }
  const m = await import('./en-US/index');
  return m.enUS;
}
