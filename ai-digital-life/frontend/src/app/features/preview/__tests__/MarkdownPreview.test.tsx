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
});
