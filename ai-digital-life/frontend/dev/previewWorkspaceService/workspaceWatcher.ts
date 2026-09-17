import { watch, type FSWatcher } from 'node:fs';
import { relative, sep } from 'node:path';

export interface FilesChangedBatch {
  cursor: number;
  changed: string[];
  removed: string[];
  overflow?: boolean;
}

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'target',
  'dist',
  'build',
  '.next',
  '.cache',
  '__pycache__',
  '.venv',
  'vendor',
  'coverage',
  '.adl-logs',
  'logs',
  'test-artifacts',
]);
const IGNORED_SUFFIXES = ['debug-logs.txt', 'debug-logs-browser.txt', '.tmp', '.DS_Store'];
const DEBOUNCE_MS = 400;
const MAX_BATCH = 500;

function isIgnored(relativePath: string): boolean {
  const parts = relativePath.split('/');
  if (parts.some((part) => IGNORED_DIRS.has(part))) {
    return true;
  }
  const fileName = parts[parts.length - 1] ?? '';
  return IGNORED_SUFFIXES.some((suffix) => fileName.endsWith(suffix));
}

/**
 * 预览模式（dev-only）的文件变更聚合器：`fs.watch` 递归 + 400ms 去抖，
 * 维护自增游标与批次列表，供前端轮询（Tauri 侧对应 Rust watcher + WS 推送）。
 */
export class WorkspaceWatcher {
  #watcher: FSWatcher | null = null;
  #cursor = 0;
  #batches: FilesChangedBatch[] = [];
  #pendingChanged = new Set<string>();
  #pendingRemoved = new Set<string>();
  #timer: NodeJS.Timeout | null = null;
  #root = '';

  start(root: string): void {
    this.stop();
    this.#root = root;
    this.#watcher = watch(root, { recursive: true }, (_eventType, fileName) => {
      if (!fileName) {
        return;
      }
      const relativePath = String(fileName).split(sep).join('/');
      if (isIgnored(relativePath)) {
        return;
      }
      this.#pendingChanged.add(relativePath);
      this.#schedule();
    });
    this.#watcher.on('error', (err) => {
      console.warn('[preview-watcher] disabled:', err);
      this.stop();
    });
  }

  stop(): void {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    this.#watcher?.close();
    this.#watcher = null;
    this.#pendingChanged.clear();
    this.#pendingRemoved.clear();
  }

  /** 拉取自 `since` 之后的批次；无新批次时返回空批与当前游标。 */
  since(since: number): FilesChangedBatch {
    const fresh = this.#batches.filter((batch) => batch.cursor > since);
    if (fresh.length === 0) {
      return { cursor: this.#cursor, changed: [], removed: [] };
    }
    const changed = new Set<string>();
    const removed = new Set<string>();
    let overflow = false;
    for (const batch of fresh) {
      batch.changed.forEach((p) => changed.add(p));
      batch.removed.forEach((p) => removed.add(p));
      overflow = overflow || batch.overflow === true;
    }
    return { cursor: this.#cursor, changed: [...changed], removed: [...removed], overflow };
  }

  removePath(relativePath: string): void {
    if (isIgnored(relativePath)) {
      return;
    }
    this.#pendingRemoved.add(relativePath);
    this.#pendingChanged.delete(relativePath);
    this.#schedule();
  }

  #schedule(): void {
    if (this.#timer) {
      clearTimeout(this.#timer);
    }
    this.#timer = setTimeout(() => {
      this.#timer = null;
      const changed = [...this.#pendingChanged];
      const removed = [...this.#pendingRemoved];
      this.#pendingChanged.clear();
      this.#pendingRemoved.clear();
      if (changed.length === 0 && removed.length === 0) {
        return;
      }
      this.#cursor += 1;
      this.#batches.push({
        cursor: this.#cursor,
        changed: changed.slice(0, MAX_BATCH),
        removed: removed.slice(0, MAX_BATCH),
        overflow: changed.length + removed.length > MAX_BATCH,
      });
      if (this.#batches.length > 200) {
        this.#batches = this.#batches.slice(-200);
      }
    }, DEBOUNCE_MS);
  }
}

const registry = new Map<string, WorkspaceWatcher>();

/** 每个工作区根一个 watcher（预览模式可能在多工作区间切换）。 */
export const workspaceWatchers = {
  ensure(rootPath: string): WorkspaceWatcher {
    const existing = registry.get(rootPath);
    if (existing) {
      return existing;
    }
    const watcher = new WorkspaceWatcher();
    watcher.start(rootPath);
    registry.set(rootPath, watcher);
    return watcher;
  },
  disposeAll(): void {
    registry.forEach((watcher) => watcher.stop());
    registry.clear();
  },
};
