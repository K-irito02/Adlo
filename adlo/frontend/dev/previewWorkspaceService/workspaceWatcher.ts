import { watch, type FSWatcher, existsSync } from 'node:fs';
import { join, sep } from 'node:path';

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
  '.adl-cache',
]);
/** 精确文件名（大小写不敏感）。 */
const IGNORED_EXACT_FILENAMES = new Set(['debug-logs.txt', 'debug-logs-browser.txt']);
/** 文件名后缀（大小写不敏感）。 */
const IGNORED_SUFFIXES = ['.tmp', '.ds_store'];
const DEBOUNCE_MS = 400;
const MAX_BATCH = 500;
/** 注册表上限：超出即停掉最久未用的 watcher（dev 会话内句柄不泄漏）。 */
const REGISTRY_LIMIT = 8;

function isIgnored(relativePath: string): boolean {
  const parts = relativePath.split('/');
  if (parts.some((part) => IGNORED_DIRS.has(part))) {
    return true;
  }
  const fileName = (parts[parts.length - 1] ?? '').toLowerCase();
  if (IGNORED_EXACT_FILENAMES.has(fileName)) {
    return true;
  }
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

  start(root: string): void {
    this.stop();
    // Linux 下 `recursive: true` 不受支持、缺失目录会同步抛：包住，失败即保持
    // 空实现可用（降级为无自动刷新），不把异常冒泡成路由 500。
    try {
      this.#watcher = watch(root, { recursive: true }, (eventType, fileName) => {
        if (!fileName) {
          return;
        }
        const relativePath = String(fileName).split(sep).join('/');
        if (isIgnored(relativePath)) {
          return;
        }
        if (eventType === 'rename') {
          // rename 覆盖创建与删除：用存在性尽力分类（TOCTOU，只做尽力，
          // 误判由后续事件纠正；删除路由亦可直接调 removePath 精确标记）。
          try {
            if (!existsSync(join(root, relativePath))) {
              this.#pendingRemoved.add(relativePath);
              this.#pendingChanged.delete(relativePath);
              this.#schedule();
              return;
            }
          } catch {
            // 存在性探测失败则按 changed 处理，不丢事件。
          }
        }
        this.#pendingChanged.add(relativePath);
        this.#schedule();
      });
    } catch (err) {
      console.warn('[preview-watcher] disabled:', err);
      this.#watcher = null;
      return;
    }
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
    // 游标已被淘汰（保留区只留后 200 批，游标连续）：`since <= oldest-2` 意味着
    // 有被裁掉的批次新于 since，强制 overflow 唤醒消费端全量重搜，否则静默丢更新
    //（kernel 溢出退化契约）。`since == oldest-1` 恰好无丢失，不误报。
    if (this.#batches.length > 0 && since < this.#batches[0].cursor - 1) {
      return { cursor: this.#cursor, changed: [], removed: [], overflow: true };
    }
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

  /**
   * 精确标记删除（供文件删除路由调用；watch 回调已用存在性尽力分类，
   * 此方法是无 TOCTOU 的精确通道）。
   */
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
      // 总量超预算即 overflow：载荷置空，前端整轮重搜覆盖（与 Rust watcher 同契约，
      // 不传递截断后的残缺增量）。
      const overflow = changed.length + removed.length > MAX_BATCH;
      this.#batches.push({
        cursor: this.#cursor,
        changed: overflow ? [] : changed,
        removed: overflow ? [] : removed,
        overflow,
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
      // LRU 语义：命中即移到末尾，淘汰时停掉最久未用者。
      registry.delete(rootPath);
      registry.set(rootPath, existing);
      return existing;
    }
    // start() 内部已包住 watch 失败（降级空实现），此处不抛。
    const watcher = new WorkspaceWatcher();
    watcher.start(rootPath);
    registry.set(rootPath, watcher);
    if (registry.size > REGISTRY_LIMIT) {
      const oldest = registry.keys().next().value;
      if (oldest !== undefined) {
        registry.get(oldest)?.stop();
        registry.delete(oldest);
      }
    }
    return watcher;
  },
  dispose(rootPath: string): void {
    // 供工作区关闭路由调用（当前 dev 路由尚未接线，保留作生命周期出口）。
    registry.get(rootPath)?.stop();
    registry.delete(rootPath);
  },
  disposeAll(): void {
    registry.forEach((watcher) => watcher.stop());
    registry.clear();
  },
};
