import type { RepoMapEntry, RepoMapNode } from '@ai-digital-life/kernel';

type MutableRepoMapNode = RepoMapNode & { children: MutableRepoMapNode[] };

function createDirectoryNode(path: string, name: string): MutableRepoMapNode {
  return {
    path,
    name,
    kind: 'directory',
    fileCount: 0,
    children: [],
  };
}

function sortTree(nodes: MutableRepoMapNode[]): RepoMapNode[] {
  nodes.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'directory' ? -1 : 1;
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });

  return nodes.map((node) => ({
    ...node,
    children: sortTree(node.children),
  }));
}

/** Build a hierarchical repo-map tree from flattened retrieval entries. */
export function repoMapEntriesToTree(entries: RepoMapEntry[]): RepoMapNode[] {
  const root: MutableRepoMapNode[] = [];
  const directories = new Map<string, MutableRepoMapNode>();

  const ensureDirectory = (path: string): MutableRepoMapNode => {
    const existing = directories.get(path);
    if (existing) {
      return existing;
    }

    const segments = path.split('/').filter(Boolean);
    const name = segments[segments.length - 1] ?? path;
    const node = createDirectoryNode(path, name);
    directories.set(path, node);

    const parentPath = segments.slice(0, -1).join('/');
    if (parentPath) {
      const parent = ensureDirectory(parentPath);
      if (!parent.children.some((child) => child.path === node.path)) {
        parent.children.push(node);
      }
    } else if (!root.some((child) => child.path === node.path)) {
      root.push(node);
    }

    return node;
  };

  for (const entry of entries) {
    const normalizedPath = entry.path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!normalizedPath) {
      continue;
    }
    const segments = normalizedPath.split('/').filter(Boolean);
    if (segments.length === 0) {
      continue;
    }

    const parentPath = segments.slice(0, -1).join('/');
    if (parentPath) {
      ensureDirectory(parentPath);
    }

    if (entry.type === 'directory') {
      ensureDirectory(normalizedPath);
      continue;
    }

    const fileNode: MutableRepoMapNode = {
      path: normalizedPath,
      name: segments[segments.length - 1],
      kind: 'file',
      fileCount: 0,
      children: [],
    };
    if (!parentPath) {
      if (!root.some((child) => child.path === fileNode.path)) {
        root.push(fileNode);
      }
    } else {
      const parent = directories.get(parentPath);
      if (parent && !parent.children.some((child) => child.path === fileNode.path)) {
        parent.children.push(fileNode);
      }
    }
  }

  const countFiles = (node: MutableRepoMapNode): number => {
    if (node.kind === 'file') {
      return 1;
    }
    const total = node.children.reduce((sum, child) => sum + countFiles(child), 0);
    node.fileCount = total;
    return total;
  };

  root.forEach(countFiles);
  return sortTree(root);
}
