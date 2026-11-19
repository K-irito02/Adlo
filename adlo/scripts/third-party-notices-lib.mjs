/**
 * 第三方声明生成器的纯函数层。
 *
 * 只做可单测的解析 / 归一 / 组装；文件系统、网络与写盘留在
 * `generate-third-party-notices.mjs`。锁文件是**包清单的唯一真源**，
 * 包管理器元数据只用于补许可证与仓库地址。
 */

/** 语料刷新时至少覆盖的常见许可证（实际还会并入依赖图中出现的 id）。 */
export const BASE_SPDX_IDS = [
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BSL-1.0",
  "BlueOak-1.0.0",
  "CC-BY-3.0",
  "CC-BY-4.0",
  "CC0-1.0",
  "CDLA-Permissive-2.0",
  "GPL-3.0-or-later",
  "ISC",
  "LGPL-2.1-or-later",
  "LLVM-exception",
  "MIT",
  "MIT-0",
  "MPL-2.0",
  "OFL-1.1",
  "Python-2.0",
  "Unicode-3.0",
  "Unlicense",
  "Zlib",
];

/** Cargo.lock：只取外部包（`source` 为空的是本仓库 workspace crate）。 */
export function parseCargoLock(text) {
  const packages = [];
  for (const block of text.split(/\n\[\[package\]\]\n/).slice(1)) {
    const name = /^name = "([^"]+)"/m.exec(block)?.[1];
    const version = /^version = "([^"]+)"/m.exec(block)?.[1];
    const source = /^source = "([^"]+)"/m.exec(block)?.[1];
    if (!name || !version || !source) {
      continue;
    }
    packages.push({ name, version, source });
  }
  return packages;
}

/**
 * pnpm-lock v9：`snapshots` 的二级 key 是完整解析结果（含 peer 后缀）。
 * 只取 `name@version` 身份，peer 后缀与平台变体不参与去重。
 */
export function parsePnpmLock(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^snapshots:\s*$/.test(line));
  if (start < 0) {
    return [];
  }
  const packages = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^[A-Za-z]/.test(line)) {
      break;
    }
    const match = /^ {2}'?((?:@[^/'\s]+\/)?[^@'\s]+)@([^'\s(]+)(?:\(.+\))?'?:/.exec(line);
    if (match) {
      packages.push({ name: match[1], version: match[2] });
    }
  }
  return packages;
}

/**
 * 把上游许可证字段拆成 SPDX id 列表。
 *
 * 兼容生态里的历史写法：`MIT/Apache-2.0`（斜杠=或）、小写 `and/or`、
 * `GPL-2.0+`、`Apache-2.0 WITH LLVM-exception` 与括号组合。
 * 展示仍用上游原文；`ids` 只用于查标准正文。
 */
export function parseLicenseExpression(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ids: [], exceptions: [], normalized: "" };
  }
  // npm 的非 SPDX 约定：不是许可证表达式，正文只能来自随包文件。
  if (/^(?:SEE LICENSE IN|UNLICENSED)\b/i.test(raw.trim())) {
    return { ids: [], exceptions: [], normalized: raw.trim() };
  }
  const normalized = raw
    .replace(/\//g, " OR ")
    .replace(/\s+AND\s+/gi, " AND ")
    .replace(/\s+OR\s+/gi, " OR ")
    .replace(/\s+WITH\s+/gi, " WITH ");
  const tokens = normalized.match(/[A-Za-z0-9.+-]+/g) ?? [];
  const ids = [];
  const exceptions = [];
  let expectException = false;
  for (const token of tokens) {
    if (token === "AND" || token === "OR") {
      expectException = false;
      continue;
    }
    if (token === "WITH") {
      expectException = true;
      continue;
    }
    const id = normalizeSpdxId(token);
    if (!id) {
      continue;
    }
    if (expectException) {
      exceptions.push(id);
      expectException = false;
      continue;
    }
    ids.push(id);
  }
  return {
    ids: [...new Set(ids)],
    exceptions: [...new Set(exceptions)],
    normalized: raw.trim(),
  };
}

function normalizeSpdxId(token) {
  if (!token || /^(?:LicenseRef|DocumentRef)/i.test(token)) {
    return "";
  }
  if (token.endsWith("+") && !token.endsWith("++")) {
    return `${token.slice(0, -1)}-or-later`;
  }
  return token;
}

/** 许可证文件正文归一：去 BOM、统一换行、清尾随空白、压缩连续空行。 */
export function normalizeLicenseText(text) {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const COPYRIGHT_LINE = /^\s*(?:copyright\b|\(c\)\s*|©|\(copyright\))/i;
const TITLE_LINE =
  /^(?:the\s+)?(?:mit|isc|bsd(?:[ -]?[23][ -]?clause)?|apache(?: license)?|mozilla public license|gnu (?:lesser |affero )?general public license|unlicense|the unlicense|creative commons[^\n]*|boost software license[^\n]*|zlib license|unicode license[^\n]*|blue oak model license[^\n]*|python software foundation license[^\n]*|cdla[^\n]*|sil open font license[^\n]*)\b/i;

function isTitleLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 100) {
    return false;
  }
  return (
    TITLE_LINE.test(trimmed) || /license(?:,? version [\w.]+)?(?:\s*\([^)]*\))?$/i.test(trimmed)
  );
}

