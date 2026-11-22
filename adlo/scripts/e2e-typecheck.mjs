/**
 * e2e 类型检查包装（`check:repo` 的一步）。
 *
 * 为什么需要：`tsc --noEmit` 在本机 Windows 上偶发**进程级崩溃**
 * （退出码 3221226505 = `0xC0000409` STATUS_STACK_BUFFER_OVERRUN，stdout/stderr 全空），
 * 同一命令独立重跑即通过。
 * 直接跑会给 pre-push / `check:repo` 制造假红。
 *
 * 重试口径：仅「非零退出**且完全没有输出**」时重试一次。真实的类型错误一定带诊断输出，
 * 原样失败，不会被掩盖；重试后仍失败才判定失败。
 *
 * 用法：`node scripts/e2e-typecheck.mjs`（`adlo/package.json#check:repo` 调用）。
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const e2eDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "e2e");
const tscBin = path.join(e2eDir, "node_modules", "typescript", "bin", "tsc");

/** 无输出的非零退出 ≈ 进程崩溃；有输出则视为真实类型错误。 */
export function isCrashWithoutOutput(status, output) {
  return status !== 0 && output.trim() === "";
}

function runTsc() {
  const result = spawnSync(process.execPath, [tscBin, "--noEmit"], {
    cwd: e2eDir,
    encoding: "utf8",
    env: process.env,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const status = typeof result.status === "number" ? result.status : 1;
  return { status, output };
}

function main() {
  const first = runTsc();
  if (first.status === 0) {
    return 0;
  }
  if (!isCrashWithoutOutput(first.status, first.output)) {
    process.stdout.write(first.output);
    return first.status;
  }
  console.error(
    `[e2e:typecheck] tsc exited ${first.status} with no output (process crash); retrying once`,
  );
  const second = runTsc();
  if (second.output) {
    process.stdout.write(second.output);
  }
  if (second.status !== 0) {
    console.error(`[e2e:typecheck] retry also failed (exit ${second.status})`);
  }
  return second.status;
}

const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isMain) {
  process.exit(main());
}
