#!/usr/bin/env node
/**
 * Skill maintenance CLI: audit upstream drift, refresh from upstream, mirror
 * the three skill directories, refresh the install lock, and validate docs.
 *
 * Usage:
 *   pnpm --dir adlo run skills:audit
 *   pnpm --dir adlo run skills:apply -- --all
 *   pnpm --dir adlo run skills:restore
 *   pnpm --dir adlo run skills:mirror -- --all
 *   pnpm --dir adlo run skills:lock
 *   pnpm --dir adlo run skills:docs -- --check
 *   pnpm --dir adlo run skills:verify
 *
 * `.agents/.skill-lock.json` is the manifest: every key is a third-party skill
 * and carries its upstream repo, path and tree hash. Project-built skills are
 * the directories not present in the lock. Local adaptations live in
 * `adlo/skills-overlays/<skill>/*.overlay` and are re-applied after every copy.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const agentsRoot = path.join(repoRoot, ".agents/skills");
const lockPath = path.join(repoRoot, ".agents/.skill-lock.json");
// Keep upstream clones outside the watched workspace; a 1600-file clone inside
// `adlo/` can restart the agent/CodeGraph watcher.
const cacheRoot = process.env.ADL_SKILLS_CACHE
  ? path.resolve(process.env.ADL_SKILLS_CACHE)
  : path.join(os.tmpdir(), "adlo-skills-cache");
const overlaysRoot = path.join(repoRoot, "adlo/skills-overlays");
const skillsDocPath = path.join(repoRoot, "SKILLS.md");
const mirrors = [".opencode/skills", ".trae/skills"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(result.stderr ?? "").trim()}`);
  }
  return (result.stdout ?? "").trim();
}

function readLock() {
  return JSON.parse(fs.readFileSync(lockPath, "utf8"));
}

function writeLock(lock) {
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
}

function cacheDirFor(entry) {
  const name = entry.sourceUrl
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/[^a-z0-9_.-]+/gi, "__");
  return path.join(cacheRoot, name);
}

function ensureCache(entry) {
  const dir = cacheDirFor(entry);
  if (fs.existsSync(path.join(dir, ".git"))) {
    runGit(["-C", dir, "fetch", "--depth", "1", "origin"]);
    runGit(["-C", dir, "reset", "--hard", "FETCH_HEAD"]);
  } else {
    fs.mkdirSync(cacheRoot, { recursive: true });
    runGit(["clone", "--depth", "1", entry.sourceUrl, dir]);
  }
  return dir;
}

function listFiles(root, base = "") {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      // VCS metadata does not belong to a skill: root-level skill repos carry a
      // `.git` after cloning, and copying it would both bloat the tree and make
      // the mirror digest unstable.
      if (entry.name === ".git") {
        continue;
      }
      out.push(...listFiles(root, rel));
    } else {
      out.push(rel);
    }
  }
  return out.sort();
}

function fileDigest(fullPath) {
  const buffer = fs.readFileSync(fullPath);
  // Windows worktrees may check text out as CRLF while the canonical blob is LF.
  // Normalize line endings for text so mirror checks do not report false drift.
  if (!buffer.includes(0)) {
    const text = buffer.toString("utf8");
    if (!text.includes("\uFFFD")) {
      return crypto.createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
    }
  }
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function snapshot(root) {
  const map = new Map();
  for (const rel of listFiles(root)) {
    map.set(rel, fileDigest(path.join(root, rel)));
  }
  return map;
}

function diffSnapshots(a, b) {
  return {
    added: [...a.keys()].filter((file) => !b.has(file)),
    removed: [...b.keys()].filter((file) => !a.has(file)),
    changed: [...a.entries()].filter(([file, hash]) => b.get(file) !== hash).map(([file]) => file),
  };
}

async function copyDirBatched(src, dest, options) {
  const files = listFiles(src);
  if (!options.dryRun) {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
  }
  for (let index = 0; index < files.length; index += options.batchSize) {
    const batch = files.slice(index, index + options.batchSize);
    for (const rel of batch) {
      if (options.dryRun) {
        continue;
      }
      const target = path.join(dest, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(src, rel), target);
    }
    if (index + options.batchSize < files.length) {
      await sleep(options.pauseMs);
    }
  }
  return files.length;
}

export function parseOverlay(text) {
  const target = /^target:\s*(.+)$/m.exec(text)?.[1]?.trim();
  const note = /^note:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? "";
  const findMarker = "---FIND---\n";
  const replaceMarker = "\n---REPLACE---\n";
  const endMarker = "\n---END---";
  const findStart = text.indexOf(findMarker);
  const replaceStart = text.indexOf(replaceMarker, findStart);
  const endStart = text.indexOf(endMarker, replaceStart);
  if (!target || findStart < 0 || replaceStart < 0 || endStart < 0) {
    throw new Error("malformed overlay");
  }
  return {
    target,
    note,
    find: text.slice(findStart + findMarker.length, replaceStart),
    replace: text.slice(replaceStart + replaceMarker.length, endStart),
  };
}

function loadOverlays(skill) {
  const dir = path.join(overlaysRoot, skill);
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".overlay"))
    .sort()
    .map((name) => {
      const text = fs.readFileSync(path.join(dir, name), "utf8").replace(/\r\n/g, "\n");
      return { name, ...parseOverlay(text) };
    });
}

export function applyOverlayText(text, overlay, label = "overlay") {
  if (text.includes(overlay.replace)) return text;
  const matches = text.split(overlay.find).length - 1;
  if (matches !== 1) {
    throw new Error(`${label}: anchor matched ${matches} times`);
  }
  return text.replace(overlay.find, overlay.replace);
}

function applyOverlay(skill, overlay, options) {
  const file = path.join(agentsRoot, skill, overlay.target);
  const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const next = applyOverlayText(
    text,
    overlay,
    `${skill}/${overlay.target}: overlay ${overlay.name}`,
  );
  if (!options.dryRun && next !== text) {
    fs.writeFileSync(file, next, "utf8");
  }
  return options.dryRun && next !== text ? "would-apply" : "applied";
}

function allSkillDirs() {
  return fs
    .readdirSync(agentsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function thirdPartyNames(lock) {
  // Historical lock entries for uninstalled skills are not part of the
  // installed set; only touch skills that actually exist under `.agents`.
  return Object.keys(lock.skills ?? {})
    .filter((name) => fs.existsSync(path.join(agentsRoot, name, "SKILL.md")))
    .sort();
}

function selectSkills(options, available) {
  if (options.all) {
    return available;
  }
  if (options.skills.length === 0) {
    throw new Error("pass --all or --skill <name>");
  }
  for (const name of options.skills) {
    if (!available.includes(name)) {
      throw new Error(`unknown skill: ${name}`);
    }
  }
  return options.skills;
}

function readFrontmatter(skill) {
  const text = fs.readFileSync(path.join(agentsRoot, skill, "SKILL.md"), "utf8");
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  const name =
    /^name:\s*(.+)$/m
      .exec(block)?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, "") ?? skill;
  const description =
    /^description:\s*(.+)$/m
      .exec(block)?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, "") ?? "";
  return { name, description };
}

async function auditCommand(options) {
  const lock = readLock();
  const names = selectSkills(options, thirdPartyNames(lock));
  for (const name of names) {
    const entry = lock.skills[name];
    if (!entry) {
      console.log(`MISSING-LOCK ${name}`);
      continue;
    }
    const cache = ensureCache(entry);
    const source = path.join(cache, entry.skillPath);
    const local = path.join(agentsRoot, name);
    if (!fs.existsSync(source)) {
      console.log(`NO-UPSTREAM ${name} ${entry.skillPath}`);
      continue;
    }
    if (!fs.existsSync(local)) {
      console.log(`MISSING-LOCAL ${name}`);
      continue;
    }
    const diff = diffSnapshots(snapshot(source), snapshot(local));
    const overlays = loadOverlays(name).map((overlay) => {
      const file = path.join(local, overlay.target);
      const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n") : "";
      return text.includes(overlay.replace) ? "applied" : "missing";
    });
    const status =
      diff.added.length + diff.removed.length + diff.changed.length === 0 ? "IDENTICAL" : "DIFFERS";
    console.log(
      `${status.padEnd(9)} ${name.padEnd(34)} +${diff.added.length} -${diff.removed.length} ` +
        `~${diff.changed.length}${overlays.length ? ` overlays:${overlays.join(",")}` : ""}`,
    );
  }
}

async function applyCommand(options) {
  const lock = readLock();
  const names = selectSkills(options, thirdPartyNames(lock));
  for (const name of names) {
    const entry = lock.skills[name];
    if (!entry) {
      throw new Error(`missing lock entry: ${name}`);
    }
    const cache = ensureCache(entry);
    const source = path.join(cache, entry.skillPath);
    if (!fs.existsSync(source)) {
      throw new Error(`upstream path missing for ${name}: ${entry.skillPath}`);
    }
    const count = await copyDirBatched(source, path.join(agentsRoot, name), options);
    console.log(`${options.dryRun ? "DRY" : "APPLIED"} ${name} (${count} files)`);
    for (const overlay of loadOverlays(name)) {
      console.log(`  overlay ${overlay.name}: ${applyOverlay(name, overlay, options)}`);
    }
  }
  if (options.dryRun) {
    return;
  }
  if (!options.skipMirror) {
    await mirrorCommand({ ...options, all: false, skills: names });
  }
  if (!options.skipLock) {
    lockCommand({ ...options, all: false, skills: names });
  }
  if (!options.skipDocs) {
    docsCommand({ ...options, check: false });
  }
  if (!options.skipVerify) {
    verifyCommand();
  }
}

/**
 * Restore third-party skills that are absent from this checkout.
 *
 * `.gitignore` keeps third-party skills out of the remote (only project-built
 * skills are committed), so a fresh clone or a new worktree has them missing on
 * disk. The lock file is the recipe: clone each source repo once into the cache
 * and copy the declared path back into `.agents/skills/`.
 */