/**
 * 把许可文件开头的版权行从正文里剥出来单独展示。
 *
 * 只处理**正文开始前**的连续版权块（最多跳过 2 行标题），因此 Apache-2.0
 * 正文末尾的 `Copyright [yyyy] [name]` 示例段落不会被误删。正文去重后
 * 全仓库只剩一份标准文本，版权仍按包逐条展示，满足「附带版权声明」。
 */
export function stripLeadingCopyright(text) {
  const normalized = normalizeLicenseText(text);
  const lines = normalized.split("\n");
  let index = 0;
  while (index < lines.length && lines[index].trim() === "") {
    index += 1;
  }
  let titles = 0;
  while (index < lines.length && titles < 2 && isTitleLine(lines[index])) {
    index += 1;
    titles += 1;
    while (index < lines.length && lines[index].trim() === "") {
      index += 1;
    }
  }
  const copyright = [];
  const body = lines.slice(0, index);
  let seenBody = false;
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (!seenBody && COPYRIGHT_LINE.test(line)) {
      copyright.push(line.trim());
      continue;
    }
    if (!seenBody && line.trim() === "") {
      body.push(line);
      continue;
    }
    seenBody = true;
    body.push(line);
  }
  const stripped = body
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (copyright.length === 0 || stripped === "") {
    return { body: normalized, copyright: "" };
  }
  return { body: stripped, copyright: copyright.join("\n") };
}

/** 仓库地址归一：git+/ssh/git@/github: 都转成可点击的 https 根地址。 */
export function normalizeRepositoryUrl(value) {
  if (!value) {
    return undefined;
  }
  let url = typeof value === "string" ? value : value.url;
  if (typeof url !== "string" || url.trim() === "") {
    return undefined;
  }
  url = url
    .trim()
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^ssh:\/\/git@/, "https://")
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/^github:/i, "https://github.com/");
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) {
    url = `https://github.com/${url}`;
  }
  url = url.replace(/\.git$/, "").replace(/\/+$/, "");
  return /^https?:\/\//.test(url) ? url : undefined;
}

/** npm `license` 的三种历史形状：字符串、`{type}`、`licenses[]`。 */
export function normalizeNpmLicense(pkg) {
  if (typeof pkg?.license === "string" && pkg.license.trim() !== "") {
    return pkg.license.trim();
  }
  if (pkg?.license && typeof pkg.license === "object" && typeof pkg.license.type === "string") {
    return pkg.license.type.trim();
  }
  if (Array.isArray(pkg?.licenses)) {
    const types = pkg.licenses
      .map((item) => (typeof item === "string" ? item : item?.type))
      .filter((item) => typeof item === "string" && item.trim() !== "");
    if (types.length > 0) {
      return types.join(" OR ");
    }
  }
  return undefined;
}

