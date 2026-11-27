#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_TIMEOUT_MS = 1_800_000;

function arg(argv, name, fallback = undefined) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
}

export function parseArgs(argv) {
  const command = argv[0] ?? "help";
  if (command === "help" || command === "--help" || command === "-h") {
    return { command: "help", help: true };
  }
  if (!["start", "wait", "status", "tail"].includes(command)) {
    throw new Error(`unknown command: ${command}`);
  }
  const name = arg(argv, "--name");
  if (!name || !/^[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error("invalid --name; use letters, digits, dot, underscore or dash only");
  }
  const separator = argv.indexOf("--");
  const commandText =
    command === "start" ? (separator >= 0 ? argv.slice(separator + 1).join(" ") : "") : "";
  if (command === "start" && !commandText) {
    throw new Error("missing command; use: start --name <name> -- <command>");
  }
  const tail = Number(arg(argv, "--tail", "80"));
  const timeoutMs = Number(arg(argv, "--timeout-ms", String(DEFAULT_TIMEOUT_MS)));
  if (!Number.isInteger(tail) || tail <= 0) {
    throw new Error("--tail must be a positive integer");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive integer");
  }
  return {
    command,
    name,
    commandText,
    cwd: process.cwd(),
    root: arg(argv, "--root", process.env.ADL_LOG_ROOT),
    tail,
    timeoutMs,
    force: argv.includes("--force"),
    help: false,
  };
}

export function buildPaths(root, name) {
  const base = root ?? join(tmpdir(), "adl-logs");
  return {
    dir: base,
    logPath: join(base, `${name}.log`),
    resultPath: join(base, `${name}.json`),
    metaPath: join(base, `${name}.meta.json`),
  };
}

export function tailText(text, lines) {
  const normalized = text.replace(/\r\n/g, "\n");
  const trailingNewline = normalized.endsWith("\n") ? "\n" : "";
  const body = trailingNewline ? normalized.slice(0, -1) : normalized;
  const parts = body.split("\n");
  return `${parts.slice(-lines).join("\n")}${trailingNewline}`;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function runWorker(metaPath) {
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  const paths = buildPaths(meta.root ?? dirname(metaPath), meta.name);
  mkdirSync(paths.dir, { recursive: true });
  const fd = openSync(paths.logPath, "w");
  let result;
  try {
    result = spawnSync(meta.command, {
      cwd: meta.cwd,
      env: process.env,
      shell: true,
      stdio: ["ignore", fd, fd],
      windowsHide: true,
    });
  } finally {
    closeSync(fd);
  }
  const payload = {
    name: meta.name,
    pid: process.pid,
    startedAt: meta.startedAt,
    completedAt: new Date().toISOString(),
    exitCode: result.status ?? 1,
    signal: result.signal ?? null,
  };
  writeFileSync(paths.resultPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

export function startLogged({ name, commandText, cwd = process.cwd(), root, force = false }) {
  const paths = buildPaths(root, name);
  const existing = [paths.metaPath, paths.resultPath, paths.logPath].filter((path) =>
    existsSync(path),
  );
  if (existing.length > 0) {
    if (!force) {
      throw new Error(`log target already exists for ${name}; pass --force to archive and rerun`);
    }
    const meta = readJson(paths.metaPath);
    if (meta && !readJson(paths.resultPath) && isPidAlive(meta.workerPid)) {
      throw new Error(`logged job ${name} is still running; wait for it before --force`);
    }
    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "");
    const archiveDir = join(paths.dir, `${name}.previous-${stamp}`);
    mkdirSync(archiveDir, { recursive: true });
    for (const source of existing) {
      renameSync(source, join(archiveDir, source.split(/[\\/]/).at(-1)));
    }
  }
  mkdirSync(paths.dir, { recursive: true });
  const meta = {
    name,
    command: commandText,
    cwd,
    root: paths.dir,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(paths.metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  const child = spawn(process.execPath, [SCRIPT_PATH, "__worker", paths.metaPath], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: process.env,
  });
  child.unref();
  writeFileSync(
    paths.metaPath,
    `${JSON.stringify({ ...meta, workerPid: child.pid }, null, 2)}\n`,
    "utf8",
  );
  return { ...paths, pid: child.pid };
}

export async function waitLogged({ name, root, tail = 80, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const paths = buildPaths(root, name);
  const meta = readJson(paths.metaPath);
  if (!meta) {
    throw new Error(`no logged job metadata found for ${name}`);
  }
  const deadline = Date.now() + timeoutMs;
  let result = readJson(paths.resultPath);
  while (!result) {
    if (!isPidAlive(meta.workerPid)) {
      throw new Error(`logged job ${name} stopped without a result file`);
    }
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for ${name}; log=${paths.logPath}`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    result = readJson(paths.resultPath);
  }
  const log = existsSync(paths.logPath) ? readFileSync(paths.logPath, "utf8") : "";
  return { ...result, paths, tail: tailText(log, tail) };
}

export function statusLogged({ name, root }) {
  const paths = buildPaths(root, name);
  const meta = readJson(paths.metaPath);
  const result = readJson(paths.resultPath);
  if (!meta && !result) {
    return { name, status: "missing", paths };
  }
  return {
    name,
    status: result ? (result.exitCode === 0 ? "succeeded" : "failed") : "running",
    result,
    paths,
  };
}

export function tailLogged({ name, root, tail = 80 }) {
  const paths = buildPaths(root, name);
  if (!existsSync(paths.logPath)) {
    throw new Error(`no log found for ${name}`);
  }
  return tailText(readFileSync(paths.logPath, "utf8"), tail);
}

function printUsage() {
  console.log(
    [
      "Usage: node scripts/run-logged.mjs <start|wait|status|tail> --name <name> [options]",
      "  start [--force] -- <command>  start a detached logged command; --force archives prior evidence",
      "  wait                   wait and print the final tail",
      "  status                 print machine-readable status",
      "  tail --tail <N>        print the last N log lines",
    ].join("\n"),
  );
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === "__worker") {
    runWorker(argv[1]);
    return;
  }
  const options = parseArgs(argv);
  if (options.help) {
    printUsage();
    return;
  }
  if (options.command === "start") {
    const started = startLogged(options);
    console.log(
      `[run-logged] started ${options.name} pid=${started.pid} log=${started.logPath} result=${started.resultPath}`,
    );
    return;
  }
  if (options.command === "wait") {
    const result = await waitLogged(options);
    if (result.tail) console.log(result.tail);
    console.log(`[run-logged] ${result.name} exit=${result.exitCode} log=${result.paths.logPath}`);
    process.exitCode = result.exitCode;
    return;
  }
  if (options.command === "status") {
    console.log(JSON.stringify(statusLogged(options), null, 2));
    return;
  }
  console.log(tailLogged(options));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH);
if (isMain) {
  main().catch((error) => {
    console.error(`[run-logged] ${error.message}`);
    process.exit(1);
  });
}
