import { zhCN } from './zh-CN/index';
import { enUS } from './en-US/index';

export type CopyKey = keyof typeof zhCN;
export type CopyDict = Record<CopyKey, string>;
export type Locale = 'zh-CN' | 'en-US';

export const copy = {
  'zh-CN': zhCN,
  'en-US': enUS,
} as const;
