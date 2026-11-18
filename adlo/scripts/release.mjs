#!/usr/bin/env node
/**
 * 本地发布流水线（CI 稳定前的唯一入口）。
 *
 *   node scripts/release.mjs bump 0.1.1
 *   node scripts/release.mjs build
 *   node scripts/release.mjs publish --tag v0.1.1 [--notes-file path] [--prerelease]
 *   node scripts/release.mjs verify  --tag v0.1.1
 *
 * 设计约束（ADR-0026 / ADR-0027）：
 * - 只发 NSIS 安装包，按当前用户安装；
 * - GitHub 与 Gitee 各一份清单，下载地址指向各自站点；
 * - Gitee 清单写仓库文件 `release/latest.json`（raw 直链），GitHub 清单作为 Release 资产；
 * - 令牌/私钥密码只从环境或注册表读取，绝不打印、绝不落盘。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildManifest,
  defaultTestNotes,
  downloadUrl,
  isVersion,
  RELEASE,
  setupFileName,
  sha256Line,
} from "./release/manifest.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ADLO_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(ADLO_ROOT, "..");
const TAURI_CONF = join(ADLO_ROOT, "src-tauri", "tauri.conf.json");
const BUNDLE_DIR = join(ADLO_ROOT, "target", "release", "bundle", "nsis");
const STAGING_ROOT = join(REPO_ROOT, ".release");

const GITEE_API = "https://gitee.com/api/v5";

function log(message) {
  process.stdout.write(`[release] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[release] ${message}\n`);
  process.exit(1);
}

function arg(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function flag(name) {
  return process.argv.includes(name);
}

function readVersion() {
  const conf = JSON.parse(readFileSync(TAURI_CONF, "utf8"));
  if (!isVersion(conf.version)) {
    fail(`tauri.conf.json has an invalid version: ${conf.version}`);
  }
  return conf.version;
}

function run(command, args, options = {}) {
  // 不用 shell:true —— 它把带空格/换行的参数原样拼进命令行：`--notes` 的多行正文
  // 会被拆成几十个参数（Node 也会打 DEP0190 警告），gh 收到的 tag 就变成残缺值。
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: options.cwd ?? ADLO_ROOT,
    env: process.env,
  });
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Gitee 令牌：优先环境变量，其次当前用户的注册表值（`setx` 之后老进程看不到）。 */
function resolveGiteeToken() {
  if (process.env.GITEE_TOKEN) {
    return process.env.GITEE_TOKEN;
  }
  const probe = spawnSync(
    "powershell",
    ["-NoProfile", "-Command", "[Environment]::GetEnvironmentVariable('GITEE_TOKEN','User')"],
    { encoding: "utf8" },
  );
  const token = (probe.stdout ?? "").trim();
  return token || null;
}

function replaceVersion(file, pattern, version, kind) {
  const before = readFileSync(file, "utf8");
  // 回调签名是 (match, p1, p2, p3, …)：p2 是旧版本号，p3 才是收尾引号。
  // 曾把 p2 当收尾引号用，把 "0.1.0" 拼成 `"0.1.1` + `0.1.0`（引号被吃掉）。
  const after = before.replace(
    pattern,
    (_match, prefix, _old, suffix) => `${prefix}${version}${suffix}`,
  );
  if (after === before) {
    if (before.includes(version)) {
      return;
    }
    fail(`could not update version in ${file}`);
  }
  if (kind === "json") {
    try {
      JSON.parse(after);
    } catch (error) {
      fail(`version bump would corrupt ${file}: ${error.message}`);
    }
  }
  writeFileSync(file, after);
}

