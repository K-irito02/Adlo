import path from "node:path";

export const BASE_IDENTIFIER = "com.adlo.app";

/** Per-worktree dev state dir: `<adlo>/.adl-instance/`. Deliberately outside `target/`. */
export const INSTANCE_STATE_DIRNAME = ".adl-instance";

const WORKTREES_POOL = /-worktrees$/i;

function sanitizeSuffix(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function suffixFromWorktreeDir(repoRoot) {
  const worktreeRoot = path.dirname(repoRoot);
  const poolRoot = path.dirname(worktreeRoot);
  if (!WORKTREES_POOL.test(path.basename(poolRoot))) {
    return null;
  }
  return sanitizeSuffix(path.basename(worktreeRoot)) || null;
}

/**
 * Resolve the Tauri app identifier for this dev run.
 *
 * Tauri derives both `app_data_dir()` and the Windows WebView2 user-data folder from
 * the identifier, so a distinct identifier per worktree isolates the SQLite DB,
 * `config.json`, logs and the Chromium profile. The main worktree keeps the plain
 * identifier (no behaviour change); a worktree under `*-worktrees/<dir>` gets
 * `<base>.<dir>`, and `ADL_INSTANCE_ID` overrides the directory-derived suffix.
 *
 * The locator lives in `<adlo>/.adl-instance/` (gitignored, survives `cargo clean`) so a
 * per-instance storage-root choice cannot leak into other instances, and routine build
 * cleanup never destroys dev databases or WebView profiles.
 */
export function resolveInstance({ repoRoot, env = process.env }) {
  const root = path.resolve(repoRoot);
  const suffix = sanitizeSuffix(env.ADL_INSTANCE_ID ?? "") || suffixFromWorktreeDir(root);
  if (!suffix) {
    return { suffix: null, identifier: BASE_IDENTIFIER, stateDir: null, locatorPath: null };
  }
  const stateDir = path.join(root, INSTANCE_STATE_DIRNAME);
  return {
    suffix,
    identifier: `${BASE_IDENTIFIER}.${suffix}`,
    stateDir,
    locatorPath: path.join(stateDir, "storage-locator.json"),
  };
}

/**
 * 是否为本项目 dev 实例自动管理的 locator 落点（`<worktree>/adlo/.adl-instance/`）。
 *
 * 也接受旧位置 `target/adl-instance/`：从更早版本的父实例继承来的 locator 同样要丢弃。
 * 用于嵌套启动时清理"从父实例继承来的" locator：只有这种自动管理的继承值才该被丢弃；
 * 用户/测试显式设置的自定义 locator 路径必须保留。
 */
export function isInstanceLocatorPath(candidate) {
  if (typeof candidate !== "string" || candidate.length === 0) {
    return false;
  }
  return /(?:[\\/]target[\\/]adl-instance|[\\/][.]adl-instance)[\\/]storage-locator\.json$/i.test(
    candidate,
  );
}
