import { describe, expect, it } from 'vitest';
import type { WorkspaceTreeNode } from '@ai-digital-life/kernel';
import { renameTreeNodePaths, remapExpandedTreePaths, insertTreeNode } from './workspaceTreeRename';

function node(path: string, kind: 'file' | 'directory', children: WorkspaceTreeNode[] = []) {
  return { path, name: path.split('/').pop() ?? path, kind, children };
}

describe('renameTreeNodePaths', () => {
  it('renames a file node and keeps sibling paths', () => {
    const tree: WorkspaceTreeNode[] = [
      node('a.txt', 'file'),
      node('dir', 'directory', [node('dir/b.txt', 'file')]),
    ];
    const result = renameTreeNodePaths(tree, 'a.txt', 'b.md');
    expect(result[0].path).toBe('b.md');
    expect(result[0].name).toBe('b.md');
    expect(result[0].kind).toBe('file');
    expect(result[1].path).toBe('dir');
    expect(result[1].children[0].path).toBe('dir/b.txt');
  });

  it('renames a directory and remaps descendant paths', () => {
    const tree: WorkspaceTreeNode[] = [
      node('dir', 'directory', [
        node('dir/b.txt', 'file'),
        node('dir/sub', 'directory', [node('dir/sub/c.txt', 'file')]),
      ]),
    ];
    const result = renameTreeNodePaths(tree, 'dir', 'src');
    expect(result[0].path).toBe('src');
    expect(result[0].name).toBe('src');
    expect(result[0].children[0].path).toBe('src/b.txt');
    expect(result[0].children[1].path).toBe('src/sub');
    expect(result[0].children[1].children[0].path).toBe('src/sub/c.txt');
  });

  it('renames a nested directory and leaves siblings alone', () => {
    const tree: WorkspaceTreeNode[] = [
      node('dir', 'directory', [
        node('dir/sub', 'directory', [node('dir/sub/c.txt', 'file')]),
        node('dir/other', 'directory', [node('dir/other/d.txt', 'file')]),
      ]),
    ];
    const result = renameTreeNodePaths(tree, 'dir/sub', 'dir/renamed');
    const renamed = result[0].children[0];
    expect(renamed.path).toBe('dir/renamed');
    expect(renamed.name).toBe('renamed');
    expect(renamed.children[0].path).toBe('dir/renamed/c.txt');
    expect(result[0].children[1].path).toBe('dir/other');
    expect(result[0].children[1].children[0].path).toBe('dir/other/d.txt');
  });

  it('is a pure function that does not mutate the input', () => {
    const tree: WorkspaceTreeNode[] = [node('a.txt', 'file')];
    const result = renameTreeNodePaths(tree, 'a.txt', 'b.md');
    expect(tree[0].path).toBe('a.txt');
    expect(result).not.toBe(tree);
    expect(result[0]).not.toBe(tree[0]);
  });
});

describe('insertTreeNode', () => {
  it('inserts at the tree root and keeps directories before files sorted by name', () => {
    const tree: WorkspaceTreeNode[] = [node('b.txt', 'file'), node('a', 'directory')];
    const result = insertTreeNode(tree, '', node('c.txt', 'file'));
    expect(result.map((n) => n.path)).toEqual(['a', 'b.txt', 'c.txt']);
  });

  it('inserts into a nested directory and sorts siblings', () => {
    const tree: WorkspaceTreeNode[] = [
      node('dir', 'directory', [node('dir/z.txt', 'file'), node('dir/b', 'directory')]),
    ];
    const result = insertTreeNode(tree, 'dir', node('dir/a.txt', 'file'));
    expect(result[0].children.map((n) => n.path)).toEqual(['dir/b', 'dir/a.txt', 'dir/z.txt']);
  });

  it('inserts into a deeply nested ancestor without touching siblings', () => {
    const tree: WorkspaceTreeNode[] = [
      node('a', 'directory', [
        node('a/b', 'directory', [node('a/b/c.txt', 'file')]),
        node('a/other', 'directory'),
      ]),
    ];
    const result = insertTreeNode(tree, 'a/b', node('a/b/new.md', 'file'));
    expect(result[0].path).toBe('a');
    expect(result[0].children[0].children.map((n) => n.path)).toEqual(['a/b/c.txt', 'a/b/new.md']);
    expect(result[0].children[1].path).toBe('a/other');
  });

  it('is a pure function that does not mutate the input', () => {
    const tree: WorkspaceTreeNode[] = [node('a', 'directory', [node('a/b.txt', 'file')])];
    const result = insertTreeNode(tree, 'a', node('a/c.txt', 'file'));
    expect(tree[0].children.length).toBe(1);
    expect(result).not.toBe(tree);
    expect(result[0]).not.toBe(tree[0]);
  });
});

describe('remapExpandedTreePaths', () => {
  it('remaps the exact key and descendant prefixes', () => {
    const expanded = { dir: true, 'dir/sub': true, other: true };
    const result = remapExpandedTreePaths(expanded, 'dir', 'src');
    expect(result).toEqual({ src: true, 'src/sub': true, other: true });
  });

  it('remaps only the matching prefix and keeps order-insensitive values', () => {
    const expanded = { 'dir/sub/c': true, 'dir/sub': true };
    const result = remapExpandedTreePaths(expanded, 'dir/sub', 'dir/renamed');
    expect(result).toEqual({ 'dir/renamed/c': true, 'dir/renamed': true });
  });

  it('returns the same reference when nothing matches', () => {
    const expanded = { other: true, dirx: true };
    const result = remapExpandedTreePaths(expanded, 'dir', 'src');
    expect(result).toBe(expanded);
  });

  it('does not match partial segment names', () => {
    const expanded = { directory: true, 'directory/deep': true };
    const result = remapExpandedTreePaths(expanded, 'dir', 'src');
    expect(result).toBe(expanded);
  });
});