function bump(version) {
  if (!isVersion(version)) {
    fail(`invalid version: ${version}`);
  }
  replaceVersion(join(ADLO_ROOT, "Cargo.toml"), /(version = ")([^"]+)(")/, version, "toml");
  replaceVersion(TAURI_CONF, /("version":\s*")([^"]+)(")/, version, "json");
  replaceVersion(join(ADLO_ROOT, "package.json"), /("version":\s*")([^"]+)(")/, version, "json");
  replaceVersion(
    join(ADLO_ROOT, "frontend", "package.json"),
    /("version":\s*")([^"]+)(")/,
    version,
    "json",
  );
  log(`version bumped to ${version} in Cargo workspace / tauri.conf / 2 x package.json`);
}

/** 签名密码：环境变量优先，其次当前用户注册表（`setx` 之后老进程看不到）。 */
function resolveSigningPassword() {
  if (process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
    return process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD;
  }
  const probe = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "[Environment]::GetEnvironmentVariable('TAURI_SIGNING_PRIVATE_KEY_PASSWORD','User')",
    ],
    { encoding: "utf8" },
  );
  // 只去掉行尾换行：密码本身可能含空格，不能用 trim。
  return (probe.stdout ?? "").replace(/\r?\n$/, "") || null;
}

function build() {
  const keyPath =
    process.env.TAURI_SIGNING_PRIVATE_KEY_PATH ??
    join(process.env.USERPROFILE ?? "", ".tauri", "adlo.key");
  if (!existsSync(keyPath)) {
    fail(`signing key not found at ${keyPath} (expected the minisign private key)`);
  }
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
    process.env.TAURI_SIGNING_PRIVATE_KEY = keyPath;
  }
  const password = resolveSigningPassword();
  if (!password) {
    fail(
      "TAURI_SIGNING_PRIVATE_KEY_PASSWORD is not set. Run once:\n" +
        '  setx TAURI_SIGNING_PRIVATE_KEY_PASSWORD "your password"\n' +
        "then re-run this command (no shell restart needed).",
    );
  }
  process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = password;
  log("building NSIS bundle with updater signature…");
  run("cargo", ["tauri", "build", "--bundles", "nsis"]);
}

function stagedArtifacts(version) {
  const fileName = setupFileName(version);
  const setupPath = join(BUNDLE_DIR, fileName);
  const sigPath = `${setupPath}.sig`;
  if (!existsSync(setupPath)) {
    fail(`installer not found: ${setupPath} (run \`node scripts/release.mjs build\` first)`);
  }
  if (!existsSync(sigPath)) {
    fail(`signature not found: ${sigPath} (createUpdaterArtifacts must be enabled)`);
  }
  return { fileName, setupPath, sigPath };
}

function prepareStaging(version, notes, host) {
  const { fileName, setupPath, sigPath } = stagedArtifacts(version);
  const signature = readFileSync(sigPath, "utf8").trim();
  const manifest = buildManifest({
    version,
    notes,
    url: downloadUrl(host, version, fileName),
    signature,
  });
  const dir = join(STAGING_ROOT, `v${version}`, host);
  mkdirSync(dir, { recursive: true });
  // 文件名必须是 latest.json：GitHub 的稳定地址是 releases/latest/download/latest.json，
  // 资产名一旦变成 latest.github.json，这个地址就永远 404（首轮发布踩过）。
  const manifestPath = join(dir, "latest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const sumsPath = join(dir, "SHA256SUMS.txt");
  const sums = [sha256Line(fileName, sha256File(setupPath))];
  writeFileSync(sumsPath, `${sums.join("\n")}\n`);
  return { fileName, setupPath, sigPath, manifest, manifestPath, sumsPath };
}

function gh(args) {
  run("gh", args, { cwd: REPO_ROOT });
}

async function publish({ tag, notesFile, prerelease }) {
  const version = readVersion();
  if (tag !== `v${version}`) {
    fail(`tag ${tag} does not match tauri.conf version ${version}`);
  }
  stagedArtifacts(version);

  const notes = notesFile
    ? readFileSync(resolve(REPO_ROOT, notesFile), "utf8")
    : defaultTestNotes(version);
  const stagingDir = join(STAGING_ROOT, `v${version}`);
  mkdirSync(stagingDir, { recursive: true });
  const notesPath = join(stagingDir, "notes.md");
  writeFileSync(notesPath, notes);
  const ghAssets = prepareStaging(version, notes, "github");
  const giteeAssets = prepareStaging(version, notes, "gitee");

  log("publishing GitHub release…");
  const ghArgs = [
    "release",
    "create",
    tag,
    "--repo",
    `${RELEASE.github.owner}/${RELEASE.github.repo}`,
    "--title",
    tag,
    "--notes-file",
    notesPath,
    ghAssets.setupPath,
    ghAssets.sigPath,
    ghAssets.manifestPath,
    ghAssets.sumsPath,
  ];
  if (prerelease) {
    // 注意：不要给「最新版」打 prerelease 标记 —— GitHub 的 releases/latest 会跳过
    // 预发布，`releases/latest/download/latest.json` 就永远取不到清单。
    ghArgs.push("--prerelease");
  }
  gh(ghArgs);

  const token = resolveGiteeToken();
  if (!token) {
    fail("GITEE_TOKEN is missing (env var or HKCU user env var); GitHub side already published");
  }

  log("publishing Gitee release…");
  const createResponse = await fetch(
    `${GITEE_API}/repos/${RELEASE.gitee.owner}/${RELEASE.gitee.repo}/releases`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: token,
        tag_name: tag,
        name: tag,
        body: notes,
        target_commitish: "main",
        prerelease,
      }),
    },
  );
  if (!createResponse.ok) {
    fail(`gitee release create failed: ${createResponse.status} ${await createResponse.text()}`);
  }
  const release = await createResponse.json();

  for (const file of [ghAssets.setupPath, ghAssets.sigPath, giteeAssets.sumsPath]) {
    const form = new FormData();
    form.set("access_token", token);
    form.set("file", new Blob([readFileSync(file)]), file.split(/[\\/]/).pop());
    const upload = await fetch(
      `${GITEE_API}/repos/${RELEASE.gitee.owner}/${RELEASE.gitee.repo}/releases/${release.id}/attach_files`,
      { method: "POST", body: form },
    );
    if (!upload.ok) {
      fail(`gitee attach failed for ${file}: ${upload.status} ${await upload.text()}`);
    }
  }

  log(`updating Gitee manifest ${RELEASE.manifestPath}…`);
  await putGiteeFile(
    token,
    RELEASE.manifestPath,
    giteeAssets.manifestPath,
    `chore(release): ${tag} manifest`,
  );
  log(`published ${tag} (GitHub + Gitee), staging at ${STAGING_ROOT}`);
}

