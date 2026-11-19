#!/usr/bin/env node
/**
 * 第三方声明全量生成器。
 *
 *   pnpm --dir adlo run notices:generate          # 生成（本地优先，缺元数据时联网补全）
 *   pnpm --dir adlo run notices:generate -- --offline   # 严格离线
 *   pnpm --dir adlo run notices:check             # 离线漂移门禁
 *   pnpm --dir adlo run notices:generate -- --refresh-spdx  # 刷新内嵌的标准许可正文
 *   pnpm --dir adlo run notices:generate -- --allow-partial  # 显式允许不完整元数据
 *
 * 设计约束：
 * - **锁文件是包清单的唯一真源**：Cargo.lock + pnpm-lock.yaml；包管理器元数据只补许可证。
 * - 许可正文优先用依赖随包携带的 LICENSE/COPYING/NOTICE 原文；缺失时才回退到
 *   `data/spdx-license-texts.json` 的内嵌标准正文；两者都没有就如实标「缺失」。
 * - 版权行从正文里单独剥出、逐包展示；正文按内容哈希去重，避免把同一份 MIT
 *   重复存上千遍。
 * - 输出确定性：不含时间戳，只记录两个锁文件的 sha256 前缀。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BASE_SPDX_IDS,
  buildNoticeOutput,
  coversLicenseText,
  mergeLicenseCorpus,
  normalizeLicenseText,
  normalizeNpmLicense,
  normalizeRepositoryUrl,
  parseCargoLock,
  parseLicenseExpression,
  parsePnpmLock,
  partialNpmFailure,
  readCargoManifestFields,
  refusePartialMetadata,
  shouldWriteNpmCache,
  stripLeadingCopyright,
  textKey,
} from "./third-party-notices-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ADLO_ROOT = resolve(HERE, "..");
const CARGO_LOCK = join(ADLO_ROOT, "Cargo.lock");
const PNPM_LOCK = join(ADLO_ROOT, "pnpm-lock.yaml");
const OUTPUT_FILE = join(
  ADLO_ROOT,
  "frontend",
  "src",
  "app",
  "features",
  "about",
  "thirdPartyNotices.generated.ts",
);
const OUTPUT_NAMES_FILE = join(
  ADLO_ROOT,
  "frontend",
  "src",
  "app",
  "features",
  "about",
  "thirdPartyNoticeNames.generated.ts",
);
const SPDX_DATA_FILE = join(HERE, "data", "spdx-license-texts.json");
const NPM_CACHE_FILE = join(HERE, "data", "npm-license-cache.json");
const MAX_LICENSE_BYTES = 160 * 1024;

const argv = new Set(process.argv.slice(2));
const OFFLINE = argv.has("--offline");
const CHECK = argv.has("--check");
const REFRESH_SPDX = argv.has("--refresh-spdx");
const ALLOW_PARTIAL = argv.has("--allow-partial");

function log(message) {
  process.stdout.write(`[notices] ${message}\n`);
}

function warn(message) {
  process.stderr.write(`[notices] WARN ${message}\n`);
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

/* -------------------------------------------------------------------------- */
/* Cargo                                                                      */
/* -------------------------------------------------------------------------- */

function runCargoMetadata(extraArgs) {
  return spawnSync(
    "cargo",
    [
      "metadata",
      "--format-version",
      "1",
      "--manifest-path",
      join(ADLO_ROOT, "Cargo.toml"),
      ...extraArgs,
    ],
    {
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      cwd: ADLO_ROOT,
    },
  );
}

function readCargoMetadata() {
  const offline = runCargoMetadata(["--offline"]);
  if (offline.status === 0) {
    const parsed = JSON.parse(offline.stdout);
    return new Map(parsed.packages.map((pkg) => [`${pkg.name}@${pkg.version}`, pkg]));
  }
  if (!OFFLINE) {
    warn(
      `cargo metadata --offline failed, retrying with the local index: ${offline.stderr?.slice(0, 200)}`,
    );
    const online = runCargoMetadata([]);
    if (online.status === 0) {
      const parsed = JSON.parse(online.stdout);
      return new Map(parsed.packages.map((pkg) => [`${pkg.name}@${pkg.version}`, pkg]));
    }
  }
  warn("cargo metadata unavailable; falling back to registry Cargo.toml files");
  return new Map();
}

