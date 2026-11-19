/**
 * Stop this worktree's dev surface (`pnpm run dev:stop`).
 *
 * Only processes whose executable path is exactly `<adlo>/target/debug/adlo(.exe)`
 * or `<adlo>/target/debug/adl-server(.exe)` are targeted, plus the launcher pid
 * recorded in `.adl-instance/dev-instance.json`. Other worktrees and an
 * installed release build are left untouched.
 */
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { devExecutables, stopDevInstances, waitForDevUnlock } from "./dev-instance.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const { app, server } = devExecutables(repoRoot);
console.log(`[dev:stop] worktree: ${repoRoot}`);
console.log(`[dev:stop] targets: ${app}, ${server}`);

stopDevInstances(repoRoot);
const stillLocked = await waitForDevUnlock(repoRoot);
if (stillLocked.length > 0) {
  console.error("[dev:stop] 仍有进程占用构建产物：");
  for (const file of stillLocked) {
    console.error(`  - ${file}`);
  }
  console.error("[dev:stop] 可能由管理员权限实例占用；请手动关闭后重试。");
  process.exit(1);
}

console.log("[dev:stop] stopped (or nothing was running)");
