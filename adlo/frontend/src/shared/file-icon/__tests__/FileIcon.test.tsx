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

  it('handles special filename Dockerfile', () => {
    render(<FileIcon fileName="Dockerfile" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });

  it('handles special filename package.json', () => {
    render(<FileIcon fileName="package.json" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });
});

/**
 * 回归保护：点号配置文件必须有可辨识的「配置」图形，而不是退化成通用文档。
 * 断言落到具体 path 数据 —— 回退实现（去掉点号分支 / 换回旧配置图标）必须变红。
 */
const CONFIG_GLYPH_PATHS = ['M9 13h6', 'M9 17h4'];

function pathData(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('svg path')).map(
    (path) => path.getAttribute('d') ?? '',
  );
}

describe('FileIcon dotfile fallback', () => {
  it.each(['.editorconfig', '.gitattributes', '.gitignore', '.prettierignore'])(
    'renders the config glyph for %s',
    (fileName) => {
      const { container } = render(<FileIcon fileName={fileName} />);
      const paths = pathData(container);
      for (const glyph of CONFIG_GLYPH_PATHS) {
        expect(paths).toContain(glyph);
      }
    },
  );

  it('keeps extension-based icons for dotfiles that carry a real extension', () => {
    const { container } = render(<FileIcon fileName=".eslintrc.json" />);
    const paths = pathData(container);
    for (const glyph of CONFIG_GLYPH_PATHS) {
      expect(paths).not.toContain(glyph);
    }
  });

  it('does not apply the config glyph to unknown extensions', () => {
    const { container } = render(<FileIcon fileName="data.xyz" />);
    const paths = pathData(container);
    for (const glyph of CONFIG_GLYPH_PATHS) {
      expect(paths).not.toContain(glyph);
    }
  });

  it('renders the extension-less fallback without question-mark artifacts', () => {
    const { container } = render(<FileIcon fileName="LICENSE" />);
    const paths = pathData(container);
    expect(paths).not.toContain('M12 13v1');
    expect(paths).not.toContain('M12 16v.01');
  });
});

/**
 * 回归保护：项目自带的冷门扩展名图标必须排在 react-symbols 之前 —— 后者对任意
 * 扩展名都会渲染通用文档，顺序一旦回退，这些图标就永远不可达。
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
