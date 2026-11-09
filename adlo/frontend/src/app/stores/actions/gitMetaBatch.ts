/**
 * git 元数据批次识别（watcher 合成的 `.git/<rel>` 路径）。
 *
 * 背景：`.git` 不在工作树监听范围（避免 objects/** 噪音与 index 回写放大），
 * 后端只为 git 元数据白名单（HEAD/index/refs/logs 等）合成 `.git/` 前缀路径，
 * 前端按本模块识别后：无 overflow 时只静默刷新 git 快照，不触发文件树/搜索/选中文件对账；
 * overflow 批次无法归因，按整轮重扫 + 选中 reconcile 处理（契约既定）。
 */

const GIT_META_EXACT = '.git';
const GIT_META_PREFIX = '.git/';

/** 单路径：归一化分隔符与大小写后判断是否为 git 元数据路径。 */
export function isGitMetaPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
  return normalized === GIT_META_EXACT || normalized.startsWith(GIT_META_PREFIX);
}

/** 路径切分：git 元数据 vs 普通路径，保持各自原有顺序。 */
export function partitionBatchPaths(paths: string[]): { git: string[]; normal: string[] } {
  const git: string[] = [];
  const normal: string[] = [];
  for (const path of paths) {
    (isGitMetaPath(path) ? git : normal).push(path);
  }
  return { git, normal };
}