function cargoRegistryRoots() {
  const cargoHome = process.env.CARGO_HOME || join(homedir(), ".cargo");
  const srcRoot = join(cargoHome, "registry", "src");
  if (!existsSync(srcRoot)) {
    return [];
  }
  try {
    return readdirSync(srcRoot).map((name) => join(srcRoot, name));
  } catch {
    return [];
  }
}

function findCargoDir(pkg, metadata, registryRoots) {
  const meta = metadata.get(`${pkg.name}@${pkg.version}`);
  if (meta?.manifest_path) {
    return dirname(meta.manifest_path);
  }
  for (const root of registryRoots) {
    const candidate = join(root, `${pkg.name}-${pkg.version}`);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function readCargoFields(dir) {
  if (!dir) {
    return {};
  }
  for (const name of ["Cargo.toml", "Cargo.toml.orig"]) {
    const file = join(dir, name);
    if (!existsSync(file)) {
      continue;
    }
    try {
      return readCargoManifestFields(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
  }
  return {};
}

/* -------------------------------------------------------------------------- */
/* npm                                                                        */
/* -------------------------------------------------------------------------- */

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** pnpm 虚拟店（workspace 根 + frontend 各一份）→ name@version → 包目录。 */
function scanPnpmStores() {
  const map = new Map();
  const stores = [
    join(ADLO_ROOT, "node_modules", ".pnpm"),
    join(ADLO_ROOT, "frontend", "node_modules", ".pnpm"),
  ];
  for (const store of stores) {
    if (!existsSync(store)) {
      continue;
    }
    let entries = [];
    try {
      entries = readdirSync(store);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const nodeModules = join(store, entry, "node_modules");
      if (!existsSync(nodeModules)) {
        continue;
      }
      let names = [];
      try {
        names = readdirSync(nodeModules);
      } catch {
        continue;
      }
      for (const name of names) {
        if (name.startsWith(".")) {
          continue;
        }
        const dirs = name.startsWith("@")
          ? readdirSync(join(nodeModules, name)).map((sub) => join(nodeModules, name, sub))
          : [join(nodeModules, name)];
        for (const dir of dirs) {
          const pkg = readJson(join(dir, "package.json"));
          if (pkg?.name && pkg?.version && !map.has(`${pkg.name}@${pkg.version}`)) {
            map.set(`${pkg.name}@${pkg.version}`, dir);
          }
        }
      }
    }
  }
  return map;
}

/** 非 pnpm 的扁平安装兜底：跟随符号链接扫描，带 realpath 环检测。 */
function scanHoistedNodeModules() {
  const map = new Map();
  const root = join(ADLO_ROOT, "frontend", "node_modules");
  if (!existsSync(root)) {
    return map;
  }
  const seen = new Set();
  const walk = (dir, depth) => {
    if (depth > 5) {
      return;
    }
    let real;
    try {
      real = realpathSync(dir);
    } catch {
      return;
    }
    if (seen.has(real)) {
      return;
    }
    seen.add(real);
    let names = [];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (name === ".bin" || name.startsWith(".")) {
        continue;
      }
      const path = join(dir, name);
      let stat;
      try {
        stat = statSync(path);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) {
        continue;
      }
      if (name.startsWith("@")) {
        walk(path, depth);
        continue;
      }
      const pkg = readJson(join(path, "package.json"));
      if (pkg?.name && pkg?.version && !map.has(`${pkg.name}@${pkg.version}`)) {
        map.set(`${pkg.name}@${pkg.version}`, path);
      }
      const nested = join(path, "node_modules");
      if (existsSync(nested)) {
        walk(nested, depth + 1);
      }
    }
  };
  walk(root, 0);
  return map;
}

async function fetchNpmManifest(name, version) {
  const url = `https://registry.npmjs.org/${name}/${version}`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: "application/json" },
      });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (attempt === 3) {
        return { __error: error.message };
      }
      await new Promise((done) => setTimeout(done, 500 * attempt));
    }
  }
  return null;
}