async function putGiteeFile(token, path, localPath, message) {
  const base = `${GITEE_API}/repos/${RELEASE.gitee.owner}/${RELEASE.gitee.repo}/contents/${path}`;
  const encoded = Buffer.from(readFileSync(localPath)).toString("base64");
  const existing = await fetch(`${base}?access_token=${encodeURIComponent(token)}`);
  const sha = existing.ok ? (await existing.json()).sha : undefined;
  const response = await fetch(base, {
    method: sha ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: token, content: encoded, message, sha }),
  });
  if (!response.ok) {
    fail(`gitee manifest update failed: ${response.status} ${await response.text()}`);
  }
}

async function verify(tag) {
  const version = readVersion();
  if (tag && tag !== `v${version}`) {
    fail(`tag ${tag} does not match tauri.conf version ${version}`);
  }
  const sources = [
    `https://gitee.com/${RELEASE.gitee.owner}/${RELEASE.gitee.repo}/raw/main/${RELEASE.manifestPath}`,
    `https://github.com/${RELEASE.github.owner}/${RELEASE.github.repo}/releases/latest/download/latest.json`,
  ];
  let failures = 0;
  for (const source of sources) {
    try {
      // GitHub 的 releases/latest/download 会缓存「发布前」的 404，通常几分钟后才恢复；
      // 刚发完就校验很容易被这个缓存误判成发布失败，所以每个源都重试几轮。
      const response = await fetchWithRetry(source);
      const manifest = await response.json();
      const platform = manifest.platforms?.[RELEASE.target];
      if (manifest.version !== version) {
        throw new Error(`manifest version ${manifest.version} != ${version}`);
      }
      if (!platform?.url || !platform?.signature) {
        throw new Error("manifest missing platform url/signature");
      }
      const asset = await fetchWithRetry(platform.url, { method: "HEAD" });
      if (!asset.ok) {
        throw new Error(`installer HEAD ${asset.status} for ${platform.url}`);
      }
      log(`OK ${source} → ${manifest.version} (${platform.url})`);
    } catch (error) {
      failures += 1;
      log(`FAIL ${source} → ${error.message}`);
    }
  }
  if (failures > 0) {
    fail(
      `${failures} of ${sources.length} update sources failed verification ` +
        "(GitHub 的 releases/latest 可能仍在缓存发布前的 404；等几分钟后重跑本命令)",
    );
  }
}

/** 发布后立刻校验时，CDN 可能还缓存着「资产不存在」的 404 —— 重试几轮再判失败。 */
async function fetchWithRetry(url, options = {}, attempts = 4, delayMs = 15_000) {
  let lastError = "unknown error";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "follow", ...options });
      if (response.ok) {
        return response;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    if (attempt < attempts) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
    }
  }
  throw new Error(lastError);
}

const command = process.argv[2];
if (command === "bump") {
  bump(process.argv[3]);
} else if (command === "build") {
  build();
} else if (command === "publish") {
  const version = readVersion();
  await publish({
    tag: arg("--tag", `v${version}`),
    notesFile: arg("--notes-file"),
    prerelease: flag("--prerelease"),
  });
} else if (command === "verify") {
  await verify(arg("--tag"));
} else {
  fail("usage: node scripts/release.mjs <bump|build|publish|verify> [...]");
}
