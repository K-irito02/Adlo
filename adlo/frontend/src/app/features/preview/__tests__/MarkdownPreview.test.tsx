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

  it('routes file:// links through onOpenFile handler, not openExternal', () => {
    const onOpenFile = vi.fn();
    const openExternal = vi.fn();
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      window: { openExternal },
    };
    const { container } = render(<MarkdownPreview content={''} linkHandlers={{ onOpenFile }} />);
    // 直接向预览 DOM 注入 file:// 锚点，专测点击委托的路由分支
    // （正文渲染链另有「file: 保留」单测覆盖端到端）。
    const preview = container.querySelector('.adl-markdown-preview')!;
    preview.innerHTML = '<a href="file:///C:/ws/a.md">doc</a>';
    fireEvent.click(preview.querySelector('a')!);
    expect(onOpenFile).toHaveBeenCalledWith('file:///C:/ws/a.md');
    expect(openExternal).not.toHaveBeenCalled();
    delete (window as unknown as { digitalLife?: unknown }).digitalLife;
  });

  it('keeps file:// links through sanitize so they reach click delegation', () => {
    // 复审 N1：DOMPurify 默认剥掉 file: 协议；此处放行 file: 后正文 file://
    // 链接必须保留为可点击锚点（点击仍走 preventDefault + 内部路由）。
    const onOpenFile = vi.fn();
    const { container } = render(
      <MarkdownPreview content={'[doc](file:///C:/ws/a.md)'} linkHandlers={{ onOpenFile }} />,
    );
    const anchor = container.querySelector('a[href^="file:"]');
    expect(anchor).not.toBeNull();
    fireEvent.click(anchor!);
    expect(onOpenFile).toHaveBeenCalledWith('file:///C:/ws/a.md');
  });

  it('matches anchors case- and space-insensitively in the slug fallback', () => {
    const { container } = render(
      <MarkdownPreview content={'# Foo\n\n[go](#Foo)\n\n# Hello World\n\n[go](#Hello%20World)'} />,
    );
    const spies = [...container.querySelectorAll('h1')].map((h) => {
      const spy = vi.fn();
      (h as HTMLElement).scrollIntoView = spy;
      return spy;
    });
    const anchors = container.querySelectorAll('a');
    fireEvent.click(anchors[0]!);
    expect(spies[0]).toHaveBeenCalled();
    fireEvent.click(anchors[1]!);
    expect(spies[1]).toHaveBeenCalled();
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
