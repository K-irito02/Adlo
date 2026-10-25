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

    expect(html).toContain('<dl class="adl-md-frontmatter" ');
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

  it('tolerates CRLF line endings', () => {
    const { entries, body, lineOffset } = splitFrontmatter('---\r\na: b\r\n---\r\n# T');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.values[0]).toBe('b');
    expect(lineOffset).toBe(3);
    expect(body).toBe('# T');
  });

  it('strips a UTF-8 BOM before detecting frontmatter', () => {
    const html = renderMarkdownPreviewHtml('\uFEFF---\na: b\n---\n# T');
    expect(html).toContain('adl-md-frontmatter');
    expect(html).toContain('<dt>a</dt>');
  });

  it('renders empty / partially empty lists without empty chips', () => {
    const html = renderMarkdownPreviewHtml('---\ntags: []\nglobs: [a,]\n---\n正文');
    expect(html).not.toContain('adl-md-frontmatter__chip"></span>');
    expect(html).toContain('adl-md-frontmatter__chip">a<');
  });

  it('splits quoted commas in inline lists', () => {
    const { entries } = splitFrontmatter('---\ntags: [a, "b, c"]\n---\n');
    expect(entries[0]?.values).toEqual(['a', 'b, c']);
  });

  it('anchors the card to the frontmatter line range (search jump)', () => {
    const html = renderMarkdownPreviewHtml('---\na: b\nc: d\n---\n# T');
    expect(html).toContain('data-source-line-start="1" data-source-line-end="4"');
  });

  it('counts the closing delimiter when the file ends without a newline', () => {
    const { lineOffset, body } = splitFrontmatter('---\na: b\n---');
    expect(lineOffset).toBe(3);
    expect(body).toBe('');
  });

  it('folds block scalars without a stray leading space after blank lines', () => {
    const { entries } = splitFrontmatter('---\nd: >\n  a\n  b\n\n  c\n---\n');
    expect(entries[0]?.values[0]).toBe('a b\nc');
  });

  it('accepts keep-chomping before the indentation indicator', () => {
    const kept = splitFrontmatter('---\nd: |+2\n  a\n\n---\n');
    expect(kept.entries[0]?.values[0]).toBe('a\n');
    const stripped = splitFrontmatter('---\nd: |-2\n  a\n\n---\n');
    expect(stripped.entries[0]?.values[0]).toBe('a');
  });

  it('still renders a heading when a BOM file has no frontmatter', () => {
    const html = renderMarkdownPreviewHtml('\uFEFF# T');
    expect(html).toContain('<h1');
  });

  it('applies block scalar chomping indicators', () => {
    const kept = splitFrontmatter('---\nd: |-\n  l1\n  l2\n---\n');
    expect(kept.entries[0]?.values[0]).toBe('l1\nl2');
    const clipped = splitFrontmatter('---\nd: |\n  l1\n\nn: x\n---\n');
    expect(clipped.entries[0]?.values[0]).toBe('l1');
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
