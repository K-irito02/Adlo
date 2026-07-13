import type { AppInfo } from '@ai-digital-life/kernel';
import type { CopyDict, Locale } from './types';
import { loadLocale } from './i18nLoader';

export async function getAppCopy(appInfo?: AppInfo): Promise<CopyDict> {
  const locale: Locale = appInfo?.config.language === 'en-US' ? 'en-US' : 'zh-CN';
  return loadLocale(locale);
}