async function fillMissingFromRegistry(unresolved, concurrency = 8) {
  const results = new Map();
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, unresolved.length) }, async () => {
    for (;;) {
      const current = index;
      index += 1;
      if (current >= unresolved.length) {
        return;
      }
      const pkg = unresolved[current];
      const manifest = await fetchNpmManifest(pkg.name, pkg.version);
      if (manifest && !manifest.__error) {
        results.set(`${pkg.name}@${pkg.version}`, {
          license: manifest.license,
          repository: manifest.repository,
          homepage: manifest.homepage,
        });
      }
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * 平台专属可选依赖（esbuild/rollup 各平台二进制等）本机不会安装，许可证只能
 * 从 registry 取。缓存落盘后 `notices:check --offline` 才能与提交的生成物逐字一致。
 */
function readNpmCache() {
  if (!existsSync(NPM_CACHE_FILE)) {
    return new Map();
  }
  const parsed = readJson(NPM_CACHE_FILE);
  return new Map(Object.entries(parsed?.packages ?? {}));
}

function writeNpmCache(cache) {
  mkdirSync(dirname(NPM_CACHE_FILE), { recursive: true });
  const packages = Object.fromEntries([...cache.entries()].sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(
    NPM_CACHE_FILE,
    `${JSON.stringify(
      {
        source: "https://registry.npmjs.org",
        note: "本机未安装的可选依赖元数据缓存；仅许可证/仓库/主页，不含许可正文。",
        packages,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

/* -------------------------------------------------------------------------- */
/* 许可正文                                                                   */
/* -------------------------------------------------------------------------- */

function readSpdxCorpus() {
  if (!existsSync(SPDX_DATA_FILE)) {
    return {};
  }
  const parsed = readJson(SPDX_DATA_FILE);
  return parsed?.licenses && typeof parsed.licenses === "object" ? parsed.licenses : {};
}

async function refreshSpdxCorpus(ids) {
  const existing = readSpdxCorpus();
  const all = sortedUnique([...BASE_SPDX_IDS, ...ids]);
  const fetched = {};
  const failed = [];
  let index = 0;
  const fetchOne = async (id) => {
    const urls = [
      `https://raw.githubusercontent.com/spdx/license-list-data/main/json/details/${encodeURIComponent(id)}.json`,
      `https://raw.githubusercontent.com/spdx/license-list-data/main/json/exceptions/${encodeURIComponent(id)}.json`,
    ];
    let lastError = "";
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      for (const url of urls) {
        try {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(20_000),
            headers: { Accept: "application/json" },
          });
          if (!response.ok) {
            lastError = `HTTP ${response.status}`;
            continue;
          }
          const json = await response.json();
          const body = stripLeadingCopyright(
            json.licenseText ?? json.licenseExceptionText ?? json.exceptionText ?? "",
          ).body;
          if (body.length > 20) {
            fetched[id] = { name: json.name || id, text: body };
            return true;
          }
          lastError = "empty license text";
        } catch (error) {
          lastError = error.message;
        }
      }
      if (attempt < 3) {
        await new Promise((done) => setTimeout(done, 500 * attempt));
      }
    }
    warn(`SPDX text fetch failed for ${id}: ${lastError}`);
    return false;
  };
  const workers = Array.from({ length: 4 }, async () => {
    for (;;) {
      const current = index;
      index += 1;
      if (current >= all.length) {
        return;
      }
      const id = all[current];
      if (!(await fetchOne(id))) {
        failed.push(id);
      }
    }
  });
  await Promise.all(workers);

  // 只更新成功抓取的 id；未抓到的旧条目保留，避免刷新失败把语料文件悄悄改小。
  const licenses = mergeLicenseCorpus(existing, fetched);
  mkdirSync(dirname(SPDX_DATA_FILE), { recursive: true });
  writeFileSync(
    SPDX_DATA_FILE,
    `${JSON.stringify(
      {
        source: "https://github.com/spdx/license-list-data",
        note: "标准许可正文（版权行已剥离，逐包版权由生成器从随包文件提取）。",
        licenses: Object.fromEntries(
          Object.entries(licenses).sort(([a], [b]) => a.localeCompare(b)),
        ),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  log(
    `SPDX corpus refreshed: ${Object.keys(fetched).length} fetched, ` +
      `${Object.keys(licenses).length} total, ${failed.length} failed -> ${SPDX_DATA_FILE}`,
  );
  return { licenses, failed };
}

function collectLicenseFiles(dir, licenseFile) {
  if (!dir) {
    return [];
  }
  const files = [];
  const seen = new Set();
  const add = (path, label) => {
    if (seen.has(path) || !existsSync(path)) {
      return;
    }
    let stat;
    try {
      stat = statSync(path);
    } catch {
      return;
    }
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_LICENSE_BYTES) {
      return;
    }
    try {
      const text = normalizeLicenseText(readFileSync(path, "utf8"));
      if (text.length < 20) {
        return;
      }
      // `.spdx` 文档是 SPDX 元数据（SPDXVersion / PackageLicenseDeclared），不是许可正文。
      if (/^SPDXVersion:/i.test(text.trimStart())) {
        return;
      }
      seen.add(path);
      files.push({ label, text });
    } catch {
      // 非 UTF-8 / 读失败：跳过，由 UI 标「未随包提供」。
    }
  };
  if (licenseFile) {
    add(isAbsolute(licenseFile) ? licenseFile : resolve(dir, licenseFile), basename(licenseFile));
  }
  let names = [];
  try {
    names = readdirSync(dir).sort();
  } catch {
    return files;
  }
  for (const name of names) {
    if (!/^(?:licen[cs]e|copying|unlicense|copyright|notice)/i.test(name)) {
      continue;
    }
    add(join(dir, name), name);
  }
  // LICENSE / COPYING 优先于 COPYRIGHT / NOTICE：后者常带同一份正文的副本。
  const rank = (label) => (/^(?:licen[cs]e|copying|unlicense)/i.test(label) ? 0 : 1);
  files.sort((a, b) => rank(a.label) - rank(b.label) || a.label.localeCompare(b.label));
  return files;
}

function addFileTexts(files, store, canonicalIndex) {
  const refs = [];
  const copyrights = [];
  for (const file of files) {
    const { body, copyright } = stripLeadingCopyright(file.text);
    if (copyright) {
      copyrights.push(copyright);
    }
    const hash = bodyFingerprint(body);
    const canonical = canonicalIndex.get(hash);
    const key = canonical ? textKey("spdx", canonical.id) : textKey("file", hash);
    if (!(key in store)) {
      store[key] = canonical ? canonical.text : body;
    }
    refs.push({ label: file.label, key });
  }
  return {
    refs: refs.filter((ref, i) => refs.findIndex((other) => other.key === ref.key) === i),
    copyright: sortedUnique(copyrights).join("\n"),
  };
}

/** 同一份正文只展示一条：随包文件排在前面，因此优先保留原文而不是标准正文副本。 */
function dedupeRefs(refs, store) {
  const kept = [];
  for (const ref of refs) {
    const body = store[ref.key] ?? "";
    // addFileTexts / addCanonicalTexts 入 ref 前必写 store；空正文属不可达防御。
    if (body.length === 0) {
      continue;
    }
    const duplicate = kept.some((other) => coversLicenseText(store[other.key] ?? "", body));
    if (!duplicate) {
      kept.push(ref);
    }
  }
  return kept;
}

/** 声明 id 中，已有随包正文覆盖的集合（完整正文出现在随包文件里即算覆盖）。 */
function coveredLicenseIds(fileTexts, expression, corpus) {
  const covered = new Set();
  for (const id of [...expression.ids, ...expression.exceptions]) {
    const canonical = corpus[id]?.text;
    if (!canonical) {
      continue;
    }
    if (fileTexts.some((text) => coversLicenseText(text, canonical))) {
      covered.add(id);
    }
  }
  return covered;
}

/** 折行差异不应产生新条目：正文按空白折叠后再哈希。 */
function bodyFingerprint(text) {
  return sha256(normalizeLicenseText(text).replace(/\s+/g, " ").trim()).slice(0, 16);
}

/** 正文指纹 → 标准许可：随包文件与 SPDX 正文等价时共用同一条目。 */
function buildCanonicalBodyIndex(corpus) {
  const index = new Map();
  for (const [id, entry] of Object.entries(corpus)) {
    if (!entry?.text) {
      continue;
    }
    const hash = bodyFingerprint(entry.text);
    if (!index.has(hash)) {
      index.set(hash, { id, text: entry.text });
    }
  }
  return index;
}

function addCanonicalTexts(expression, corpus, store, skipIds) {
  const refs = [];
  const ids = [...expression.ids, ...expression.exceptions].filter((id) => !skipIds?.has(id));
  for (const id of ids) {
    const entry = corpus[id];
    if (!entry?.text) {
      continue;
    }
    const key = textKey("spdx", id);
    if (!(key in store)) {
      store[key] = entry.text;
    }
    refs.push({ label: id, key });
  }
  return refs.filter((ref, i) => refs.findIndex((other) => other.key === ref.key) === i);
}

/* -------------------------------------------------------------------------- */
/* 组装                                                                       */
/* -------------------------------------------------------------------------- */

function buildPackageRecord({
  name,
  version,
  ecosystem,
  license,
  dir,
  repository,
  homepage,
  licenseFile,
  corpus,
  canonicalIndex,
  store,
}) {
  const expression = parseLicenseExpression(license);
  const files = collectLicenseFiles(dir, licenseFile);
  let refs = [];
  let copyright = "";
  let textSource = "none";
  if (files.length > 0) {
    const added = addFileTexts(files, store, canonicalIndex);
    refs = added.refs;
    copyright = added.copyright;
    textSource = "package";
    // 声明里未被随包正文覆盖的 id 回退标准正文；覆盖判定允许随包文件带标题 /
    // 附加说明（完整正文被包含即可），既避免同一份正文重复出现，也补上
    // 「随包只有部分许可」的缺口。
    const covered = coveredLicenseIds(
      files.map((file) => file.text),
      expression,
      corpus,
    );
    refs = [...refs, ...addCanonicalTexts(expression, corpus, store, covered)];
  } else {
    refs = addCanonicalTexts(expression, corpus, store);
    if (refs.length > 0) {
      textSource = "canonical";
    }
  }
  const url = normalizeRepositoryUrl(repository) ?? normalizeRepositoryUrl(homepage);
  refs = dedupeRefs(refs, store);
  const record = {
    name,
    version,
    ecosystem,
    license: typeof license === "string" ? license.trim() : "",
    licenseIds: expression.ids,
    url,
    copyright: copyright || undefined,
    texts: refs,
    textSource,
  };
  return record;
}

function buildCargoPackages(lockPackages, metadata, registryRoots, corpus, canonicalIndex, store) {
  return lockPackages.map((pkg) => {
    const meta = metadata.get(`${pkg.name}@${pkg.version}`);
    const dir = findCargoDir(pkg, metadata, registryRoots);
    const fields = meta
      ? {
          license: meta.license,
          licenseFile: meta.license_file,
          repository: meta.repository,
          homepage: meta.homepage,
        }
      : readCargoFields(dir);
    let license = typeof fields.license === "string" ? fields.license : "";
    if (!license && fields.licenseFile) {
      license = `SEE LICENSE IN ${basename(fields.licenseFile)}`;
    }
    return buildPackageRecord({
      name: pkg.name,
      version: pkg.version,
      ecosystem: "cargo",
      license,
      dir,
      repository: fields.repository,
      homepage: fields.homepage,
      licenseFile: fields.licenseFile,
      corpus,
      canonicalIndex,
      store,
    });
  });
}

function buildNpmPackages(
  lockPackages,
  storeMap,
  registryManifests,
  corpus,
  canonicalIndex,
  store,
) {
  return lockPackages.map((pkg) => {
    const key = `${pkg.name}@${pkg.version}`;
    const dir = storeMap.get(key) ?? null;
    const localManifest = dir ? readJson(join(dir, "package.json")) : null;
    const manifest = localManifest ?? registryManifests.get(key) ?? null;
    const license = normalizeNpmLicense(manifest) ?? "";
    return buildPackageRecord({
      name: pkg.name,
      version: pkg.version,
      ecosystem: "npm",
      license,
      dir,
      repository: manifest?.repository,
      homepage: manifest?.homepage,
      corpus,
      canonicalIndex,
      store,
    });
  });
}

function formatOutput(data) {
  const header = `/**
 * AUTO-GENERATED by \`adlo/scripts/generate-third-party-notices.mjs\`.
 * DO NOT EDIT. Regenerate with \`pnpm --dir adlo run notices:generate\`.
 * Sources: Cargo.lock (sha256:${data.sources.cargoLock}), pnpm-lock.yaml (sha256:${data.sources.pnpmLock}).
 */
import type { ThirdPartyNoticeData } from './thirdPartyNoticesTypes';

export const THIRD_PARTY_NOTICES_DATA: ThirdPartyNoticeData = `;
  return `${header}${JSON.stringify(data)};\n`;
}

/**
 * 轻量名称索引：供致谢弹窗展开「第三方名称」时使用，避免为列名称而加载
 * 数 MB 的许可全文。按名称去重、排序；版本与许可正文仍在完整生成物里。
 */
function formatNamesOutput(data) {
  const names = [...new Set(data.packages.map((pkg) => pkg.name))].sort();
  const header = `/**
 * AUTO-GENERATED by \`adlo/scripts/generate-third-party-notices.mjs\`.
 * DO NOT EDIT. Regenerate with \`pnpm --dir adlo run notices:generate\`.
 * Sources: Cargo.lock (sha256:${data.sources.cargoLock}), pnpm-lock.yaml (sha256:${data.sources.pnpmLock}).
 * Unique package names only; versions and license texts live in thirdPartyNotices.generated.ts.
 */

export const THIRD_PARTY_NOTICE_NAMES: readonly string[] = `;
  return `${header}${JSON.stringify(names)};\n`;
}

async function main() {
  if (!existsSync(CARGO_LOCK) || !existsSync(PNPM_LOCK)) {
    throw new Error("Cargo.lock / pnpm-lock.yaml not found; run from the adlo workspace");
  }
  const cargoLockText = readFileSync(CARGO_LOCK, "utf8");
  const pnpmLockText = readFileSync(PNPM_LOCK, "utf8");
  const cargoLock = parseCargoLock(cargoLockText);
  const npmLock = parsePnpmLock(pnpmLockText);
  log(`lockfiles: cargo=${cargoLock.length} external, npm=${npmLock.length} snapshots`);

  const metadata = readCargoMetadata();
  const registryRoots = cargoRegistryRoots();
  const storeMap = new Map([...scanPnpmStores(), ...scanHoistedNodeModules()]);
  log(`local metadata: cargo=${metadata.size}, npm store=${storeMap.size}`);

  const npmCache = readNpmCache();
  const missingNpm = npmLock.filter(
    (pkg) =>
      !storeMap.has(`${pkg.name}@${pkg.version}`) && !npmCache.has(`${pkg.name}@${pkg.version}`),
  );
  const registryManifests = new Map(npmCache);
  let fetchedCount = 0;
  if (missingNpm.length > 0) {
    if (OFFLINE) {
      log(`offline: ${missingNpm.length} npm packages have no local metadata or cache entry`);
    } else {
      log(`fetching ${missingNpm.length} npm manifests from the registry...`);
      const fetched = await fillMissingFromRegistry(missingNpm);
      for (const [key, value] of fetched) {
        registryManifests.set(key, value);
      }
      fetchedCount = fetched.size;
      log(`registry fill: ${fetched.size}/${missingNpm.length} resolved`);
    }

    const partial = partialNpmFailure({
      offline: OFFLINE,
      missingCount: missingNpm.length,
      fetchedCount,
    });
    if (refusePartialMetadata(partial, ALLOW_PARTIAL)) {
      warn(`${partial}; continuing because --allow-partial`);
    }
  }

  // 漂移门禁只读：--check 不写缓存；失败/离线不完整的缓存也不会被悄悄落盘。
  if (shouldWriteNpmCache({ check: CHECK, fetchedCount })) {
    writeNpmCache(registryManifests);
  }

  let corpus = readSpdxCorpus();
  let canonicalIndex = buildCanonicalBodyIndex(corpus);
  if (REFRESH_SPDX) {
    const probeStore = {};
    const probe = [
      ...buildCargoPackages(cargoLock, metadata, registryRoots, corpus, canonicalIndex, probeStore),
      ...buildNpmPackages(npmLock, storeMap, registryManifests, corpus, canonicalIndex, probeStore),
    ];
    const ids = probe.flatMap((pkg) => pkg.licenseIds ?? []);
    const refreshed = await refreshSpdxCorpus(ids);
    corpus = refreshed.licenses;
    const reason =
      refreshed.failed.length > 0
        ? `SPDX corpus refresh failed for ${refreshed.failed.length} id(s): ${refreshed.failed.join(", ")}`
        : null;
    if (refusePartialMetadata(reason, ALLOW_PARTIAL)) {
      warn(`${reason}; continuing because --allow-partial`);
    }
    canonicalIndex = buildCanonicalBodyIndex(corpus);
  }
  if (Object.keys(corpus).length === 0) {
    warn("no SPDX corpus found; packages without a bundled license file will show no text");
  }

  const textStore = {};
  const cargoPackages = buildCargoPackages(
    cargoLock,
    metadata,
    registryRoots,
    corpus,
    canonicalIndex,
    textStore,
  );
  const npmPackages = buildNpmPackages(
    npmLock,
    storeMap,
    registryManifests,
    corpus,
    canonicalIndex,
    textStore,
  );
  const data = buildNoticeOutput({
    packages: [...cargoPackages, ...npmPackages],
    licenseTexts: textStore,
    sources: {
      cargoLock: sha256(cargoLockText).slice(0, 12),
      pnpmLock: sha256(pnpmLockText).slice(0, 12),
    },
  });
  const output = formatOutput(data);
  const namesOutput = formatNamesOutput(data);

  if (CHECK) {
    const current = existsSync(OUTPUT_FILE) ? readFileSync(OUTPUT_FILE, "utf8") : "";
    const currentNames = existsSync(OUTPUT_NAMES_FILE)
      ? readFileSync(OUTPUT_NAMES_FILE, "utf8")
      : "";
    if (current !== output || currentNames !== namesOutput) {
      process.stderr.write(
        "[notices] FAIL generated notices are stale; run `pnpm --dir adlo run notices:generate`\n",
      );
      process.exit(1);
    }
    log("notices are up to date");
    return;
  }

  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, output, "utf8");
  writeFileSync(OUTPUT_NAMES_FILE, namesOutput, "utf8");
  const nameCount = [...new Set(data.packages.map((pkg) => pkg.name))].length;
  log(
    `generated ${data.totals.total} packages (npm ${data.totals.npm}, cargo ${data.totals.cargo}); ` +
      `unknown license ${data.totals.unknownLicense}, missing text ${data.totals.missingText}; ` +
      `${(Buffer.byteLength(output, "utf8") / 1024).toFixed(1)} KiB -> ${OUTPUT_FILE}; ` +
      `${nameCount} unique names (${(Buffer.byteLength(namesOutput, "utf8") / 1024).toFixed(1)} KiB) -> ${OUTPUT_NAMES_FILE}`,
  );
}

main().catch((error) => {
  process.stderr.write(`[notices] ERROR ${error.stack || error.message}\n`);
  process.exit(1);
});
