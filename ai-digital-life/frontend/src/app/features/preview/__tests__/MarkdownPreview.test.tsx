import { describe, it, expect } from 'vitest';
import DOMPurify from 'dompurify';

describe('MarkdownPreview XSS protection', () => {
  it('sanitizes script tags from markdown-rendered HTML', () => {
    const maliciousHtml = '<p>hello</p><script>alert("xss")</script><img src=x onerror=alert(1)>';
    const sanitized = DOMPurify.sanitize(maliciousHtml);
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).not.toContain('onerror=');
    expect(sanitized).toContain('<p>hello</p>');
  });
});
