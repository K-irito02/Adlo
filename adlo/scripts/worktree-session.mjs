/**
 * Claim / close / inspect session-registry entries for the current worktree.
 *
 * Usage:
 *   pnpm --dir adlo run worktree:session -- list
 *   pnpm --dir adlo run worktree:session -- claim skills-refresh-2026-11-22 --scope "adlo/scripts/**"
 *   pnpm --dir adlo run worktree:session -- close skills-refresh-2026-11-22 --status merged --merge-commit <sha>
 *   pnpm --dir adlo run worktree:session -- check
 *
 * The registry lives outside the repo at `<root>-worktrees/.sessions/*.json`.
 * `check` is the pre-commit guard: active entries must name the current branch.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { formatAge, readActiveSessions, sessionsDirFor } from "./worktree-registry.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function git(args, cwd = repoRoot) {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return result.status === 0 ? (result.stdout ?? "").trim() : "";
}

function currentWorktree() {
  const toplevel = git(["rev-parse", "--show-toplevel"]);
  if (!toplevel) {
    throw new Error("not inside a git worktree");
  }
  return {
    toplevel,
    branch: git(["branch", "--show-current"]) || "—",
    slot: path.basename(toplevel),
  };
}

function writeEntry(dir, record) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${record.session}.json`);
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return file;
}

function readEntry(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function parseArgs(argv) {
  const options = {
    command: argv[0] ?? "list",
    name: null,
    scopes: [],
    contracts: [],
    note: null,
    force: false,
    status: "done",
    mergedInto: "main",
    mergeCommit: null,
    help: false,
  };
  const positional = [];
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--scope") {
      options.scopes.push(argv[++index] ?? "");
    } else if (arg === "--contract") {
      options.contracts.push(argv[++index] ?? "");
    } else if (arg === "--note") {
      options.note = argv[++index] ?? "";
    } else if (arg === "--status") {
      options.status = argv[++index] ?? "done";
    } else if (arg === "--merged-into") {
      options.mergedInto = argv[++index] ?? "main";
    } else if (arg === "--merge-commit") {
      options.mergeCommit = argv[++index] ?? null;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  options.name = positional[0] ?? null;
  return options;
}

function printUsage() {
  console.log(
    [
      "Usage: pnpm --dir adlo run worktree:session -- <command> [options]",
      "",
      "  list                         list registry entries",
      "  claim <name>                 claim this worktree for <name>",
      "    --scope <glob>             repeatable; recorded in the entry",
      "    --contract <glob>          repeatable; recorded in the entry",
      "    --note <text>              session note",
      "    --force                    take over another active session",
      "  close <name>                 close this session",
      "    --status done|merged       default done",
      "    --merged-into <branch>     default main",
      "    --merge-commit <sha>       optional",
      "    --note <text>              closure note",
      "  check                        fail if an active entry names another branch",
    ].join("\n"),
  );
}

function claim(options) {
  if (!options.name) {
    throw new Error("claim needs a session name");
  }
  const { toplevel, branch, slot } = currentWorktree();
  const active = readActiveSessions(toplevel);
  const conflict = active.find((entry) => entry.record.session !== options.name);
  if (conflict && !options.force) {
    throw new Error(
      `worktree ${toplevel} is already claimed by ${conflict.record.session}; ` +
        "close it or pass --force after user approval",
    );
  }

  const dir = sessionsDirFor(toplevel);
  const file = path.join(dir, `${options.name}.json`);
  const existing = fs.existsSync(file) ? readEntry(file) : null;
  const history = Array.isArray(existing?.history) ? [...existing.history] : [];
  if (!history.includes(branch)) {
    history.push(branch);
  }
  const now = new Date().toISOString();
  const record = {
    session: options.name,
    mode: /-worktrees$/i.test(path.basename(path.dirname(toplevel)))
      ? "existing-worktree"
      : "main-worktree",
    slot,
    worktree: toplevel,
    branch,
    history,
    owner: process.env.OPENCODE_SESSION_ID ?? `agent-session-${now}`,
    scope: options.scopes.length > 0 ? options.scopes : (existing?.scope ?? []),
    contractFiles:
      options.contracts.length > 0 ? options.contracts : (existing?.contractFiles ?? []),
    startedAt: existing?.startedAt ?? now,
    status: "active",
    notes: options.note ?? existing?.notes ?? "",
  };
  const written = writeEntry(dir, record);
  console.log(`[worktree:session] claimed ${options.name} on ${branch} -> ${written}`);
}

function close(options) {
  if (!options.name) {
    throw new Error("close needs a session name");
  }
  if (!["done", "merged"].includes(options.status)) {
    throw new Error(`invalid --status: ${options.status} (expected done or merged)`);
  }
  const { toplevel } = currentWorktree();
  const dir = sessionsDirFor(toplevel);
  const file = path.join(dir, `${options.name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`session not found: ${file}`);
  }
  const record = readEntry(file);
  const now = new Date().toISOString();
  record.status = options.status;
  record.endedAt = now;
  if (options.note) {
    record.closure = options.note;
  }
  if (options.status === "merged") {
    record.mergedAt = now;
    record.mergedInto = options.mergedInto;
    if (options.mergeCommit) {
      record.mergeCommit = options.mergeCommit;
    }
  }
  const written = writeEntry(dir, record);
  console.log(`[worktree:session] closed ${options.name} as ${options.status} -> ${written}`);
}

function check() {
  const { toplevel, branch } = currentWorktree();
  const active = readActiveSessions(toplevel);
  if (active.length === 0) {
    console.log("[worktree:session] no active session for this worktree");
    return;
  }
  let failed = false;
  for (const entry of active) {
    const record = entry.record;
    if (record.branch && record.branch !== branch) {
      console.error(
        `[worktree:session] ${record.session} is active on branch ${record.branch}, ` +
          `but this worktree is on ${branch}`,
      );
      failed = true;
    } else {
      console.log(`[worktree:session] active: ${record.session} (${record.branch ?? "—"})`);
    }
  }
  if (failed) {
    process.exitCode = 1;
  }
}

function list() {
  const { toplevel } = currentWorktree();
  const dir = sessionsDirFor(toplevel);
  let names;
  try {
    names = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch {
    console.log(`[worktree:session] no registry at ${dir}`);
    return;
  }
  console.log(`[worktree:session] ${dir}`);
  for (const name of names) {
    const file = path.join(dir, name);
    try {
      const record = readEntry(file);
      const age = formatAge(Math.max(0, Date.now() - fs.statSync(file).mtimeMs));
      console.log(
        `  ${String(record.status ?? "unknown").padEnd(7)} ${String(record.slot ?? "—").padEnd(8)} ` +
          `${age.padStart(6)}  ${record.session ?? name}`,
      );
    } catch {
      console.log(`  INVALID  ${name}`);
    }
  }
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[worktree:session] ${error.message}`);
    printUsage();
    process.exit(2);
  }
  if (options.help) {
    printUsage();
    return;
  }
  try {
    if (options.command === "list") {
      list();
    } else if (options.command === "claim") {
      claim(options);
    } else if (options.command === "close") {
      close(options);
    } else if (options.command === "check") {
      check();
    } else {
      throw new Error(`unknown command: ${options.command}`);
    }
  } catch (error) {
    console.error(`[worktree:session] ${error.message}`);
    process.exit(1);
  }
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  main();
}
