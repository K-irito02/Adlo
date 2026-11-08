/**
 * 工作区根路径匹配（跨端统一口径）。
 *
 * 同一个工作区可能以不同字符串出现：Windows verbatim 前缀（`\\?\`）、
 * 反斜杠/斜杠混用、盘符大小写、尾部斜杠。比较前统一归一化，
 * 避免批次归属判定因字面差异漏掉目标工作区。
 *
 * 大小写：带盘符的 Windows 路径按 Windows 语义整体忽略大小写；没有盘符的
 * POSIX 路径保持原样（大小写敏感文件系统上 `/w/Repo` 与 `/w/repo` 是两个根）。
 */
export function workspacePathKey(path: string | undefined): string {
  if (!path) {
    return '';
  }
  const normalized = path
    .trim()
    .replace(/^\\\\\?\\/, '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
  return /^[a-zA-Z]:(?:\/|$)/.test(normalized) ? normalized.toLowerCase() : normalized;
}

/** 两个工作区根路径是否指向同一目录（空值一律不相等）。 */
export function sameWorkspacePath(a: string | undefined, b: string | undefined): boolean {
  const key = workspacePathKey(a);
  return key !== '' && key === workspacePathKey(b);
}
