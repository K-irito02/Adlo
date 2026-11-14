/**
 * 图标映射数据：把「扩展名 → 第三方库图标」的选择集中在一处，便于契约测试直接遍历。
 *
 * 契约（由 `__tests__/iconMappings.test.tsx` 锁定）：集合里每个扩展名都必须是
 * react-file-icon `defaultStyles` 的真实键。缺键不会报错，只会静默降级到
 * react-symbols —— 2026-11-14 的 `key` / `pages` / `numbers` 就是这么长期失效的。
 */

/**
 * Extensions where react-file-icon has better/more recognizable icons
 * (office documents with colored backgrounds and type glyphs).
 * For these extensions, prefer react-file-icon over react-symbols.
 */
export const REACT_FILE_ICON_PREFERRED = new Set([
  'doc',
  'docx',
  'odt',
  'rtf', // Word documents
  'xls',
  'xlsx',
  'ods',
  'csv', // Spreadsheets
  'ppt',
  'pptx',
  'odp', // Presentations
  'pdf', // PDF
]);
