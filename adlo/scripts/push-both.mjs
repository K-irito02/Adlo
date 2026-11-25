/**
 * 一次推送两个远程（origin + gitee），只让 pre-push 门禁跑一遍。
 *
 * 用法（在 `adlo/` 或仓库根都可以）：
 *   pnpm run push:both -- main slot-1 slot-2
 *   pnpm run push:both              # 只推当前分支
 *
 * 为什么（2026-11-21 retro）：两个 remote 各自触发一次 pre-push，`check:repo` +
 * `check:changed` 会在同一条提交上重复跑（首推约 5 分钟）。这里先按正常流程推
 * 第一个远程（钩子照常执行），成功后第二个远程用 `--no-verify`：两次推送的是
 * 同一批 SHA，门禁结论对第二个远程同样成立。最后用 `ls-remote` 校验两端 SHA。
 *
 * 需要单独远程的钩子行为时继续用 `git push <remote> <branch>`，不要用本脚本。
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REMOTES = ["origin", "gitee"];

/** 剥离 git hook 注入的仓库环境变量，避免子进程操作真实仓库的另一种布局。 */
const CLEAN_ENV = { ...process.env };
delete CLEAN_ENV.GIT_DIR;
delete CLEAN_ENV.GIT_WORK_TREE;
delete CLEAN_ENV.GIT_INDEX_FILE;
delete CLEAN_ENV.GIT_PREFIX;

function git(args, options = {}) {
  return spawnSync("git", args, {
    encoding: "utf8",
    env: CLEAN_ENV,
    ...options,
  });
}

function capture(args, cwd) {
  const result = git(args, { cwd });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr ?? ""}`);
  }
  return (result.stdout ?? "").trim();
}

function currentBranch(repoRoot) {
  const branch = capture(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot);
  if (!branch || branch === "HEAD") {
    throw new Error("detached HEAD：请显式传分支名，例如 `pnpm run push:both -- main`");
  }
  return branch;
}

/** `pnpm run <script> -- <args>` 会把分隔符原样传入；忽略它。 */
export function parseTargets(argv) {
  return argv.filter((arg) => arg !== "--");
}

function main() {
  const branches = parseTargets(process.argv.slice(2));
  const implRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const repoRoot = capture(["rev-parse", "--show-toplevel"], implRoot);
  const targets = branches.length > 0 ? branches : [currentBranch(repoRoot)];

  targets.forEach((branch) => capture(["rev-parse", "--verify", branch], repoRoot));

  REMOTES.forEach((remote, index) => {
    const args = ["push"];
    if (index > 0) {
      // 同一批 SHA 已在第一个远程过门禁；避免重复执行 check:repo + check:changed。
      args.push("--no-verify");
    }
    args.push(remote, ...targets);
    console.log(`[push:both] git ${args.join(" ")}`);
    const result = git(args, { cwd: repoRoot, stdio: "inherit" });
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  });

  const expected = new Map(
    targets.map((branch) => [branch, capture(["rev-parse", branch], repoRoot)]),
  );
  let failed = false;
  for (const remote of REMOTES) {
    const out = capture(["ls-remote", "--heads", remote, ...targets], repoRoot);
    for (const branch of targets) {
      const line = out.split(/\r?\n/).find((row) => row.endsWith(`refs/heads/${branch}`));
      const remoteSha = line?.split(/\s+/)[0] ?? "(missing)";
      const localSha = expected.get(branch);
      const ok = remoteSha === localSha;
      console.log(
        `[push:both] ${remote} ${branch}: ${remoteSha}${ok ? "" : ` != local ${localSha}`}`,
      );
      failed ||= !ok;
    }
  }
  if (failed) {
    process.exit(1);
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main();
}