async function restoreCommand(options) {
  const lock = readLock();
  // The lock keeps a historical record of every skill ever installed; only the
  // ones listed in SKILLS.md §4 belong to this checkout's expected inventory.
  const documented = new Set(
    [...fs.readFileSync(skillsDocPath, "utf8").matchAll(/^\| `([^`]+)` \| `[^`]+` \|/gm)].map(
      (match) => match[1],
    ),
  );
  const missing = Object.keys(lock.skills ?? {})
    .filter((name) => documented.has(name))
    .filter((name) => !fs.existsSync(path.join(agentsRoot, name, "SKILL.md")))
    .sort();

  if (missing.length === 0) {
    console.log("[skills:restore] all locked skills already present");
    return;
  }

  console.log(`[skills:restore] ${missing.length} skill(s) missing, restoring from upstream...`);
  const restored = [];
  for (const name of missing) {
    const entry = lock.skills[name];
    try {
      const cache = ensureCache(entry);
      const source = path.join(cache, entry.skillPath);
      if (!fs.existsSync(source)) {
        console.log(`SKIP ${name}: upstream path missing (${entry.skillPath})`);
        continue;
      }
      const count = await copyDirBatched(source, path.join(agentsRoot, name), options);
      console.log(`RESTORED ${name} (${count} files)`);
      if (!options.dryRun) {
        restored.push(name);
      }
    } catch (error) {
      // A repo that cannot be reached should not abort the whole restore.
      console.log(`FAILED ${name}: ${error.message}`);
    }
  }

  if (options.dryRun || restored.length === 0) {
    return;
  }
  await mirrorCommand({ ...options, all: false, skills: restored });
  if (!options.skipDocs) {
    docsCommand({ ...options, check: false });
  }
  if (!options.skipVerify) {
    verifyCommand();
  }
}

