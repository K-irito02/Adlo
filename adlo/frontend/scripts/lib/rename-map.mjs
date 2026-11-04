/**
 * 解析 `git diff --name-status -M` 的输出，得到「新路径 → base 旧路径」映射。
 *
 * 用途：整仓搬目录（改名）后，仍能按旧路径读回 base 版本的同一文件。
 * 否则检查类脚本会以为每个文件都是「新增」，把历史内容全当成本次新增。
 */
export function parseRenameMap(nameStatusText) {
  const renamed = new Map();
  const changed = [];
  for (const rawLine of String(nameStatusText ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const parts = line.split('\t');
    if (parts.length < 2) {
      continue;
    }
    const status = parts[0];
    if (status === 'A' || status === 'M') {
      changed.push(parts[1]);
    } else if (status.startsWith('R') || status.startsWith('C')) {
      if (parts.length < 3) {
        continue;
      }
      renamed.set(parts[2], parts[1]);
      changed.push(parts[2]);
    }
  }
  return { renamed, changed };
}
