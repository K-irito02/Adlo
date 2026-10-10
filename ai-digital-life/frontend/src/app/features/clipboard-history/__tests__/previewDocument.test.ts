import { describe, expect, it } from 'vitest';
import { injectPreviewStyles, previewDocumentCss } from '../previewDocument';

const CSS = '.x{}';

describe('injectPreviewStyles', () => {
  it('inserts into <head> when present', () => {
    const out = injectPreviewStyles(
      '<html><head><title>t</title></head><body>b</body></html>',
      CSS,
    );
    expect(out).toBe(
      `<html><head><style data-adl-preview>${CSS}</style><title>t</title></head><body>b</body></html>`,
    );
  });

  it('falls back to <body> when there is no <head>', () => {
    const out = injectPreviewStyles('<html><body>b</body></html>', CSS);
    expect(out).toBe(`<html><body><style data-adl-preview>${CSS}</style>b</body></html>`);
  });

  it('falls back to <html> for a document with neither', () => {
    const out = injectPreviewStyles('<html lang="en">b</html>', CSS);
    expect(out).toBe(`<html lang="en"><style data-adl-preview>${CSS}</style>b</html>`);
  });

  it('prepends for a bare fragment', () => {
    expect(injectPreviewStyles('<p>x</p>', CSS)).toBe(
      `<style data-adl-preview>${CSS}</style><p>x</p>`,
    );
  });

  it('never injects before the doctype (would force quirks mode)', () => {
    const out = injectPreviewStyles('<!DOCTYPE html><html><head></head><body>b</body></html>', CSS);
    expect(out.indexOf('<!DOCTYPE')).toBe(0);
    expect(out.indexOf('<style')).toBeGreaterThan(out.indexOf('<head>'));
  });

  it('matches tags case-insensitively', () => {
    const out = injectPreviewStyles('<HTML><HEAD></HEAD></HTML>', CSS);
    expect(out).toBe(`<HTML><HEAD><style data-adl-preview>${CSS}</style></HEAD></HTML>`);
  });
});

describe('previewDocumentCss', () => {
  it('makes the document background transparent so the themed host surface shows through', () => {
    const css = previewDocumentCss('#222222');
    expect(css).toContain('background: transparent !important');
  });

  it('carries the host theme foreground for text that sets no colour of its own', () => {
    expect(previewDocumentCss('#d8d8d8')).toContain('color: #d8d8d8');
  });

  it('rewrites both native scrollbar axes to the project look', () => {
    const css = previewDocumentCss('#222');
    expect(css).toContain('::-webkit-scrollbar {');
    expect(css).toContain('::-webkit-scrollbar-thumb');
    // 横向（height）也要有，否则宽内容仍会用系统横条
    expect(css).toMatch(/height:\s*10px/);
  });

  it('uses the host surface as the opaque base when provided (dark rich preview)', () => {
    const css = previewDocumentCss('#d8d8d8', { dark: true, surface: '#242427' });
    expect(css).toContain('background: #242427 !important');
    // 内层自带白底容器打掉（图片与矢量图形除外），透出宿主编辑底色
    expect(css).toContain('background-color: transparent !important');
    expect(css).toContain(':not(img)');
  });

  it('keeps inner backgrounds untouched in light mode', () => {
    const css = previewDocumentCss('#222222', { dark: false, surface: '#f0f0f1' });
    expect(css).toContain('background: #f0f0f1 !important');
    expect(css).not.toContain('background-color: transparent !important');
  });

  it('forces no-wrap inside the document when requested', () => {
    const css = previewDocumentCss('#d8d8d8', { dark: true, surface: '#242427', nowrap: true });
    expect(css).toContain('white-space: pre !important');
    expect(css).toContain('overflow-x: auto !important');
  });

  it('does not inject no-wrap rules when wrapping', () => {
    const css = previewDocumentCss('#d8d8d8', { dark: true, surface: '#242427', nowrap: false });
    expect(css).not.toContain('white-space: pre !important');
  });

  it('keeps content off the container edges like the other modes', () => {
    expect(previewDocumentCss('#222')).toContain('padding: 12px');
  });

  it('follows the host zoom only when it differs from 1', () => {
    expect(previewDocumentCss('#222', { zoom: 1 })).not.toContain('zoom:');
    expect(previewDocumentCss('#222', { zoom: 1.5 })).toContain('zoom: 1.5');
  });

  it('never injects zoom for zero, negative or non-finite values', () => {
    for (const zoom of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(previewDocumentCss('#222', { zoom })).not.toContain('zoom:');
    }
  });

  it('falls back safely for non-hex colors', () => {
    const css = previewDocumentCss('</style><script>', { surface: 'red"><img' });
    expect(css).not.toContain('</style><script>');
    expect(css).toContain('background: transparent !important');
  });
});
