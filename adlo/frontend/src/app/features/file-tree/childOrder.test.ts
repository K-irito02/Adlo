import { describe, expect, it } from 'vitest';
import type { FileTreeRenderableNode } from './fileTree.utils';
import {
  applyChildOrder,
  childOrderKey,
  dropChildOrderUnder,
  insertChildName,
  remapChildOrderForRename,
} from './childOrder';

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

describe('remapChildOrderForRename', () => {
  it('目录改名后键前缀与父目录里的名字同步更新', () => {
    const order = {
      [childOrderKey('/ws', '')]: ['src', 'docs'],
      [childOrderKey('/ws', 'src')]: ['b.ts', 'a.ts'],
      [childOrderKey('/ws', 'src/app')]: ['x.ts'],
      [childOrderKey('/ws', 'other')]: ['z.ts'],
    };

    const next = remapChildOrderForRename(order, '/ws', 'src', 'lib');

    expect(next[childOrderKey('/ws', '')]).toEqual(['lib', 'docs']);
    expect(next[childOrderKey('/ws', 'lib')]).toEqual(['b.ts', 'a.ts']);
    expect(next[childOrderKey('/ws', 'lib/app')]).toEqual(['x.ts']);
    expect(next[childOrderKey('/ws', 'src')]).toBeUndefined();
    expect(next[childOrderKey('/ws', 'other')]).toEqual(['z.ts']);
  });

  it('其他工作区的同名键不受影响', () => {
    const order = { [childOrderKey('/other', 'src')]: ['keep'] };

    const next = remapChildOrderForRename(order, '/ws', 'src', 'lib');

    expect(next).toBe(order);
    expect(next[childOrderKey('/other', 'src')]).toEqual(['keep']);
  });
});

describe('dropChildOrderUnder', () => {
  it('删除目录时移除自身/子孙键，并从父目录顺序剔除名字', () => {
    const order = {
      [childOrderKey('/ws', '')]: ['src', 'docs'],
      [childOrderKey('/ws', 'src')]: ['a'],
      [childOrderKey('/ws', 'src/app')]: ['b'],
      [childOrderKey('/ws', 'docs')]: ['c'],
    };

    const next = dropChildOrderUnder(order, '/ws', 'src');

    expect(next[childOrderKey('/ws', '')]).toEqual(['docs']);
    expect(next[childOrderKey('/ws', 'src')]).toBeUndefined();
    expect(next[childOrderKey('/ws', 'src/app')]).toBeUndefined();
    expect(next[childOrderKey('/ws', 'docs')]).toEqual(['c']);
  });

  it('没有匹配的键时返回原对象', () => {
    const order = { [childOrderKey('/ws', 'docs')]: ['c'] };

    expect(dropChildOrderUnder(order, '/ws', 'src')).toBe(order);
  });
});
