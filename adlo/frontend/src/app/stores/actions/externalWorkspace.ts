import type { RecentWorkspaceEntry } from '@adlo/kernel';

/**
 * 外部文件（不属于任何侧栏工作区）的临时工作区。
 *
 * 智能体链接、系统路径跳转可能指向用户从未添加过的目录（下载、图片库等）。
 * 文件面板按「工作区」隔离，直接读取需要一个工作区身份，但**不能**把该目录
 * 登记成侧栏工作区（会污染用户的工作区列表，且服务端 detect_root 会上溯到
 * 最近的工程标记目录，得到的根未必是文件所在目录）。
 *
 * 因此这里生成一个仅存在于前端内存的隐藏工作区条目 + `externalFileRoots` 映射：
 * - 带 `removedFromSidebar: true`：侧栏、文件树、终端、检索等可见列表会过滤掉
 *   （Git 可视化标签栏目前仍按全量 `recentWorkspaces` 展示，未做过滤）；
 * - 不调用 `workspace.addToSidebar`：不落盘，重启即消失；
 * - 携带文件所在目录作为 root：读取、保存按该目录解析；
 * - 外部文件的磁盘变更**不监听**（隐藏根不进后端 watcher）。保存前：有外部旗/watch
 *   信号，或存在文档基线（选中文件取当前正文，非选中取文档缓存）时读盘比对，判定
 *   为 external 才走冲突卡片；既无信号也无基线时按草稿优先直接落盘。
 */
export const EXTERNAL_WORKSPACE_PREFIX = 'external-';

/** 同一目录得到同一 id（幂等）；id 不含 `:`（保存链按首个 `:` 拆分工作区键）。 */
export function externalWorkspaceId(rootPath: string): string {
  const normalized = rootPath.replace(/\\/g, '/').toLowerCase();
  // 双 32 位哈希：单哈希 2^32 空间在极端场景下可能撞 id，撞了会把两个目录
  // 的根互相覆盖；两段串接把空间提到 2^64，且仍保持无分隔符 `:`。
  const first = fnv1a(normalized, 0x811c9dc5);
  const second = fnv1a(normalized, 0x01000193);
  return `${EXTERNAL_WORKSPACE_PREFIX}${first}-${second}`;
}

function fnv1a(input: string, seed: number): string {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function isExternalWorkspaceId(workspaceId: string | undefined): boolean {
  return typeof workspaceId === 'string' && workspaceId.startsWith(EXTERNAL_WORKSPACE_PREFIX);
}

const ABSOLUTE_PATH_RE = /^(?:[a-zA-Z]:[\\/]|[\\/]{2})/;

/** 绝对路径拆成「父目录 + 文件名」（统一正斜杠）；非绝对路径/空路径返回 null。 */
export function splitAbsolutePath(absPath: string): { rootPath: string; fileName: string } | null {
  const trimmed = absPath.trim();
  if (!ABSOLUTE_PATH_RE.test(trimmed)) {
    return null;
  }
  const normalized = trimmed.replace(/\\/g, '/').replace(/\/+$/, '');
  const slash = normalized.lastIndexOf('/');
  if (slash <= 0 || slash === normalized.length - 1) {
    return null;
  }
  // `C:` 在 Windows 上是「驱动器相对路径」，作为工作区根必须写成 `C:/`。
  const parent = normalized.slice(0, slash);
  const rootPath = /^[a-zA-Z]:$/.test(parent) ? `${parent}/` : parent;
  return { rootPath, fileName: normalized.slice(slash + 1) };
}

export function createExternalWorkspaceEntry(rootPath: string): RecentWorkspaceEntry {
  const trimmed = rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const normalized = /^[a-zA-Z]:$/.test(trimmed) ? `${trimmed}/` : trimmed;
  const name = normalized
    .replace(/\/+$/, '')
    .slice(normalized.replace(/\/+$/, '').lastIndexOf('/') + 1);
  return {
    id: externalWorkspaceId(normalized),
    path: normalized,
    rootPath: normalized,
    name: name || normalized,
    lastOpenedAt: Date.now(),
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: true,
    available: true,
  };
}
