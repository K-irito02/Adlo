import type { HeatmapColumn } from '@/components/charts/heatmap/heatmap-context';
import type { RawContributorModules } from './adapters/chartDataAdapters';

export interface ModuleTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: ModuleTreeNode[];
}

export function buildModuleTree(allPaths: string[]): ModuleTreeNode {
  const root: ModuleTreeNode = { name: '', path: '', isDir: true, children: [] };

  for (const fullPath of allPaths) {
    const segments = fullPath.replace(/\\/g, '/').split('/');
    let current = root;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const isLast = i === segments.length - 1;
      const segPath = current.path ? `${current.path}/${seg}` : seg;

      let child = current.children.find((c) => c.name === seg);
      if (!child) {
        child = {
          name: seg,
          path: segPath,
          isDir: !isLast,
          children: [],
        };
        current.children.push(child);
      }
      current = child;
    }
  }

  sortTreeChildren(root);
  return root;
}

function sortTreeChildren(node: ModuleTreeNode): void {
  node.children.sort((a, b) => {
    if (a.isDir !== b.isDir) {
      return a.isDir ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) {
    sortTreeChildren(child);
  }
}

export function getChildrenAtPath(tree: ModuleTreeNode, pathSegments: string[]): ModuleTreeNode[] {
  let current = tree;
  for (const seg of pathSegments) {
    const found = current.children.find((c) => c.name === seg);
    if (!found) {
      return [];
    }
    current = found;
  }
  return current.children;
}

export interface ColumnMeta {
  isDir: boolean;
}

export function childrenToHeatmapColumns(
  children: ModuleTreeNode[],
  matrix: RawContributorModules['matrix'],
): { columns: HeatmapColumn[]; rowLabels: string[]; columnMeta: ColumnMeta[] } {
  const sorted = [...matrix].sort((a, b) => a.author.localeCompare(b.author));
  const rowLabels = sorted.map((m) => m.author);

  const columns: HeatmapColumn[] = children.map((child, colIdx) => ({
    bin: colIdx,
    columnLabel: child.name,
    bins: sorted.map((contributor, rowIdx) => {
      const prefix = child.path + (child.isDir ? '/' : '');
      let total = 0;
      for (const mod of contributor.modules) {
        if (mod.module === child.path || mod.module.startsWith(prefix)) {
          total += mod.count;
        }
      }
      return {
        count: total,
        bin: rowIdx,
        tooltipTitle: child.path,
        tooltipSubtitle: contributor.author,
      };
    }),
  }));

  const columnMeta: ColumnMeta[] = children.map((child) => ({ isDir: child.isDir }));

  return { columns, rowLabels, columnMeta };
}

export function flattenTreePaths(tree: ModuleTreeNode): string[] {
  const result: string[] = [];
  function walk(node: ModuleTreeNode, prefix: string) {
    const currentPath = prefix ? `${prefix}/${node.name}` : node.name;
    if (!node.isDir) {
      result.push(currentPath);
    }
    for (const child of node.children) {
      walk(child, node.isDir ? currentPath : prefix);
    }
  }
  for (const child of tree.children) {
    walk(child, '');
  }
  return result;
}
