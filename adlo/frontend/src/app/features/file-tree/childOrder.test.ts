import { describe, expect, it } from 'vitest';
import type { FileTreeRenderableNode } from './fileTree.utils';
import { applyChildOrder, childOrderKey, insertChildName } from './childOrder';

interface Node extends FileTreeRenderableNode {
  children: Node[];
}

const node = (path: string, kind: 'directory' | 'file', children: Node[] = []): Node => ({
  path,
  name: path.split('/').pop() ?? path,
  kind,
  children,
});

const tree: Node[] = [
  node('src', 'directory', [node('src/a.ts', 'file'), node('src/b.ts', 'file')]),
  node('docs', 'directory'),
  node('README.md', 'file'),
  node('vite.config.ts', 'file'),
];

describe('applyChildOrder', () => {
  it('没有自定义顺序时保持后端默认顺序（目录优先 + 名字）', () => {
    expect(applyChildOrder(tree, '/ws', '', {}).map((item) => item.name)).toEqual([
      'src',
      'docs',
      'README.md',
      'vite.config.ts',
    ]);
  });

  it('已排序的目录允许目录与文件混排', () => {
    const order = {
      [childOrderKey('/ws', '')]: ['README.md', 'src', 'docs'],
    };

    const result = applyChildOrder(tree, '/ws', '', order);

    expect(result.map((item) => item.name)).toEqual(['README.md', 'src', 'docs', 'vite.config.ts']);
  });

  it('未列入顺序的节点按默认顺序追加在末尾', () => {
    const order = { [childOrderKey('/ws', '')]: ['vite.config.ts'] };

    expect(applyChildOrder(tree, '/ws', '', order).map((item) => item.name)).toEqual([
      'vite.config.ts',
      'src',
      'docs',
      'README.md',
    ]);
  });

  it('子目录使用自己的键，不串用父目录顺序', () => {
    const order = {
      [childOrderKey('/ws', '')]: ['src', 'docs', 'README.md', 'vite.config.ts'],
      [childOrderKey('/ws', 'src')]: ['b.ts', 'a.ts'],
    };

    const result = applyChildOrder(tree, '/ws', '', order);
    const src = result.find((item) => item.name === 'src');

    expect(src?.children.map((item) => item.name)).toEqual(['b.ts', 'a.ts']);
  });
});

describe('insertChildName', () => {
  it('把子项插到目标项之前并去掉重复', () => {
    expect(insertChildName(['a', 'b', 'c'], 'c', 'b', 'before')).toEqual(['a', 'c', 'b']);
  });

  it('把子项插到目标项之后', () => {
    expect(insertChildName(['a', 'b', 'c'], 'a', 'b', 'after')).toEqual(['b', 'a', 'c']);
  });

  it('目标不在列表时追加到末尾', () => {
    expect(insertChildName(['a'], 'b', 'missing', 'before')).toEqual(['a', 'b']);
  });
});
