import { describe, it, expect } from 'vitest';
import DOMPurify from 'dompurify';

describe('DocxPreview sanitization', () => {
  it('passes safe HTML through without damage', () => {
    const safeHtml = '<h1>Title</h1><p>paragraph</p><code>inline code</code>';
    const sanitized = DOMPurify.sanitize(safeHtml);
    expect(sanitized).toContain('<h1>Title</h1>');
    expect(sanitized).toContain('<p>paragraph</p>');
    expect(sanitized).toContain('<code>inline code</code>');
  });
});
