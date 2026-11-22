/**
 * Shared third-party skill boundary for repo checks.
 *
 * The install lock (`.agents/.skill-lock.json`) is the authoritative list of
 * third-party skills. Project-built skills are intentionally absent from it.
 * Product-code gates (comment claims, literal `\n` hygiene, compat wording)
 * apply to product code; upstream skill bodies are governed by
 * `check-agent-dirs` (mirror hashes) and `check-context-budget` (size) instead.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const lockPath = path.join(repoRoot, ".agents/.skill-lock.json");

let cachedNames = null;

export function readThirdPartySkillNames() {
  if (cachedNames) {
    return cachedNames;
  }
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    cachedNames = new Set(Object.keys(lock.skills ?? {}));
  } catch {
    cachedNames = new Set();
  }
  return cachedNames;
}

/** True for `.agents|.opencode|.trae /skills/<third-party-name>/...`. */
export function isThirdPartySkillPath(relativePath) {
  const match = /^(?:\.agents|\.opencode|\.trae)\/skills\/([^/]+)\//.exec(
    String(relativePath).replace(/\\/g, "/"),
  );
  return Boolean(match && readThirdPartySkillNames().has(match[1]));
}
