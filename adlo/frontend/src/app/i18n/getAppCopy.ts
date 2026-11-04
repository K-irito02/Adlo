import type { AppInfo } from '@shared/ipc';
import type { CopyDict } from './types';
import { loadLocale } from './i18nLoader';
import { resolveAppLanguage } from './resolveLanguage';

export async function getAppCopy(appInfo?: AppInfo): Promise<CopyDict> {
  return loadLocale(resolveAppLanguage(appInfo?.config.language));
}
