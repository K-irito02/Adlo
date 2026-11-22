/**
 * 工作树一次性初始化：git hooks + CodeGraph 索引。
 *
 * 用法（任意工作树、任意槽位）：
 *   pnpm --dir adlo run setup:worktree
 *
 * - hooks：`core.hooksPath=.husky` 是**仓库级**配置，一处执行即可覆盖所有工作树。
 * - CodeGraph：索引落在 `adlo/.codegraph/`（已 gitignore），**每个工作树各建一份**
 *   （索引内容跟随该工作树的分支与文件，不能跨工作树共用）。
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  return result.status === 0;
}

function capture(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr ?? ""}`);
  }
  return (result.stdout ?? "").trim();
}

const implRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = capture("git", ["rev-parse", "--show-toplevel"], implRoot);

// 1) git hooks（仓库级，幂等）。Husky 钩子提交在 `.husky/`，工作树共享。
//    根 package.json 的 prepare 会安装 Husky 并把 hooksPath 指到 `.husky`；
//    这里只做幂等兜底。
//    `git config --get` 在未设置时退出码为 1，不能按失败处理。
const hooksProbe = spawnSync("git", ["config", "--get", "core.hooksPath"], {
  cwd: repoRoot,
  encoding: "utf8",
});
const currentHooks = hooksProbe.status === 0 ? (hooksProbe.stdout ?? "").trim() : "";
if (currentHooks === ".husky") {
  console.log("[setup] git hooks already enabled (core.hooksPath=.husky)");
} else {
  run("git", ["config", "core.hooksPath", ".husky"], { cwd: repoRoot });
  console.log("[setup] git hooks enabled: core.hooksPath=.husky");
}

// 1b) 根钩子依赖（husky + lint-staged）缺失时安装一次；prepare 会同步 hooksPath。
if (!existsSync(path.join(repoRoot, "node_modules/lint-staged"))) {
  console.log("[setup] installing root hook dependencies (husky + lint-staged)...");
  if (!run("pnpm", ["--dir", repoRoot, "install"], { cwd: repoRoot, shell: true })) {
    console.warn("[setup] root hook dependencies install failed; run `pnpm install` at repo root.");
  }
}

// 2) CodeGraph 索引（工作树级，幂等）
if (existsSync(path.join(implRoot, ".codegraph"))) {
  console.log("[setup] CodeGraph index already present (adlo/.codegraph)");
} else {
  // Windows 上 `codegraph` 是 npm 的 .cmd 垫片，spawnSync 直接调用解析不到，必须经 shell。
  const probe = spawnSync("codegraph --version", { shell: true, encoding: "utf8" });
  if (probe.status !== 0) {
    console.warn(
      "[setup] codegraph CLI not found; skipped indexing. Install @colbymchenry/codegraph, then rerun.",
    );
  } else {
    console.log(
      "[setup] building CodeGraph index for this worktree (first run can take minutes)...",
    );
    const init = spawnSync("codegraph init", { cwd: implRoot, shell: true, stdio: "inherit" });
    console.log(
      init.status === 0
        ? "[setup] CodeGraph index ready"
        : "[setup] codegraph init failed; continuing without index",
    );
  }
}
