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

const SPREADSHEET_EXTENSIONS = new Set(['xls', 'xlsx', 'xlsm', 'xlsb', 'ods']);
// csv 有意留在文本通道（收尾 F-01/H-02）：它是可编辑的纯文本数据格式，
// 划入 spreadsheet 会失去编辑入口；表格渲染可后续做"预览/源码"双模式。

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
  // 反斜杠归一化（收尾 F-03）：Windows 风格路径与 Rust 侧对齐，
  // isOfficeTempFile 的 basename 判定同样依赖此切分。
  const segments = filePath.split(/[\\/]/);
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
 * 是否走二进制媒体通道（图片/音视频/办公文档）：`usesBinaryMediaChannel` 用它
 * 把「二进制来源」与「文本读取」分开，并与 `EditorSurfaceShell` 的渲染分支保持一致。
 */
function isMediaFileCategory(category: FileCategory): boolean {
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
 * 走「Range 媒体通道」的品类 = 媒体/办公 + 其它二进制（zip/exe/ttf/odt…）。
 *
 * 二进制文件**不能按文本读**：历史上会以 "binary files are not readable as context"
 * 报错，用户只看到一句打不开。走媒体通道后只做 HEAD 探测（存在性/体积/URL），
 * 渲染层统一给「无法预览此格式 + 用系统默认程序打开」，不再产生无效的读文本错误。
 */
export function usesBinaryMediaChannel(category: FileCategory): boolean {
  return category === 'binary' || isMediaFileCategory(category);
}

/**
 * 是否 Office 旧版二进制格式（收尾 F-18：`.doc/.dot/.ppt`，OLE 非 zip）。
 * 解析库读不了，调用端据此跳过字节读取、直接给转存指引。
 * 注意：`.xls/.xlsb` 不在此列——SheetJS 可读 BIFF，有意不拦截。
 */
export function isLegacyOfficeFile(filePath: string | undefined): boolean {
  if (!filePath) {
    return false;
  }
  const segments = filePath.split(/[\\/]/);
  const fileName = segments[segments.length - 1] ?? '';
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) {
    return false;
  }
  const ext = fileName.slice(dotIndex + 1).toLowerCase();
  return ext === 'doc' || ext === 'dot' || ext === 'ppt';
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
  const segments = filePath.split(/[\\/]/);
  const fileName = segments[segments.length - 1] ?? '';
  return fileName.startsWith('~$');
}
