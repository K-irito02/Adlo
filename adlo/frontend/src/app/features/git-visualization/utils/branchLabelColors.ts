/**
 * Categorical palette for branch labels, lanes and commit nodes.
 *
 * Hues are ordered so consecutive slots are 150° apart on the hue wheel. The
 * slot for a branch is stored in a persisted name → slot map: existing branches
 * keep their slot when another branch is added or removed, so unrelated
 * branches are not reassigned.
 */
export const BRANCH_COLOR_SLOT_COUNT = 12;

/** Bounds the persisted history so stale branch names cannot grow forever. */
const MAX_STORED_BRANCH_COLORS = 200;

const BRANCH_COLOR_HUES = [265, 55, 205, 355, 145, 295, 85, 235, 25, 175, 325, 115] as const;

export type BranchColorSlots = Readonly<Record<string, number>>;

export function branchColorSlotVar(slot: number): string {
  const normalized =
    ((Math.trunc(Number.isFinite(slot) ? slot : 0) % BRANCH_COLOR_SLOT_COUNT) +
      BRANCH_COLOR_SLOT_COUNT) %
    BRANCH_COLOR_SLOT_COUNT;
  return `var(--branch-color-${String(normalized + 1).padStart(2, '0')}, #4b5563)`;
}

/** FNV-1a spreads similar names across hash buckets; color separation comes from the palette order. */
function branchNameHash(name: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i += 1) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function isLocalBranchName(name: string): boolean {
  return !name.startsWith('origin/') && !name.startsWith('upstream/') && name !== 'HEAD';
}

function branchSortRank(name: string): number {
  if (name === 'main') {
    return 0;
  }
  if (name === 'master') {
    return 1;
  }
  return 2;
}

export function compareBranchNames(a: string, b: string): number {
  return branchSortRank(a) - branchSortRank(b) || a.localeCompare(b);
}

function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
}

/**
 * Picks the free slot that is farthest from every used slot (tie-break by hash
 * preference). Slots reserved by temporarily absent branches are avoided while
 * an unreserved free slot exists, so a returning branch can reclaim its color.
 */
function pickMostDistinctSlot(
  used: ReadonlySet<number>,
  preferred: number,
  reserved: ReadonlySet<number> = new Set(),
): number {
  let bestSlot = preferred;
  let bestScore = Number.NEGATIVE_INFINITY;
  const freeSlots: number[] = [];
  const unreservedFreeSlots: number[] = [];

  for (let slot = 0; slot < BRANCH_COLOR_SLOT_COUNT; slot += 1) {
    if (used.has(slot)) {
      continue;
    }
    freeSlots.push(slot);
    if (!reserved.has(slot)) {
      unreservedFreeSlots.push(slot);
    }
  }

  const candidates = unreservedFreeSlots.length > 0 ? unreservedFreeSlots : freeSlots;
  for (const slot of candidates) {
    let minDistance = 360;
    for (const taken of used) {
      minDistance = Math.min(
        minDistance,
        hueDistance(BRANCH_COLOR_HUES[slot], BRANCH_COLOR_HUES[taken]),
      );
    }
    const score =
      minDistance * 1000 - hueDistance(BRANCH_COLOR_HUES[slot], BRANCH_COLOR_HUES[preferred]);
    if (score > bestScore) {
      bestScore = score;
      bestSlot = slot;
    }
  }

  return bestSlot;
}

/**
 * Assigns a stable slot to every current local branch and keeps the recorded
 * history for branches that are temporarily absent.
 *
 * Every valid recorded slot is preserved verbatim, including duplicate slots
 * once more than 12 branches share the 12-color palette. This is what keeps
 * existing colors stable when the set grows or shrinks; only names without a
 * recorded slot consume a free slot. History entries are also kept in the
 * returned map (bounded by {@link MAX_STORED_BRANCH_COLORS}) so a branch that
 * disappears from one snapshot and can return later reclaims its slot.
 */
export function assignBranchColorSlots(
  names: readonly string[],
  previous: BranchColorSlots = {},
): Record<string, number> {
  const local = [...new Set(names)].filter(isLocalBranchName).sort(compareBranchNames);
  const localSet = new Set(local);
  const result: Record<string, number> = Object.create(null);
  const used = new Set<number>();
  const reserved = new Set<number>();

  // Keep history for branches outside the current snapshot, but let the
  // current-name pass below own duplicate/occupied-slot resolution.
  for (const [name, stored] of Object.entries(previous)) {
    if (
      !localSet.has(name) &&
      Number.isInteger(stored) &&
      stored >= 0 &&
      stored < BRANCH_COLOR_SLOT_COUNT
    ) {
      result[name] = stored;
      reserved.add(stored);
    }
  }

  for (const name of local) {
    const stored = previous[name];
    if (Number.isInteger(stored) && stored >= 0 && stored < BRANCH_COLOR_SLOT_COUNT) {
      result[name] = stored;
      used.add(stored);
    }
  }

  for (const name of local) {
    if (result[name] !== undefined) {
      continue;
    }
    const preferred = branchNameHash(name) % BRANCH_COLOR_SLOT_COUNT;
    const slot =
      used.has(preferred) || reserved.has(preferred)
        ? pickMostDistinctSlot(used, preferred, reserved)
        : preferred;
    result[name] = slot;
    used.add(slot);
  }

  return trimStoredBranchColors(result, localSet);
}

/**
 * Current branches are never evicted. Only history entries are trimmed to fit
 * the cap, so a large current branch set can exceed the history budget without
 * losing an assignment (which would otherwise make the persistence effect
 * oscillate).
 */
function trimStoredBranchColors(
  result: Record<string, number>,
  current: ReadonlySet<string>,
): Record<string, number> {
  const keys = Object.keys(result);
  if (keys.length <= MAX_STORED_BRANCH_COLORS) {
    return result;
  }

  const currentKeys = keys.filter((key) => current.has(key));
  const historyKeys = keys.filter((key) => !current.has(key));
  const historyBudget = Math.max(0, MAX_STORED_BRANCH_COLORS - currentKeys.length);
  const keptHistory = historyKeys.slice(Math.max(0, historyKeys.length - historyBudget));

  const trimmed: Record<string, number> = Object.create(null);
  for (const key of [...keptHistory, ...currentKeys]) {
    trimmed[key] = result[key];
  }
  return trimmed;
}

/** Builds the branch-name → CSS variable map consumed by labels, lanes and nodes. */
export function buildRefLabelColorMap(
  names: readonly string[],
  previous: BranchColorSlots = {},
): Map<string, string> {
  const slots = assignBranchColorSlots(names, previous);
  return new Map(Object.entries(slots).map(([name, slot]) => [name, branchColorSlotVar(slot)]));
}

/** Stable per-name fallback used when no assignment map is supplied. */
export function getRefLabelColor(name: string, colorMap?: ReadonlyMap<string, string>): string {
  return colorMap?.get(name) ?? branchColorSlotVar(branchNameHash(name) % BRANCH_COLOR_SLOT_COUNT);
}
