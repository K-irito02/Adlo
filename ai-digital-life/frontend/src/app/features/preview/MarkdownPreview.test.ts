import { describe, expect, it } from 'vitest';
import { renderMarkdownPreviewHtml, splitFrontmatter } from './markdownPreviewUtils';

function collectRanges(html: string): [number, number][] {
  const ranges: [number, number][] = [];
  const re = /data-source-line-start="(\d+)" data-source-line-end="(\d+)"/g;
  let match = re.exec(html);
  while (match) {
    ranges.push([Number(match[1]), Number(match[2])]);
    match = re.exec(html);
  }
  return ranges;
}

describe('MarkdownPreview', () => {
  it('adds source-line anchors to rendered headings', () => {
    const html = renderMarkdownPreviewHtml('# 标题\n\n## 重复\n\n## 重复');

    expect(html).toContain('data-source-line="1"');
    expect(html).toContain('id="标题"');
    expect(html).toContain('data-source-line="3"');
    expect(html).toContain('id="重复"');
    expect(html).toContain('data-source-line="5"');
    expect(html).toContain('id="重复-1"');
  });

  it('folds duplicate heading text into github-style suffixed slugs', () => {
    const html = renderMarkdownPreviewHtml('# x\n\n# x\n\n# x');
    expect(html).toContain('id="x"');
    expect(html).toContain('id="x-1"');
    expect(html).toContain('id="x-2"');
  });

  it('slugifies latin headings (lowercase, spaces to hyphens, strip punctuation)', () => {
    const html = renderMarkdownPreviewHtml('# Hello, World!');
    expect(html).toContain('id="hello-world"');
  });

  it('preserves hyphens and underscores in slugs (github fidelity)', () => {
    expect(renderMarkdownPreviewHtml('# my-file')).toContain('id="my-file"');
    expect(renderMarkdownPreviewHtml('# foo_bar')).toContain('id="foo_bar"');
  });

  it('preserves CJK heading text while stripping CJK punctuation', () => {
    expect(renderMarkdownPreviewHtml('# 中文标题')).toContain('id="中文标题"');
    expect(renderMarkdownPreviewHtml('# 一、二')).toContain('id="一二"');
  });

  it('does not autolink bare domain-like text such as AGENTS.md', () => {
    const html = renderMarkdownPreviewHtml('已同步 AGENTS.md 文件');
    expect(html).not.toContain('<a href');
  });

  it('still autolinks explicit http(s) URLs', () => {
    const html = renderMarkdownPreviewHtml('详见 http://example.com/a 页');
    expect(html).toContain('<a href="http://example.com/a">');
  });

  it('renders leading frontmatter as a generic property card', () => {
    const content = [
      '---',
      'name: demo-skill',
      'description: 通用描述',
      'tags: [alpha, beta]',
      'globs:',
      '  - "**/*.ts"',
      'alwaysApply: true',
      '---',
      '',
      '# 标题',
    ].join('\n');
    const html = renderMarkdownPreviewHtml(content);

    expect(html).toContain('<dl class="adl-md-frontmatter">');
    expect(html).toContain('<dt>name</dt>');
    expect(html).toContain('demo-skill');
    expect(html).toContain('<dt>description</dt>');
    expect(html).toContain('通用描述');
    // 行内列表与块列表统一渲染为 chip
    expect(html).toContain('adl-md-frontmatter__chip">alpha<');
    expect(html).toContain('adl-md-frontmatter__chip">**/*.ts<');
    // 正文照常渲染，且不再把 frontmatter 的 --- 当分隔线
    expect(html).toContain('<h1');
    expect(html).not.toContain('<hr');
  });

  it('does not special-case known frontmatter keys', () => {
    const html = renderMarkdownPreviewHtml('---\nfoo: bar\n自定义字段: 值\n---\n正文');
    expect(html).toContain('<dt>foo</dt>');
    expect(html).toContain('<dt>自定义字段</dt>');
  });

  it('offsets source lines after stripping frontmatter', () => {
    const html = renderMarkdownPreviewHtml('---\na: b\nc: d\n---\n# 标题');
    // frontmatter 3 行 + 空行，标题落在源文件第 5 行
    expect(html).toContain('data-source-line="5"');
    expect(html).toContain('data-source-line-start="5" data-source-line-end="5"');
  });

  it('leaves documents without frontmatter untouched', () => {
    const html = renderMarkdownPreviewHtml('# 标题\n\n---\n\n正文');
    expect(html).not.toContain('adl-md-frontmatter');
    expect(html).toContain('<hr');
  });

  it('falls back to raw markdown when the block is not key/value', () => {
    const html = renderMarkdownPreviewHtml('---\n这不是键值\n---\n正文');
    expect(html).not.toContain('adl-md-frontmatter');
    expect(html).toContain('这不是键值');
  });

  it('escapes HTML in frontmatter values', () => {
    const html = renderMarkdownPreviewHtml('---\nname: <img src=x onerror=alert(1)>\n---\n正文');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('keeps block scalar line breaks', () => {
    const { entries } = splitFrontmatter('---\ndescription: |\n  第一行\n  第二行\n---\n正文');
    expect(entries[0]?.values[0]).toBe('第一行\n第二行');
  });

  it('maps source line ranges on every block element (jump to arbitrary line)', () => {
    const content = [
      '# 标题',
      '',
      '段落一',
      '续行',
      '',
      '- 列表甲',
      '- 列表乙',
      '',
      '```ts',
      'const a = 1;',
      '```',
    ].join('\n');
    const html = renderMarkdownPreviewHtml(content);

    // 单行块：start === end
    expect(html).toContain('data-source-line-start="1" data-source-line-end="1"');
    // 跨行段落：3..4
    expect(html).toContain('<p data-source-line-start="3" data-source-line-end="4"');
    // 列表项
    expect(html).toContain('data-source-line-start="6" data-source-line-end="6"');
    expect(html).toContain('data-source-line-start="7" data-source-line-end="8"');

    // 除空行外每一行都被某个块的闭区间覆盖（跳转判据 start <= line <= end）
    const ranges = collectRanges(html);
    expect(ranges.length).toBeGreaterThan(3);
    for (const line of [1, 3, 4, 6, 7, 9, 10]) {
      expect(ranges.some(([start, end]) => start <= line && line <= end)).toBe(true);
    }
  });
});
