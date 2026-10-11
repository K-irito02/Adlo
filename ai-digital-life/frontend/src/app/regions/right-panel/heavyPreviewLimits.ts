import type { FileCategory } from './fileTypeRouter';

/**
 * 大文件直接渲染阈值（字节）：超过后先显示友好提示 + "仍然打开"，
 * 避免超大文件解码/渲染卡住界面。传输上限（文本 8MB / 媒体 50MB）之内的二次门禁。
 * 未列出的品类（text/code/markdown/binary）无字节门：文本走字符门，
 * binary 无预览——索引得 undefined 即"不设门"，新增品类默认亦如此（有意为之）。
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
 * 文本直接渲染阈值（字符数，按 JS string.length 即 UTF-16 码元计）：
 * txt/md/代码超 1MB 时先提示、确认后才渲染（编辑器高亮 + 大纲解析是大文本卡顿主因；
 * 读取上限 8MB 不变）。单位说明：ASCII 1 字符≈1 字节，CJK 约 3 字节，emoji 占 2 码元——
 * 阈值偏保守，hint 显示的体积经 TextEncoder 精确计算（见 EditorSurfaceShell）。
 */
export const TEXT_HEAVY_PREVIEW_CHARS = 1024 * 1024;

export function isHeavyTextCategory(category: FileCategory): boolean {
  return category === 'text' || category === 'code' || category === 'markdown';
}

/**
 * 重型门确认记忆（Phase 4 审查 F2）：模块级 Set，多重型文件往返不重复打扰；
 * 路径字符串常驻内存可忽略。确认后调用端自行触发重渲染。
 * key 含工作区隔离（rev3 复审 N2）：同相对路径在不同工作区是不同文件。
 */
const confirmedHeavyPaths = new Set<string>();

/** 确认集上限：路径短字符串，会话内累积可忽略，设万级兜底防无限增长。 */
const CONFIRMED_PATHS_LIMIT = 10000;

export function heavyConfirmKey(workspaceId: string | undefined, path: string): string {
  return `${workspaceId ?? ''}:${path}`;
}

export function isHeavyPreviewConfirmed(workspaceId: string | undefined, path: string): boolean {
  return confirmedHeavyPaths.has(heavyConfirmKey(workspaceId, path));
}

export function confirmHeavyPreview(workspaceId: string | undefined, path: string): void {
  if (confirmedHeavyPaths.size >= CONFIRMED_PATHS_LIMIT) {
    confirmedHeavyPaths.clear();
  }
  confirmedHeavyPaths.add(heavyConfirmKey(workspaceId, path));
}
