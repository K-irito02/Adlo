import { describe, it, expect } from 'vitest';
import { isDownloadUrl } from '../downloadUrl';

describe('isDownloadUrl', () => {
  it('returns false for empty input', () => {
    expect(isDownloadUrl('')).toBe(false);
  });

  it('detects known download extensions', () => {
    expect(isDownloadUrl('https://cdn.example.com/app/setup.exe')).toBe(true);
    expect(isDownloadUrl('https://cdn.example.com/app/archive.zip')).toBe(true);
    expect(isDownloadUrl('https://files.example.com/report.pdf')).toBe(true);
    expect(isDownloadUrl('https://files.example.com/installer.msi')).toBe(true);
  });

  it('does not treat .js as a download extension (inlined web resource)', () => {
    expect(isDownloadUrl('https://cdn.example.com/app/main.js')).toBe(false);
    expect(isDownloadUrl('https://example.com/bundle.min.js')).toBe(false);
  });

  it('ignores query strings and fragments for extension detection', () => {
    expect(isDownloadUrl('https://cdn.example.com/app.zip?token=abc#frag')).toBe(true);
  });

  it('does not treat plain web resources as downloads', () => {
    expect(isDownloadUrl('https://example.com')).toBe(false);
    expect(isDownloadUrl('https://example.com/index.html')).toBe(false);
    expect(isDownloadUrl('https://example.com/about')).toBe(false);
    expect(isDownloadUrl('https://example.com/style.css')).toBe(false);
  });

  it('detects download= query parameter', () => {
    expect(isDownloadUrl('https://example.com/api/export?download=1')).toBe(true);
    expect(isDownloadUrl('https://example.com/export?download=true')).toBe(true);
    expect(isDownloadUrl('https://example.com/page.html?download=1')).toBe(true);
  });

  it('detects explicit download path segments', () => {
    expect(isDownloadUrl('https://example.com/download/package')).toBe(true);
    expect(isDownloadUrl('https://example.com/files/readme')).toBe(true);
    expect(isDownloadUrl('https://example.com/attachments/photo')).toBe(true);
    expect(isDownloadUrl('https://example.com/export/data')).toBe(true);
  });

  it('does not match download path keywords when they appear only in the host', () => {
    expect(isDownloadUrl('https://files.example.com/page')).toBe(false);
    expect(isDownloadUrl('https://download.cdn.example.com/page')).toBe(false);
  });

  it('detects file/attachment query combined with download-related path', () => {
    expect(isDownloadUrl('https://example.com/download?id=1&file=catalog')).toBe(true);
    expect(isDownloadUrl('https://example.com/export?attachment=report')).toBe(true);
    expect(isDownloadUrl('https://example.com/files?file=data')).toBe(true);
  });

  it('does not treat a plain file= query on an unrelated path as a download', () => {
    expect(isDownloadUrl('https://example.com/editor?file=main.js')).toBe(false);
    expect(isDownloadUrl('https://example.com/viewer?file=readme.md')).toBe(false);
  });

  it('returns false for malformed URLs without triggering', () => {
    expect(isDownloadUrl('not-a-url')).toBe(false);
    expect(isDownloadUrl('')).toBe(false);
  });
});
