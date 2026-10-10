import { describe, expect, it } from 'vitest';
import { categorizeFile, isOfficeTempFile } from '../fileTypeRouter';

describe('categorizeFile media/office split', () => {
  it('routes common image extensions to image', () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'svg', 'tif', 'heic']) {
      expect(categorizeFile(`assets/photo.${ext}`)).toBe('image');
    }
  });

  it('routes common audio extensions to audio', () => {
    for (const ext of ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma', 'mid']) {
      expect(categorizeFile(`assets/sound.${ext}`)).toBe('audio');
    }
  });

  it('routes common video extensions to video', () => {
    for (const ext of ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'wmv', 'mpg', '3gp']) {
      expect(categorizeFile(`assets/素材/视频/clip.${ext}`)).toBe('video');
    }
  });

  it('routes spreadsheet extensions to spreadsheet', () => {
    for (const ext of ['xls', 'xlsx', 'ods', 'csv']) {
      expect(categorizeFile(`docs/report.${ext}`)).toBe('spreadsheet');
    }
  });

  it('routes presentation extensions to presentation', () => {
    for (const ext of ['ppt', 'pptx', 'ppsx', 'odp']) {
      expect(categorizeFile(`docs/deck.${ext}`)).toBe('presentation');
    }
  });

  it('keeps docx/pdf categories', () => {
    expect(categorizeFile('docs/a.docx')).toBe('docx');
    expect(categorizeFile('docs/a.pdf')).toBe('pdf');
  });

  it('keeps archives and executables as binary', () => {
    for (const ext of ['zip', 'tar', 'gz', 'exe', 'dll', 'woff2', 'ttf']) {
      expect(categorizeFile(`assets/a.${ext}`)).toBe('binary');
    }
  });

  it('keeps code/text behavior unchanged', () => {
    expect(categorizeFile('src/main.rs')).toBe('code');
    expect(categorizeFile('notes.txt')).toBe('text');
    expect(categorizeFile('README.md')).toBe('markdown');
  });

  it('renders svg as an image instead of code source', () => {
    expect(categorizeFile('assets/logo.svg')).toBe('image');
  });

  it('detects Office temporary lock files', () => {
    expect(isOfficeTempFile('docs/~$report.docx')).toBe(true);
    expect(isOfficeTempFile('docs/report.docx')).toBe(false);
    expect(isOfficeTempFile(undefined)).toBe(false);
  });
});
