export type FileCategory =
  | 'code'
  | 'markdown'
  | 'text'
  | 'docx'
  | 'pdf'
  | 'image'
  | 'audio'
  | 'video'
  | 'spreadsheet'
  | 'presentation'
  | 'binary';

const CODE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'json',
  'yaml',
  'yml',
  'html',
  'htm',
  'css',
  'scss',
  'less',
  'sql',
  'py',
  'rs',
  'xml',
  'vue',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'toml',
  'ini',
  'cfg',
  'conf',
  'gitignore',
  'env',
  'dockerfile',
  'c',
  'cc',
  'cpp',
  'cxx',
  'h',
  'hpp',
  'cs',
  'go',
  'java',
  'kt',
  'swift',
  'rb',
  'php',
  'lua',
  'vim',
]);

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown']);

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'ico',
  'webp',
  'avif',
  'apng',
  'svg',
  'tif',
  'tiff',
  'heic',
  'heif',
]);

const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'wav',
  'ogg',
  'oga',
  'm4a',
  'flac',
  'aac',
  'opus',
  'weba',
  'wma',
  'aiff',
  'aif',
  'mid',
  'midi',
]);

const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'm4v',
  'webm',
  'mov',
  'mkv',
  'avi',
  'ogv',
  'wmv',
  'flv',
  'f4v',
  'mpg',
  'mpeg',
  '3gp',
  '3g2',
]);

const SPREADSHEET_EXTENSIONS = new Set(['xls', 'xlsx', 'xlsm', 'xlsb', 'ods', 'csv']);

const PRESENTATION_EXTENSIONS = new Set(['ppt', 'pptx', 'ppsx', 'odp']);

const BINARY_EXTENSIONS = new Set([
  'zip',
  'tar',
  'gz',
  'bz2',
  'xz',
  '7z',
  'rar',
  'exe',
  'dll',
  'so',
  'dylib',
  'woff',
  'woff2',
  'ttf',
  'eot',
  'otf',
  'bin',
  'dat',
  'iso',
  'dmg',
  // odt 是 ODF zip：解析库读不了，走诚实占位而不以文本乱码呈现。
  // pot/pps 是旧版 OLE 模板与幻灯片：同理走占位（ppsx 是 OOXML，走 presentation）。
  'odt',
  'pot',
  'pps',
]);

export function categorizeFile(filePath: string | undefined): FileCategory {
  if (!filePath) {
    return 'text';
  }
  const segments = filePath.split('/');
  const fileName = segments[segments.length - 1] ?? '';
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) {
    const lowerName = fileName.toLowerCase();
    if (
      lowerName === 'dockerfile' ||
      lowerName === 'makefile' ||
      lowerName === 'license' ||
      lowerName === '.gitignore'
    ) {
      return 'code';
    }
    return 'text';
  }
  const ext = fileName.slice(dotIndex + 1).toLowerCase();
  if (MARKDOWN_EXTENSIONS.has(ext)) {
    return 'markdown';
  }
  if (
    ext === 'docx' ||
    ext === 'doc' ||
    ext === 'docm' ||
    ext === 'dotx' ||
    ext === 'dotm' ||
    ext === 'dot'
  ) {
    // docm/dotx/dotm 与 docx 同为 OOXML zip，解析库可处理内容（宏被忽略）；
    // dot（旧模板，OLE 二进制）渲染必失败，走 DocxPreview 的 legacy 指引而非文本乱码。
    return 'docx';
  }
  if (ext === 'pdf') {
    return 'pdf';
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    return 'image';
  }
  if (AUDIO_EXTENSIONS.has(ext)) {
    return 'audio';
  }
  if (VIDEO_EXTENSIONS.has(ext)) {
    return 'video';
  }
  if (SPREADSHEET_EXTENSIONS.has(ext)) {
    return 'spreadsheet';
  }
  if (PRESENTATION_EXTENSIONS.has(ext)) {
    return 'presentation';
  }
  if (CODE_EXTENSIONS.has(ext)) {
    return 'code';
  }
  if (BINARY_EXTENSIONS.has(ext)) {
    return 'binary';
  }
  return 'text';
}

/**
 * 是否走二进制媒体通道（图片/音视频/办公文档）：调用端据此选择
 * readMediaFile（字节）还是 readFile（文本），与 EditorSurfaceShell 渲染分支保持一致。
 */
export function isMediaFileCategory(category: FileCategory): boolean {
  return (
    category === 'image' ||
    category === 'audio' ||
    category === 'video' ||
    category === 'docx' ||
    category === 'pdf' ||
    category === 'spreadsheet' ||
    category === 'presentation'
  );
}

/**
 * 是否 Office 临时锁定文件（Word/Excel/PowerPoint 打开文档时产生的 `~$xxx` 文件）：
 * 体积很小且不是 zip/文档本身，任何解析库都会报"not a zip"类错误，
 * 应直接给出转存指引而不调库。
 */
export function isOfficeTempFile(filePath: string | undefined): boolean {
  if (!filePath) {
    return false;
  }
  const segments = filePath.split('/');
  const fileName = segments[segments.length - 1] ?? '';
  return fileName.startsWith('~$');
}
