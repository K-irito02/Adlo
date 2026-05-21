import type { GitSnapshot } from "@ai-digital-life/kernel";
import type { FileTreeRenderableNode } from "../../features/file-tree";
import type { PatchChangeKind, PatchFileSummary } from "../../features/patch-review";

export type ChangeFileState = "staged" | "modified" | "untracked" | "conflicted";

export interface ChangeEntry {
  path: string;
  states: ChangeFileState[];
  patchSummary?: PatchFileSummary;
}

export interface ChangeTreeNode extends FileTreeRenderableNode {
  children: ChangeTreeNode[];
  fileCount: number;
  states: ChangeFileState[];
  primaryState?: ChangeFileState;
  patchSummary?: PatchFileSummary;
  missing: boolean;
  reviewedHunks: number;
  totalHunks: number;
  changeKind?: PatchChangeKind;
}

interface MutableChangeTreeNode extends ChangeTreeNode {
  childMap: Map<string, MutableChangeTreeNode>;
  stateSet: Set<ChangeFileState>;
}

const STATE_PRIORITY: ChangeFileState[] = ["conflicted", "modified", "staged", "untracked"];

function sortPaths(paths: Iterable<string>): string[] {
  return [...paths].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

function mergeStates(current: ChangeFileState[], incoming: ChangeFileState[]): ChangeFileState[] {
  const merged = new Set<ChangeFileState>([...current, ...incoming]);
  return STATE_PRIORITY.filter((state) => merged.has(state));
}

function getPrimaryState(states: ChangeFileState[]): ChangeFileState | undefined {
  return STATE_PRIORITY.find((state) => states.includes(state));
}

function fallbackStateFromPatchSummary(summary?: PatchFileSummary): ChangeFileState[] {
  if (!summary) {
    return [];
  }
  return summary.changeKind === "added" ? ["untracked"] : ["modified"];
}

export function buildChangeEntries(snapshot: GitSnapshot | undefined, patchSummaries: PatchFileSummary[]): ChangeEntry[] {
  const entries = new Map<string, ChangeEntry>();
  const upsert = (path: string, states: ChangeFileState[], patchSummary?: PatchFileSummary) => {
    const current = entries.get(path);
    entries.set(path, {
      path,
      states: mergeStates(current?.states ?? [], states),
      patchSummary: patchSummary ?? current?.patchSummary
    });
  };

  sortPaths(snapshot?.staged ?? []).forEach((path) => upsert(path, ["staged"]));
  sortPaths(snapshot?.unstaged ?? []).forEach((path) => upsert(path, ["modified"]));
  sortPaths(snapshot?.untracked ?? []).forEach((path) => upsert(path, ["untracked"]));
  sortPaths(snapshot?.conflicts ?? []).forEach((path) => upsert(path, ["conflicted"]));

  patchSummaries.forEach((summary) => {
    upsert(summary.relativePath, fallbackStateFromPatchSummary(summary), summary);
  });

  return sortPaths(entries.keys()).map((path) => entries.get(path)!);
}

function createNode(
  path: string,
  name: string,
  kind: "directory" | "file"
): MutableChangeTreeNode {
  return {
    path,
    name,
    kind,
    children: [],
    fileCount: 0,
    states: [],
    primaryState: undefined,
    patchSummary: undefined,
    missing: false,
    reviewedHunks: 0,
    totalHunks: 0,
    changeKind: undefined,
    childMap: new Map<string, MutableChangeTreeNode>(),
    stateSet: new Set<ChangeFileState>()
  };
}

function finalizeNodes(nodes: MutableChangeTreeNode[]): ChangeTreeNode[] {
  return nodes
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "directory" ? -1 : 1;
      }
      return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    })
    .map((node) => {
      const finalizedChildren = finalizeNodes([...node.childMap.values()]);
      return {
        path: node.path,
        name: node.name,
        kind: node.kind,
        children: finalizedChildren,
        fileCount: node.fileCount,
        states: STATE_PRIORITY.filter((state) => node.stateSet.has(state)),
        primaryState: getPrimaryState(STATE_PRIORITY.filter((state) => node.stateSet.has(state))),
        patchSummary: node.patchSummary,
        missing: node.missing,
        reviewedHunks: node.reviewedHunks,
        totalHunks: node.totalHunks,
        changeKind: node.changeKind
      };
    });
}

export function buildChangeTree(entries: ChangeEntry[]): ChangeTreeNode[] {
  const roots = new Map<string, MutableChangeTreeNode>();

  entries.forEach((entry) => {
    const segments = entry.path.split("/").filter(Boolean);
    if (segments.length === 0) {
      return;
    }

    let currentPath = "";
    let parentMap = roots;

    segments.forEach((segment, index) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const isLeaf = index === segments.length - 1;
      let node = parentMap.get(currentPath);
      if (!node) {
        node = createNode(currentPath, segment, isLeaf ? "file" : "directory");
        parentMap.set(currentPath, node);
      }

      node.fileCount += 1;
      entry.states.forEach((state) => node!.stateSet.add(state));

      if (entry.patchSummary) {
        node.reviewedHunks += entry.patchSummary.acceptedHunks + entry.patchSummary.rejectedHunks;
        node.totalHunks += entry.patchSummary.totalHunks;
      }

      if (isLeaf) {
        node.patchSummary = entry.patchSummary;
        node.changeKind = entry.patchSummary?.changeKind;
        node.missing = entry.patchSummary?.changeKind === "deleted";
      }

      parentMap = node.childMap;
    });
  });

  return finalizeNodes([...roots.values()]);
}

export function buildFlatChangeNodes(entries: ChangeEntry[]): ChangeTreeNode[] {
  const byPath = new Map(entries.map((entry) => [entry.path, entry] as const));
  return sortPaths(entries.map((entry) => entry.path)).map((path) => {
    const entry = byPath.get(path)!;
    const name = entry.path.split("/").filter(Boolean).pop() ?? entry.path;
    return {
      path: entry.path,
      name,
      kind: "file",
      children: [],
      fileCount: 1,
      states: entry.states,
      primaryState: getPrimaryState(entry.states),
      patchSummary: entry.patchSummary,
      missing: entry.patchSummary?.changeKind === "deleted",
      reviewedHunks: (entry.patchSummary?.acceptedHunks ?? 0) + (entry.patchSummary?.rejectedHunks ?? 0),
      totalHunks: entry.patchSummary?.totalHunks ?? 0,
      changeKind: entry.patchSummary?.changeKind
    };
  });
}