async function mirrorCommand(options) {
  const available = allSkillDirs();
  const names = options.all ? available : selectSkills(options, available);
  if (options.prune && !options.all) {
    throw new Error("--prune needs --all (a filtered mirror must not delete other skills)");
  }
  let failed = false;
  for (const mirror of mirrors) {
    const mirrorRoot = path.join(repoRoot, mirror);
    for (const name of names) {
      const source = path.join(agentsRoot, name);
      const dest = path.join(mirrorRoot, name);
      if (options.check) {
        if (!fs.existsSync(dest)) {
          console.log(`MISSING ${mirror}/${name}`);
          failed = true;
          continue;
        }
        const diff = diffSnapshots(snapshot(source), snapshot(dest));
        if (diff.added.length + diff.removed.length + diff.changed.length > 0) {
          console.log(
            `DIFFERS ${mirror}/${name} +${diff.added.length} -${diff.removed.length} ~${diff.changed.length}`,
          );
          failed = true;
        }
      } else {
        const count = await copyDirBatched(source, dest, options);
        console.log(`${options.dryRun ? "DRY" : "MIRROR"} ${mirror}/${name} (${count} files)`);
      }
    }
    if (options.prune && !options.check) {
      const existing = fs
        .readdirSync(mirrorRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
      for (const name of existing) {
        if (!available.includes(name)) {
          fs.rmSync(path.join(mirrorRoot, name), { recursive: true, force: true });
          console.log(`PRUNE ${mirror}/${name}`);
        }
      }
    }
  }
  if (options.check) {
    if (failed) {
      process.exitCode = 1;
    } else {
      console.log("[skills:mirror] ok");
    }
  }
}

function lockCommand(options) {
  const lock = readLock();
  const names = options.skills.length > 0 ? options.skills : thirdPartyNames(lock);
  let drift = 0;
  for (const name of names) {
    const entry = lock.skills[name];
    if (!entry) {
      console.log(`MISSING-LOCK ${name}`);
      continue;
    }
    const cache = ensureCache(entry);
    const hash = runGit(["-C", cache, "rev-parse", `HEAD:${entry.skillPath}`]);
    if (entry.skillFolderHash !== hash) {
      drift += 1;
      if (!options.check) {
        entry.skillFolderHash = hash;
        entry.updatedAt = new Date().toISOString();
      }
      console.log(`${options.check ? "DRIFT" : "UPDATED"} ${name}`);
    } else {
      console.log(`OK ${name}`);
    }
  }
  if (!options.check && drift > 0) {
    writeLock(lock);
  }
  if (options.check && drift > 0) {
    process.exitCode = 1;
  }
}

function docsCommand(options) {
  const lock = readLock();
  const lockNames = new Set(Object.keys(lock.skills ?? {}));
  const all = allSkillDirs();
  const groups = { superpowers: [], matt: [], community: [], project: [] };
  const meta = new Map();
  for (const skill of all) {
    meta.set(skill, readFrontmatter(skill));
    const entry = lock.skills[skill];
    if (!entry) {
      groups.project.push(skill);
    } else if (entry.source === "obra/superpowers") {
      groups.superpowers.push(skill);
    } else if (entry.source === "mattpocock/skills") {
      groups.matt.push(skill);
    } else {
      groups.community.push(skill);
    }
  }

  let doc = fs.readFileSync(skillsDocPath, "utf8");
  const counts = {
    superpowers: groups.superpowers.length,
    matt: groups.matt.length,
    community: groups.community.length,
    project: groups.project.length,
  };
  const total = all.length;

  const setCount = (label, count) => {
    const pattern = new RegExp(`^(\\| ${label} \\|[^\\n]*\\| )\\d+( \\|)$`, "m");
    if (!pattern.test(doc)) {
      throw new Error(`SKILLS.md count row not found: ${label}`);
    }
    doc = doc.replace(pattern, `$1${count}$2`);
  };
  setCount("Superpowers 体系技能", counts.superpowers);
  setCount("Matt Pocock 工程技能", counts.matt);
  setCount("其他社区技能", counts.community);
  setCount("项目自建技能", counts.project);
  doc = doc.replace(/^(\| \*\*合计\*\* \|[^\n]*\| \*\*)\d+(\*\* \|)$/m, `$1${total}$2`);

  const section = (header, skills) => {
    const start = doc.indexOf(header);
    if (start < 0) {
      throw new Error(`SKILLS.md section not found: ${header}`);
    }
    const next = doc.indexOf("\n### 4.", start + header.length);
    const end = next < 0 ? doc.length : next;
    let text = doc.slice(start, end);
    const rows = [...text.matchAll(/^\| `([^`]+)` \| `([^`]+)` \| (.*) \|$/gm)];
    const rowMap = new Map(rows.map((row) => [row[1], { call: row[2], full: row[0] }]));
    for (const [skill, row] of rowMap) {
      const info = meta.get(skill);
      if (info && row.call !== info.name) {
        text = text.replace(row.full, row.full.replace(`\`${row.call}\``, `\`${info.name}\``));
      }
    }
    const missing = skills.filter((skill) => !rowMap.has(skill));
    if (missing.length > 0) {
      const lines = missing.map((skill) => {
        const info = meta.get(skill);
        return `| \`${skill}\` | \`${info.name}\` | ${info.description} |`;
      });
      const lastRow = rows.at(-1);
      if (lastRow) {
        const insertAt = text.indexOf(lastRow[0]) + lastRow[0].length;
        text = `${text.slice(0, insertAt)}\n${lines.join("\n")}${text.slice(insertAt)}`;
      } else {
        const separator = /^\|[-| ]+\|$/m.exec(text);
        const insertAt = separator
          ? text.indexOf(separator[0]) + separator[0].length
          : start + header.length;
        text = `${text.slice(0, insertAt)}\n${lines.join("\n")}${text.slice(insertAt)}`;
      }
    }
    if (options.prune) {
      for (const [skill, row] of rowMap) {
        if (!skills.includes(skill)) {
          text = text.replace(`${row.full}\n`, "").replace(row.full, "");
        }
      }
    }
    doc = `${doc.slice(0, start)}${text}${doc.slice(end)}`;
  };

  const setHeader = (header, count) => {
    const pattern = new RegExp(`^${header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}（\\d+）$`, "m");
    if (!pattern.test(doc)) {
      throw new Error(`SKILLS.md section header not found: ${header}`);
    }
    doc = doc.replace(pattern, `${header}（${count}）`);
  };
  setHeader("### 4.1 Superpowers 体系技能", counts.superpowers);
  setHeader("### 4.2 其他社区技能", counts.community);
  setHeader("### 4.3 项目自建技能", counts.project);
  setHeader("### 4.4 Matt Pocock 技能", counts.matt);
  section("### 4.1 Superpowers 体系技能", groups.superpowers);
  section("### 4.2 其他社区技能", groups.community);
  section("### 4.3 项目自建技能", groups.project);
  section("### 4.4 Matt Pocock 技能", groups.matt);

  const current = fs.readFileSync(skillsDocPath, "utf8");
  if (doc === current) {
    console.log("[skills:docs] up to date");
    return;
  }
  if (options.check) {
    console.error("[skills:docs] SKILLS.md is stale; run `pnpm --dir adlo run skills:docs`");
    process.exitCode = 1;
    return;
  }
  fs.writeFileSync(skillsDocPath, doc, "utf8");
  console.log(`[skills:docs] updated ${skillsDocPath}`);
}

function verifyCommand() {
  const result = spawnSync(process.execPath, ["--test", "adlo/scripts/check-agent-dirs.test.mjs"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error("check-agent-dirs failed");
  }
  runGit(["diff", "--check"]);
  console.log("[skills:verify] ok");
}

function parseArgs(argv) {
  const options = {
    command: argv[0] ?? "help",
    skills: [],
    all: false,
    batchSize: 100,
    pauseMs: 10,
    dryRun: false,
    check: false,
    prune: false,
    skipMirror: false,
    skipLock: false,
    skipDocs: false,
    skipVerify: false,
    help: false,
  };
  if (options.command === "--help" || options.command === "-h") {
    options.help = true;
  }
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--all") {
      options.all = true;
    } else if (arg === "--skill") {
      const value = argv[++index];
      if (!value) throw new Error("--skill needs a value");
      options.skills.push(
        ...value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      );
    } else if (arg === "--batch-size") {
      options.batchSize = Math.max(1, Number(argv[++index] ?? 100));
    } else if (arg === "--pause-ms") {
      options.pauseMs = Math.max(0, Number(argv[++index] ?? 10));
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--check") {
      options.check = true;
    } else if (arg === "--prune") {
      options.prune = true;
    } else if (arg === "--skip-mirror") {
      options.skipMirror = true;
    } else if (arg === "--skip-lock") {
      options.skipLock = true;
    } else if (arg === "--skip-docs") {
      options.skipDocs = true;
    } else if (arg === "--skip-verify") {
      options.skipVerify = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  return options;
}

function printUsage() {
  console.log(
    [
      "Usage: pnpm --dir adlo run skills:<command> -- [options]",
      "",
      "Commands:",
      "  audit    compare .agents/skills with upstream clones",
      "  apply    refresh already-installed skills from upstream (missing ones: use `restore`), then overlays/mirror/lock/docs/verify",
      "  restore  reinstall locked third-party skills missing from this checkout, then mirror/docs/verify",
      "  mirror   sync .agents/skills to .opencode/skills and .trae/skills",
      "  lock     refresh .agents/.skill-lock.json hashes from upstream",
      "  docs     refresh SKILLS.md counts, call names and missing rows",
      "  verify   run check-agent-dirs and git diff --check",
      "",
      "Options:",
      "  --all                 select every skill",
      "  --skill <name>        repeatable / comma-separated",
      "  --batch-size <n>      copy batch size (default 100)",
      "  --pause-ms <n>        pause between batches (default 10)",
      "  --check               report drift instead of writing (mirror/lock/docs)",
      "  --prune               remove mirror/SKILLS.md rows absent from .agents",
      "  --dry-run             print actions without writing",
      "  --skip-mirror/lock/docs/verify  apply only part of the pipeline",
    ].join("\n"),
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || options.command === "help") {
    printUsage();
    return;
  }
  if (options.command === "audit") {
    await auditCommand(options);
  } else if (options.command === "apply") {
    await applyCommand(options);
  } else if (options.command === "restore") {
    await restoreCommand(options);
  } else if (options.command === "mirror") {
    await mirrorCommand(options);
  } else if (options.command === "lock") {
    lockCommand(options);
  } else if (options.command === "docs") {
    docsCommand(options);
  } else if (options.command === "verify") {
    verifyCommand();
  } else {
    throw new Error(`unknown command: ${options.command}`);
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main().catch((error) => {
    console.error(`[skills-sync] ${error.message}`);
    process.exit(1);
  });
}
