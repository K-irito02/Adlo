import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { FileIcon } from '../FileIcon';

describe('FileIcon', () => {
  it('renders without crashing for known extension', () => {
    render(<FileIcon fileName="report.pdf" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });

  it('renders without crashing for unknown extension', () => {
    render(<FileIcon fileName="file.xyz" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });

  it('renders fallback for niche extension hta', () => {
    render(<FileIcon fileName="script.hta" />);
    const icon = document.querySelector('svg');
    expect(icon).toBeTruthy();
  });

  it('renders without crashing for no extension', () => {
    render(<FileIcon fileName="Makefile" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });

  it('applies custom size', () => {
    render(<FileIcon fileName="test.ts" size={24} />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });

  it('applies custom className', () => {
    render(<FileIcon fileName="test.py" className="custom-class" />);
    const el = document.querySelector('.custom-class');
    expect(el).toBeTruthy();
  });

  it('handles filenames with multiple dots', () => {
    render(<FileIcon fileName="archive.tar.gz" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });

  it('handles hidden files', () => {
    render(<FileIcon fileName=".gitignore" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });

  it('handles package.json', () => {
    render(<FileIcon fileName="package.json" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });
});

/**
 * 项目「配置」字形的两条内部 path：**库没有点名图标的**点号文件必须画出它们。
 * 已知点号名（`.gitignore` / `.editorconfig` …）改由库图标接管，见下方用例。
 */
const CONFIG_GLYPH_PATHS = ['M9 13h6', 'M9 17h4'];

/** react-symbols 的 `DefaultFileIcon`（未识别名的兜底文档）骨架。 */
const LIBRARY_DEFAULT_DOC_PATHS = [
  'M6 3a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8a1 1 0 00-.375-.78l-5-4A1 1 0 0013 3H6z',
  'M12 4v5h6',
];

function pathData(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('svg path')).map(
    (path) => path.getAttribute('d') ?? '',
  );
}

/**
 * 断言命中的是「库的专属图标」而不是两种退化形态：
 * 项目配置字形（根节点 `stroke="currentColor"`）或库的通用文档（`DefaultFileIcon` 骨架）。
 */
function expectLibrarySymbol(container: HTMLElement) {
  const paths = pathData(container);
  expect(paths.length).toBeGreaterThan(0);
  expect(container.querySelector('svg')?.getAttribute('stroke')).toBeNull();
  for (const glyph of CONFIG_GLYPH_PATHS) {
    expect(paths).not.toContain(glyph);
  }
  for (const glyph of LIBRARY_DEFAULT_DOC_PATHS) {
    expect(paths).not.toContain(glyph);
  }
}

describe('FileIcon dotfile fallback', () => {
  it.each([
    // 库（autoAssign）没有收录这些名字，才会走到项目配置字形
    '.adlprobe',
    '.randomdotfile',
    '.myconf',
  ])('renders the project config glyph when the library has no icon for %s', (fileName) => {
    const { container } = render(<FileIcon fileName={fileName} />);
    const paths = pathData(container);
    for (const glyph of CONFIG_GLYPH_PATHS) {
      expect(paths).toContain(glyph);
    }
  });

  // 库自带的点名图标优先：用户要求「库有就用库的」。
  it.each(['.editorconfig', '.gitattributes', '.gitignore', '.prettierignore'])(
    'prefers the library symbol for %s',
    (fileName) => {
      const { container } = render(<FileIcon fileName={fileName} />);
      expectLibrarySymbol(container);
    },
  );

  // autoAssign 在扩展名层对点号名同样开启：同一族的单点/双点名字必须拿到**同一个**库图标。
  // 只做"不是配置字形、不是默认文档"的否定断言会假绿（关掉 autoAssign 时 `.eslintrc.json`
  // 会退到 JSON 图标，照样满足否定条件），所以成对比较 path 数组。
  it.each([
    ['.eslintrc', '.eslintrc.json'],
    ['.env', '.env.local'],
  ])('keeps %s and %s on the same library icon', (singleDot, doubleDot) => {
    const single = render(<FileIcon fileName={singleDot} />);
    const doubled = render(<FileIcon fileName={doubleDot} />);
    expectLibrarySymbol(single.container);
    expectLibrarySymbol(doubled.container);
    expect(pathData(doubled.container)).toEqual(pathData(single.container));
    single.unmount();
    doubled.unmount();
  });

  it('does not apply the config glyph to unknown extensions', () => {
    const { container } = render(<FileIcon fileName="data.xyz" />);
    const paths = pathData(container);
    expect(paths.length).toBeGreaterThan(0);
    for (const glyph of CONFIG_GLYPH_PATHS) {
      expect(paths).not.toContain(glyph);
    }
  });

  it('renders the generic document for extension-less names', () => {
    const { container } = render(<FileIcon fileName="Dockerfile" />);
    const paths = pathData(container);
    // 专项文件名层已删除：旧表用的 docker/config 不是合法 defaultStyles 键，
    // Dockerfile 与 LICENSE 一样落到通用文档（两条骨架 path）。
    expect(paths).toHaveLength(2);
    expect(paths).toContain('M14 3v6h6');
  });

  it('renders the plain document skeleton for extension-less files', () => {
    const { container } = render(<FileIcon fileName="LICENSE" />);
    const paths = pathData(container);
    // 正向断言：文档骨架必须真的画出来（只断言"没有问号"时，返回空 SVG 也会假绿）
    expect(paths).toContain('M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z');
    expect(paths).toContain('M14 3v6h6');
    expect(paths).toHaveLength(2);
    expect(paths).not.toContain('M12 13v1');
    expect(paths).not.toContain('M12 16v.01');
  });

  // 回归保护：扩展名查找必须走自有属性。`a.constructor` / `a.__proto__` 是
  // Object.prototype 的真实成员名，未防护时会取到函数/对象并渲染崩溃。
  it.each(['a.constructor', 'a.__proto__'])(
    'does not resolve %s through the prototype chain',
    (fileName) => {
      const { container } = render(<FileIcon fileName={fileName} />);
      const paths = pathData(container);
      // 落项目通用文档（库的 DefaultFileIcon 是另一种骨架，用折角 path 区分）
      expect(paths).toContain('M14 3v6h6');
      expect(paths).toHaveLength(2);
    },
  );

  // 驼峰原型名（`toString` / `valueOf`）小写后并不存在于 Object.prototype，未防护也不会崩；
  // 这两条锁的是"小写化后形似原型成员的名字一律按非法扩展名处理"这一更宽判据。
  it.each(['a.toString', 'a.valueOf'])(
    'treats lowercased prototype-like extension %s as unknown',
    (fileName) => {
      const { container } = render(<FileIcon fileName={fileName} />);
      const paths = pathData(container);
      expect(paths).toContain('M14 3v6h6');
      expect(paths).toHaveLength(2);
    },
  );

  // 点号文件走 Tier 2，必须同样挡掉伪名，否则库内部索引会取到 Object.prototype。
  it.each(['.constructor', '.__proto__', '.CONSTRUCTOR'])(
    'does not resolve the dotfile %s through the prototype chain',
    (fileName) => {
      const { container } = render(<FileIcon fileName={fileName} />);
      const paths = pathData(container);
      for (const glyph of CONFIG_GLYPH_PATHS) {
        expect(paths).toContain(glyph);
      }
    },
  );
});

/**
 * 回归保护：项目自带的冷门扩展名图标必须排在 react-symbols 之前 —— 后者对任意
 * **未识别的**扩展名都会回退到通用文档（不会返回空），顺序一旦回退，这些项目图标
 * 就永远不可达。
 */
describe('FileIcon niche extension fallbacks', () => {
  it.each(['settings.conf', 'tsconfig.jsonc'])('renders the config glyph for %s', (fileName) => {
    const { container } = render(<FileIcon fileName={fileName} />);
    const paths = pathData(container);
    for (const glyph of CONFIG_GLYPH_PATHS) {
      expect(paths).toContain(glyph);
    }
  });

  it('renders the script glyph for hta', () => {
    const { container } = render(<FileIcon fileName="legacy.hta" />);
    expect(pathData(container)).toContain('M9 15l2 2 3-4');
  });
});
