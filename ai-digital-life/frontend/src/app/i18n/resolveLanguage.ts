import type { Locale } from './types';

/**
 * 把配置中的语言值解析为实际使用的界面语言（产品决策 2026-09-27）。
 *
 * - `'zh-CN'` / `'en-US'`：用户选定的具体语言（个人默认基线），直接使用。
 * - `'system'`（默认）/ 未知值：持续跟随操作系统语言 —— `navigator.language`
 *   以 `zh` 开头 → `zh-CN`，其余（本应用仅有两个语言包）→ `en-US`。
 *
 * 单一真源：所有消费 `config.language` 来决定界面语言/Intl locale 的位置
 * （启动、标题栏切换、复制字典、日期格式化等）必须经本函数，不得直接把
 * 配置值当 `Locale` 用（`'system'` 不是合法 Locale）。
 */
export function resolveAppLanguage(language: string | undefined): Locale {
  if (language === 'en-US') {
    return 'en-US';
  }
  if (language === 'zh-CN') {
    return 'zh-CN';
  }
  const nav = typeof navigator !== 'undefined' ? (navigator.language ?? '') : '';
  return nav.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}
