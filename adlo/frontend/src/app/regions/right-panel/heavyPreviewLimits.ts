import type { FileCategory } from './fileTypeRouter';
import { profileDiffCost, type DiffCostProfile } from './diffCost';

/**
 * 大文件直接渲染阈值（字节）：超过后先显示友好提示 + "仍然打开"，
 * 避免超大文件解码/渲染卡住界面。文本读取上限为 8MB；媒体走 Range 流式端点，
 * 不再有传输体积上限，这里的媒体阈值只是“先确认再渲染”的二次门禁；
 * Office/PDF 分支会把整份字节 fetch 给解析库，阈值同时限制这一步。
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
 * 阈值偏保守；hint 显示的体积按 `fileContent.length` 近似（见 EditorSurfaceShell）。
 */
export const TEXT_HEAVY_PREVIEW_CHARS = 1024 * 1024;

export function isHeavyTextCategory(category: FileCategory): boolean {
  return category === 'text' || category === 'code' || category === 'markdown';
}

/**
 * 变更预览的体积显示值（字符数）：取 base/current 两侧较大者，仅用于
 * 确认门卡片的体积文案；是否进门由 `classifyDiffTier` 决定。
 */
export function heavyChangePreviewLength(baseContent: string, currentContent: string): number {
  return Math.max(baseContent.length, currentContent.length);
}

/**
 * 差异代价分档（事项 1）：单一体积门不足以覆盖"体积不大但行数极多"的文件
 * （实测 4000 行 / 约 1000 变更块的文件打开后被折叠标记轮询拖住数秒）。
 * 分档只使用字符数与行数（行×行的 DP 代价属于 changePreviewDiffRanges 自己的
 * 分解上限，不是 MergeView 的成本，不参与 viewer 降级）。
 * light 全功能；degraded 关变更高亮与折叠轮询（语法仍解析）；heavy 走确认门 + plain 双栏。
 */
export type DiffCostTier = 'light' | 'degraded' | 'heavy';

const LIGHT_MAX_CHARS = 256 * 1024;
const LIGHT_MAX_LINES = 3000;
const HEAVY_MAX_LINES = 10_000;

export function classifyDiffTier(profile: DiffCostProfile): DiffCostTier {
  const maxChars = Math.max(profile.baseChars, profile.currentChars);
  const maxLines = Math.max(profile.baseLines, profile.currentLines);
  if (maxChars > TEXT_HEAVY_PREVIEW_CHARS || maxLines > HEAVY_MAX_LINES) {
    return 'heavy';
  }
  if (maxChars > LIGHT_MAX_CHARS || maxLines > LIGHT_MAX_LINES) {
    return 'degraded';
  }
  return 'light';
}

/** 侧栏大纲跳过谓词：与面板 `costTier` 同源（同一对纯函数、同一输入）。 */
export function shouldSkipChangeOutline(baseContent: string, currentContent: string): boolean {
  return classifyDiffTier(profileDiffCost(baseContent, currentContent)) === 'heavy';
}

/**
 * 重型确认后的 plain 展示分 pane（方案A-2）。
 * 日志实证：MergeView 挂载 5.6MB original 即占 1.3~1.5s（11.5k 行非虚拟化
 * widget DOM），plain CodeEditor 只挂可视行。删除型展 base、新增型展 current、
 * 双侧重型双 pane 独立滚动；双侧都空返回 [] 由调用端回退原有渲染。
 */
export type HeavyPreviewPane = 'base' | 'current';

export function getHeavyPreviewPanes(
  baseContent: string,
  currentContent: string,
): HeavyPreviewPane[] {
  const panes: HeavyPreviewPane[] = [];
  if (baseContent.length > 0) {
    panes.push('base');
  }
  if (currentContent.length > 0) {
    panes.push('current');
  }
  return panes;
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
