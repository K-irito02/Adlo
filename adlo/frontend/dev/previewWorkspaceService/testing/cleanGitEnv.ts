/**
 * 临时仓库测试的环境净化。
 *
 * 链接工作树里 `git push` / `git commit` 会向 hook 注入 `GIT_DIR`（指向
 * `.git/worktrees/<name>`）。hook 再拉起 vitest 时，测试里的 `execFileSync('git', …)`
 * 与被测代码（`git.ts` 的 `runGit`）都会继承它，于是“临时仓库”的命令实际落在真实仓库上：
 * `git remote add` 报 already exists、`git init --bare` 把真实仓库写成 bare=true、
 * `git config user.*` 覆盖真实身份（2026-11-19 实测，gitWorktree.test.ts 16 项全红）。
 *
 * 门禁侧（`.githooks/pre-push`、`check:changed` 的 `cleanGitEnv`）已剥离；测试侧再兜一层：
 * 在文件顶层调用本函数后，进程内所有 git 子进程只会按 cwd 发现仓库。
 */

const REPO_LOCATION_ENV_KEYS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_PREFIX',
] as const;

/** 删除仓库选择类变量；返回实际删除的键，供测试断言。 */
export function sanitizeGitEnvForTest(): string[] {
  const removed: string[] = [];
  for (const key of REPO_LOCATION_ENV_KEYS) {
    if (process.env[key] !== undefined) {
      delete process.env[key];
      removed.push(key);
    }
  }
  return removed;
}
