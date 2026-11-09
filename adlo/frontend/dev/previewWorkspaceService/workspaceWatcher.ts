import { watch, type FSWatcher, existsSync, statSync, readFileSync } from 'node:fs';
import { isAbsolute as pathIsAbsolute, join, normalize, sep } from 'node:path';

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
const REGISTRY_LIMIT = 32;

const GIT_META_TOP_FILES = new Set([
  'head',
  'index',
  'packed-refs',
  'fetch_head',
  'orig_head',
  'merge_head',
  'cherry_pick_head',
  'revert_head',
  'rebase_head',
  'merge_msg',
  'squash_msg',
  'auto_merge',
]);
const GIT_META_PREFIXES = ['refs/', 'logs/', 'rebase-merge/', 'rebase-apply/'];

/**
 * git 元数据白名单判定：匹配 gitdir/commondir 内的相对路径（正斜杠分隔），
 * 合法则返回合成路径 `.git/<rel>`；不匹配（含 objects/**、hooks/**）返回 null。
 * 前端按 `.git/` 前缀识别 git 批次：无 overflow 时只静默刷新 git 快照；
 * overflow 批次无法归因，按整轮重扫 + 选中 reconcile 处理。
 */
function normalizeGitMeta(relativePath: string): string | null {
  const parts = relativePath.split('/').filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  const joined = parts.join('/');
  const lowered = joined.toLowerCase();
  if (parts.length === 1 && GIT_META_TOP_FILES.has(lowered)) {
    return `.git/${joined}`;
  }
  if (GIT_META_PREFIXES.some((prefix) => lowered.startsWith(prefix))) {
    return `.git/${joined}`;
  }
  return null;
}

/**
 * 解析工作区根下的 git 元数据目录：
 * - `.git` 是目录（普通仓库/主工作树）→ [root/.git]（gitdir 与 commondir 同一）
 * - `.git` 是文件（linked worktree / 子模块）→ 解析 `gitdir: <path>` 指针
 *   （相对路径按根解析，绝对路径原样），再读 gitdir 内 `commondir` 文件
 *   （相对路径按 gitdir 解析）得到共享 commondir；返回 [gitdir, commondir] 去重
 * - 非仓库 / 读取失败 → []
 */
function resolveGitDirs(root: string): string[] {
  const dotGit = join(root, '.git');
  try {
    if (statSync(dotGit).isDirectory()) {
      return [dotGit];
    }
    const content = readFileSync(dotGit, 'utf8');
    const match = content.match(/gitdir:\s*(.+)/);
    if (!match) {
      return [];
    }
    const gitdir = resolvePath(root, match[1].trim());
    // gitdir 必须是目录（linked worktree 主仓被删后指针悬空）：双端对该项对账一致。
    if (!statSync(gitdir).isDirectory()) {
      return [];
    }
    const commondirFile = join(gitdir, 'commondir');
    let commondir = gitdir;
    if (existsSync(commondirFile)) {
      const pointer = readFileSync(commondirFile, 'utf8').trim();
      if (pointer.length > 0) {
        commondir = resolvePath(gitdir, pointer);
      }
    }
    if (!statSync(commondir).isDirectory()) {
      return [gitdir];
    }
    return [...new Set([gitdir, commondir])];
  } catch {
    return [];
  }
}

/**
 * 目录创建时间指纹（birthtimeMs）；文件系统不报告 btime（Linux 部分文件系统为 0）
 * 时返回 null —— 与 Rust 侧 btime 不可得时的降级语义对齐。
 */
function dirFingerprint(p: string): number | null {
  try {
    const btime = statSync(p).birthtimeMs;
    return btime > 0 ? btime : null;
  } catch {
    return null;
  }
}

