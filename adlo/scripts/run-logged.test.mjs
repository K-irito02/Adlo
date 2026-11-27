import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildPaths,
  parseArgs,
  runWorker,
  startLogged,
  tailText,
  waitLogged,
} from "./run-logged.mjs";

test("parses start and wait commands", () => {
  assert.deepEqual(parseArgs(["start", "--name", "check-all", "--", "pnpm", "run", "check:all"]), {
    command: "start",
    name: "check-all",
    commandText: "pnpm run check:all",
    cwd: process.cwd(),
    root: process.env.ADL_LOG_ROOT ?? undefined,
    tail: 80,
    timeoutMs: 1_800_000,
    help: false,
  });
  assert.deepEqual(parseArgs(["tail", "--name", "check-all", "--tail", "12"]), {
    command: "tail",
    name: "check-all",
    commandText: "",
    cwd: process.cwd(),
    root: process.env.ADL_LOG_ROOT ?? undefined,
    tail: 12,
    timeoutMs: 1_800_000,
    help: false,
  });
});

test("rejects unsafe names and missing start commands", () => {
  assert.throws(
    () => parseArgs(["start", "--name", "../bad", "--", "echo", "x"]),
    /invalid --name/,
  );
  assert.throws(() => parseArgs(["start", "--name", "ok"]), /missing command/);
});

test("builds stable log and result paths", () => {
  const paths = buildPaths("C:/temp/adl-logs", "check-all");
  assert.equal(paths.logPath, join("C:/temp/adl-logs", "check-all.log"));
  assert.equal(paths.resultPath, join("C:/temp/adl-logs", "check-all.json"));
  assert.equal(paths.metaPath, join("C:/temp/adl-logs", "check-all.meta.json"));
});

test("bounds log tails by line count", () => {
  assert.equal(tailText("1\n2\n3\n4\n", 2), "3\n4\n");
  assert.equal(tailText("1\n2\n", 10), "1\n2\n");
});

test("worker records complete output and success exit code", () => {
  const dir = mkdtempSync(join(tmpdir(), "adl-logged-ok-"));
  try {
    const fixture = join(dir, "ok.mjs");
    writeFileSync(fixture, 'process.stdout.write("out\\n"); process.stderr.write("err\\n");\n');
    const metaPath = join(dir, "job.meta.json");
    writeFileSync(
      metaPath,
      JSON.stringify({ name: "ok", command: `"${process.execPath}" "${fixture}"`, cwd: dir }),
    );
    const result = runWorker(metaPath);
    assert.equal(result.exitCode, 0);
    assert.match(readFileSync(join(dir, "ok.log"), "utf8"), /out/);
    assert.match(readFileSync(join(dir, "ok.log"), "utf8"), /err/);
    assert.equal(JSON.parse(readFileSync(join(dir, "ok.json"), "utf8")).exitCode, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("worker preserves non-zero exit codes", () => {
  const dir = mkdtempSync(join(tmpdir(), "adl-logged-fail-"));
  try {
    const fixture = join(dir, "fail.mjs");
    writeFileSync(fixture, "process.exit(7);\n");
    const metaPath = join(dir, "job.meta.json");
    writeFileSync(
      metaPath,
      JSON.stringify({ name: "fail", command: `"${process.execPath}" "${fixture}"`, cwd: dir }),
    );
    const result = runWorker(metaPath);
    assert.equal(result.exitCode, 7);
    assert.equal(JSON.parse(readFileSync(join(dir, "fail.json"), "utf8")).exitCode, 7);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detached start can be awaited and returns the child exit code", async () => {
  const dir = mkdtempSync(join(tmpdir(), "adl-logged-detached-"));
  try {
    const fixture = join(dir, "job.mjs");
    writeFileSync(fixture, 'process.stdout.write("finished\\n");\n');
    const started = startLogged({
      name: "detached",
      commandText: `"${process.execPath}" "${fixture}"`,
      cwd: dir,
      root: dir,
    });
    assert.ok(started.pid > 0);
    const result = await waitLogged({ name: "detached", root: dir, timeoutMs: 10_000 });
    assert.equal(result.exitCode, 0);
    assert.match(readFileSync(join(dir, "detached.log"), "utf8"), /finished/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
