import type { zhCN } from './zh-CN/index';

export type Locale = 'zh-CN' | 'en-US';
export type CopyKey = keyof typeof zhCN;
export type CopyDict = Record<CopyKey, string>;