function resolvePath(base: string, target: string): string {
  return pathIsAbsolute(target) ? normalize(target) : normalize(join(base, target));
}

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
  /** git 元数据监听（linked worktree 时为 gitdir 与 commondir；plain repo 仅一个）。 */
  #gitWatchers: Array<{ watcher: FSWatcher; gitRoot: string; identity: number | null }> = [];
  /** 工作区根（最近一次 start 的目标；reconcile 重解析时用）。 */
  #root: string | null = null;
  #cursor = 0;
  #batches: FilesChangedBatch[] = [];
  #pendingChanged = new Set<string>();
  #pendingRemoved = new Set<string>();
  #timer: NodeJS.Timeout | null = null;

  /** 当前是否有活跃的 fs.watch（首次 start 时目录不存在则为 false）。 */
  isWatching(): boolean {
    return this.#watcher !== null;
  }

  /** git 元数据 watcher 数量（测试与诊断用）。 */
  gitWatcherCount(): number {
    return this.#gitWatchers.length;
  }

  start(root: string): void {
    this.stop();
    // 侧栏可能保留已删除/暂时离线的路径：不进入 fs.watch（否则每次轮询都刷 ENOENT 堆栈），
    // 该根保持空实现（无批次）；目录随后出现时由 `workspaceWatchers.ensure` 重新 start。
    if (!existsSync(root)) {
      return;
    }
    this.#root = root;
    this.#startGitWatchers(root);
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

  /**
   * 布局漂移对账：每次 `ensure` 重解析 git 目录，与登记中的 git watcher 比对——
   * 磁盘上 `.git` 被删除重建、目录 ↔ gitfile 布局互换时，旧登记被替换/补齐，
   * 否则旧句柄盯着已消失的目录，git 静默跟手永久丢失（前端显式刷新/focus 兜底仍在，
   * 但 watcher 通道废了）。根 watcher 死亡换新时由 `start()` 顺带重解析，这里是常态轮询路径。
   */
  reconcileGitWatchers(): void {
    const root = this.#root;
    if (!root) {
      return;
    }
    const fresh = resolveGitDirs(root);
    // 1) 关闭登记中但已不在磁盘布局的旧 git watcher（布局漂移/git 目录被移走）；
    //    同路径删除重建（.git 被 rm+init）时路径字符串不变，靠 birthtimeMs 指纹识别。
    const keep: Array<{ watcher: FSWatcher; gitRoot: string; identity: number | null }> = [];
    for (const entry of this.#gitWatchers) {
      if (!fresh.includes(entry.gitRoot)) {
        entry.watcher.close();
        continue;
      }
      const freshIdentity = dirFingerprint(entry.gitRoot);
      const identityDrifted =
        entry.identity !== null && freshIdentity !== null && entry.identity !== freshIdentity;
      if (identityDrifted) {
        entry.watcher.close();
        continue;
      }
      keep.push(entry);
    }
    this.#gitWatchers = keep;
    // 2) 补齐新出现的 git 目录（linked worktree 首次登记 main-repo commondir 等）。
    for (const gitRoot of fresh) {
      if (!this.#gitWatchers.some((entry) => entry.gitRoot === gitRoot)) {
        const watcher = this.#spawnGitWatcher(gitRoot);
        if (watcher) {
          this.#gitWatchers.push({ watcher, gitRoot, identity: dirFingerprint(gitRoot) });
        }
      }
    }
  }

  /**
   * 额外监听 git 元数据目录（gitdir + commondir，去重），只放行
   * `normalizeGitMeta` 白名单，路径合成 `.git/<rel>` 进入同一批次队列。
   * 监听失败（目录消失/权限）只降级为静默缺失，不影响根 watcher。
   */
  #startGitWatchers(root: string): void {
    for (const gitRoot of resolveGitDirs(root)) {
      const watcher = this.#spawnGitWatcher(gitRoot);
      if (watcher) {
        this.#gitWatchers.push({ watcher, gitRoot, identity: dirFingerprint(gitRoot) });
      }
    }
  }

  #spawnGitWatcher(gitRoot: string): FSWatcher | null {
    try {
      const watcher = watch(gitRoot, { recursive: true }, (_eventType, fileName) => {
        if (!fileName) {
          return;
        }
        const relativePath = String(fileName).split(sep).join('/');
        const synthetic = normalizeGitMeta(relativePath);
        if (!synthetic) {
          return;
        }
        this.#pendingChanged.add(synthetic);
        this.#schedule();
      });
      watcher.on('error', () => {
        // git 目录被移走（仓库删除/工作树移除）：单个 git watcher 失效不阻塞根监听。
        this.#gitWatchers = this.#gitWatchers.filter((entry) => entry.watcher !== watcher);
        watcher.close();
      });
      return watcher;
    } catch {
      // 解析/监听失败降级为无 git 感知（维持现状，不影响普通文件刷新）。
      return null;
    }
  }

  stop(): void {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    this.#watcher?.close();
    this.#watcher = null;
    this.#root = null;
    for (const entry of this.#gitWatchers) {
      entry.watcher.close();
    }
    this.#gitWatchers = [];
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
      // 首次 ensure 时目录不存在 → 空实现；目录出现后在此恢复监听。
      if (!existing.isWatching() && existsSync(rootPath)) {
        existing.start(rootPath);
      }
      // 布局漂移对账：git 元数据目录（.git 被删重建 / 目录↔gitfile 互换）与
      // 已登记的 git watcher 比对重解析，stale 登记替换/补齐/关闭。
      existing.reconcileGitWatchers();
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
