import type { FileCategory } from './fileTypeRouter';

/**
 * 大文件直接渲染阈值（字节）：超过后先显示友好提示 + "仍然打开"，
 * 避免超大文件解码/渲染卡住界面。传输上限（文本 8MB / 媒体 50MB）之内的二次门禁。
 */
export const HEAVY_PREVIEW_BYTES: Partial<Record<FileCategory, number>> = {
  image: 20 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
  video: 30 * 1024 * 1024,
  docx: 10 * 1024 * 1024,
  pdf: 15 * 1024 * 1024,
  spreadsheet: 10 * 1024 * 1024,
  presentation: 15 * 1024 * 1024,
};

/**
 * 文本直接渲染阈值（字符数）：txt/md/代码超 1MB 时先提示、确认后才渲染
 *（编辑器高亮 + 大纲解析是大文本卡顿主因；读取上限 8MB 不变）。
 */
export const TEXT_HEAVY_PREVIEW_CHARS = 1024 * 1024;

export function isHeavyTextCategory(category: FileCategory): boolean {
  return category === 'text' || category === 'code' || category === 'markdown';
}
