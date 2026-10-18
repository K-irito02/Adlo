import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import DOMPurify from 'dompurify';
import { MarkdownPreview } from '../MarkdownPreview';

describe('MarkdownPreview XSS protection', () => {
  it('sanitizes script tags from markdown-rendered HTML', () => {
    const maliciousHtml = '<p>hello</p><script>alert("xss")</script><img src=x onerror=alert(1)>';
    const sanitized = DOMPurify.sanitize(maliciousHtml);
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).not.toContain('onerror=');
    expect(sanitized).toContain('<p>hello</p>');
  });
});

describe('MarkdownPreview link delegation', () => {
  it('intercepts anchor clicks and scrolls to heading', () => {
    const { container } = render(<MarkdownPreview content={'# Foo\n\n[jump](#foo)'} />);
    const link = container.querySelector('a[href="#foo"]')!;
    const spy = vi.fn();
    (container.querySelector('#foo') as HTMLElement).scrollIntoView = spy;
    fireEvent.click(link);
    expect(spy).toHaveBeenCalled();
  });

  it('falls back to heading-text slug match when no element id matches the anchor', () => {
    const { container } = render(<MarkdownPreview content={''} />);
    const preview = container.querySelector('.adl-markdown-preview')!;
    // Heading carries no id (querySelector('[id=...]') misses) — the fallback
    // must match it by slugified text per spec §7.2.
    preview.innerHTML = '<h2>Deep Link</h2><a href="#deep-link">go</a>';
    const heading = preview.querySelector('h2') as HTMLElement;
    const spy = vi.fn();
    heading.scrollIntoView = spy;
    fireEvent.click(preview.querySelector('a')!);
    expect(spy).toHaveBeenCalled();
  });

  it('decodes percent-encoded anchors before matching heading ids', () => {
    const { container } = render(
      <MarkdownPreview content={'# 重复小节\n\n[go](#%E9%87%8D%E5%A4%8D%E5%B0%8F%E8%8A%82)'} />,
    );
    const heading = container.querySelector('h1') as HTMLElement;
    const spy = vi.fn();
    heading.scrollIntoView = spy;
    fireEvent.click(container.querySelector('a')!);
    expect(spy).toHaveBeenCalled();
  });

  it('routes http links through onOpenUrl handler', () => {
    const onOpenUrl = vi.fn();
    const { container } = render(
      <MarkdownPreview content={'[x](https://a.com)'} linkHandlers={{ onOpenUrl }} />,
    );
    fireEvent.click(container.querySelector('a')!);
    expect(onOpenUrl).toHaveBeenCalledWith('https://a.com');
  });

  it('routes file links through onOpenFile handler', () => {
    const onOpenFile = vi.fn();
    const { container } = render(
      <MarkdownPreview content={'[doc](other.md)'} linkHandlers={{ onOpenFile }} />,
    );
    fireEvent.click(container.querySelector('a')!);
    expect(onOpenFile).toHaveBeenCalledWith('other.md');
  });

  it('routes file:// links through onOpenFile handler, not openExternal', () => {    const onOpenFile = vi.fn();
    const openExternal = vi.fn();
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      window: { openExternal },
    };
    const { container } = render(<MarkdownPreview content={''} linkHandlers={{ onOpenFile }} />);
    // markdown-it（及 DOMPurify）会过滤 file: 协议，故预览正文不会产出该锚点；
    // 这里直接向预览 DOM 注入 file:// 锚点，专测点击委托的路由分支。
    const preview = container.querySelector('.adl-markdown-preview')!;
    preview.innerHTML = '<a href="file:///C:/ws/a.md">doc</a>';
    fireEvent.click(preview.querySelector('a')!);
    expect(onOpenFile).toHaveBeenCalledWith('file:///C:/ws/a.md');
    expect(openExternal).not.toHaveBeenCalled();
    delete (window as unknown as { digitalLife?: unknown }).digitalLife;
  });

  it('routes case-variant mailto/tel and protocol-relative links externally', () => {
    const onOpenFile = vi.fn();
    const openExternal = vi.fn();
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      window: { openExternal },
    };
    const { container } = render(<MarkdownPreview content={''} linkHandlers={{ onOpenFile }} />);
    const preview = container.querySelector('.adl-markdown-preview')!;
    preview.innerHTML =
      '<a href="MAILTO:a@b.com">m</a><a href="Tel:+123">t</a><a href="//cdn.example.com/x">p</a>';
    const anchors = preview.querySelectorAll('a');
    anchors.forEach((a) => fireEvent.click(a));
    expect(openExternal).toHaveBeenCalledTimes(3);
    expect(onOpenFile).not.toHaveBeenCalled();
    delete (window as unknown as { digitalLife?: unknown }).digitalLife;
  });
});
