import { describe, expect, it } from 'vitest';
import { renderMarkdownPreviewHtml } from './markdownPreviewUtils';

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