/** 从 `Cargo.toml` 的 `[package]` 段取字段；用于 cargo metadata 未覆盖的目标专属依赖。 */
export function readCargoManifestFields(text) {
  const start = text.indexOf("[package]");
  const section = start >= 0 ? text.slice(start + "[package]".length) : text;
  const end = section.search(/\n\[[^\]]+\]/);
  const body = end >= 0 ? section.slice(0, end) : section;
  const field = (key) => {
    const match = new RegExp(`^\\s*${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "m").exec(body);
    return match ? (match[1] ?? match[2]) : undefined;
  };
  return {
    license: field("license"),
    licenseFile: field("license-file"),
    repository: field("repository"),
    homepage: field("homepage"),
  };
}

/**
 * 组装生成数据：去重、排序、剪掉未被引用的正文、统计降级数量。
 * 输出对象即写进 `.generated.ts` 的内容，保持确定性（无时间戳）。
 */
export function buildNoticeOutput({ packages, licenseTexts, sources }) {
  const unique = new Map();
  for (const pkg of packages) {
    const key = `${pkg.ecosystem}:${pkg.name}@${pkg.version}`;
    if (!unique.has(key)) {
      unique.set(key, pkg);
    }
  }
  const sorted = [...unique.values()].sort((a, b) => {
    const name = a.name.localeCompare(b.name);
    if (name !== 0) {
      return name;
    }
    if (a.ecosystem !== b.ecosystem) {
      return a.ecosystem.localeCompare(b.ecosystem);
    }
    return a.version.localeCompare(b.version);
  });
  const referenced = new Set();
  for (const pkg of sorted) {
    for (const ref of pkg.texts) {
      referenced.add(ref.key);
    }
  }
  const prunedTexts = {};
  for (const key of [...referenced].sort()) {
    if (typeof licenseTexts[key] === "string" && licenseTexts[key].length > 0) {
      prunedTexts[key] = licenseTexts[key];
    }
  }
  const totals = {
    total: sorted.length,
    npm: sorted.filter((pkg) => pkg.ecosystem === "npm").length,
    cargo: sorted.filter((pkg) => pkg.ecosystem === "cargo").length,
    unknownLicense: sorted.filter((pkg) => pkg.license === "").length,
    missingText: sorted.filter((pkg) => pkg.texts.length === 0).length,
  };
  return {
    schemaVersion: 1,
    sources,
    totals,
    licenseTexts: prunedTexts,
    packages: sorted,
  };
}

/** 稳定文本键：按内容哈希去重，同文不同包只存一份。 */
export function textKey(prefix, hash) {
  return `${prefix}:${hash}`;
}

/**
 * 网络补全的降级判定：返回 null 表示可以继续写盘；否则返回拒绝写盘的原因。
 *
 * `--allow-partial` 是显式放行；离线或 registry 部分失败时不允许静默生成
 * 「看起来完整、实际缺许可证」的清单。
 */
export function partialNpmFailure({ offline, missingCount, fetchedCount, allowPartial }) {
  if (missingCount === 0 || allowPartial) {
    return null;
  }
  if (offline) {
    return `offline: ${missingCount} npm packages have no local metadata or cache entry`;
  }
  if (fetchedCount < missingCount) {
    return `registry: ${missingCount - fetchedCount} of ${missingCount} npm packages could not be resolved`;
  }
  return null;
}

/** SPDX 语料刷新合并：新抓取覆盖同 id，未抓到的旧条目保留，避免文件悄悄缩小。 */
export function mergeLicenseCorpus(existing, fetched) {
  return { ...existing, ...fetched };
}

/**
 * 词袋 Dice 相似度：忽略标点、折行与顺序细节，衡量两份正文是否同一份许可。
 * 语料内不同许可的最高相似度约 0.93（0BSD/ISC、BSD-2/BSD-3、MIT/MIT-0），
 * 因此 0.95 之上视为「同一份正文」，可安全去重。
 */
export function licenseSimilarity(a, b) {
  const left = licenseWords(a);
  const right = licenseWords(b);
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  const counts = new Map();
  for (const word of left) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  let shared = 0;
  for (const word of right) {
    const remaining = counts.get(word) ?? 0;
    if (remaining > 0) {
      shared += 1;
      counts.set(word, remaining - 1);
    }
  }
  return (2 * shared) / (left.length + right.length);
}

const SIMILAR_LICENSE_THRESHOLD = 0.95;

/** 空白归一后的正文（移出开头版权块；标题行保留，差异交给相似度吸收）。 */
export function normalizedLicenseBody(text) {
  return stripLeadingCopyright(text).body.replace(/\s+/g, " ").trim();
}

/**
 * 两份正文是否是同一份许可：近似等长包含（短者 ≥ 长者 85%），或词袋相似度 ≥ 0.95。
 *
 * 0.85 下限避免把「见 LICENSE」这类短声明当作完整正文；合集文件（标准正文远短于
 * 随包文件）由 `coversLicenseText` 的显式包含判定覆盖。
 */
export function isSameLicenseBody(a, b) {
  const left = normalizedLicenseBody(a);
  const right = normalizedLicenseBody(b);
  if (left.length === 0 || right.length === 0) {
    return false;
  }
  if (left === right) {
    return true;
  }
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  if (short.length >= long.length * 0.85 && long.includes(short)) {
    return true;
  }
  return licenseSimilarity(left, right) >= SIMILAR_LICENSE_THRESHOLD;
}

/**
 * 随包正文是否已覆盖标准正文：完整正文被随包文件包含（可带附加说明/出处注记），
 * 或两者本就是同一份正文。
 */
export function coversLicenseText(sourceText, canonicalText) {
  const source = normalizedLicenseBody(sourceText);
  const canonical = normalizedLicenseBody(canonicalText);
  if (source.length === 0 || canonical.length === 0) {
    return false;
  }
  if (source.includes(canonical)) {
    return true;
  }
  return isSameLicenseBody(source, canonical);
}

function licenseWords(text) {
  return normalizeLicenseText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * 部分元数据的放行策略：返回 true 表示「已显式放行，降级继续」；
 * 未放行时抛错，保证不完整清单不会静默写盘。
 */
export function refusePartialMetadata(reason, allowPartial) {
  if (!reason) {
    return false;
  }
  if (allowPartial) {
    return true;
  }
  throw new Error(`${reason}; rerun with network or pass --allow-partial`);
}

/** npm 缓存只在真实生成且确有补全时写盘；`--check` 必须保持只读。 */
export function shouldWriteNpmCache({ check, fetchedCount }) {
  return !check && fetchedCount > 0;
}
