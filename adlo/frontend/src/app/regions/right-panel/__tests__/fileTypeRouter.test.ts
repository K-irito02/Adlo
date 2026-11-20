import { describe, expect, it } from 'vitest';
import {
  categorizeFile,
  isLegacyOfficeFile,
  isOfficeTempFile,
  usesBinaryMediaChannel,
} from '../fileTypeRouter';

describe('usesBinaryMediaChannel（二进制不按文本读）', () => {
  it('routes binary categories through the media channel', () => {
    // odt/zip/exe/ttf：历史上按文本读会以 "binary files are not readable" 失败。
    for (const path of ['a.odt', 'b.zip', 'c.exe', 'd.ttf']) {
      expect(categorizeFile(path)).toBe('binary');
      expect(usesBinaryMediaChannel(categorizeFile(path))).toBe(true);
    }
  });

  it('keeps media/office on the media channel and text/code on the text channel', () => {
    for (const path of ['a.png', 'b.mp4', 'c.docx', 'd.pdf', 'e.xlsx', 'f.pptx']) {
      expect(usesBinaryMediaChannel(categorizeFile(path))).toBe(true);
    }
    for (const path of ['a.md', 'b.ts', 'c.txt', 'd.csv']) {
      expect(usesBinaryMediaChannel(categorizeFile(path))).toBe(false);
    }
  });
});

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
    for (const ext of ['xls', 'xlsx', 'ods']) {
      expect(categorizeFile(`docs/report.${ext}`)).toBe('spreadsheet');
    }
  });

  it('keeps csv in the text channel for editing', () => {
    expect(categorizeFile('docs/report.csv')).toBe('text');
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

  it('routes macro/template OOXML variants to docx', () => {
    for (const ext of ['docm', 'dotx', 'dotm']) {
      expect(categorizeFile(`docs/a.${ext}`)).toBe('docx');
    }
  });

  it('routes legacy dot template to docx for guided fallback', () => {
    expect(categorizeFile('docs/a.dot')).toBe('docx');
  });

  it('routes odt to binary instead of garbled text', () => {
    expect(categorizeFile('docs/a.odt')).toBe('binary');
  });

  it('routes legacy pot/pps to binary', () => {
    expect(categorizeFile('docs/a.pot')).toBe('binary');
    expect(categorizeFile('docs/a.pps')).toBe('binary');
    expect(categorizeFile('docs/a.ppsx')).toBe('presentation');
  });

  it('matches extensions case-insensitively', () => {
    expect(categorizeFile('assets/PHOTO.PNG')).toBe('image');
    expect(categorizeFile('assets/CLIP.MP4')).toBe('video');
    expect(categorizeFile('docs/REPORT.XLSX')).toBe('spreadsheet');
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
    expect(isOfficeTempFile('docs\\~$report.docx')).toBe(true);
    expect(isOfficeTempFile('docs/report.docx')).toBe(false);
    expect(isOfficeTempFile(undefined)).toBe(false);
  });

  it('detects legacy Office binaries for read short-circuit', () => {
    expect(isLegacyOfficeFile('docs/old.doc')).toBe(true);
    expect(isLegacyOfficeFile('docs/old.dot')).toBe(true);
    expect(isLegacyOfficeFile('docs/old.ppt')).toBe(true);
    expect(isLegacyOfficeFile('docs/new.docx')).toBe(false);
    expect(isLegacyOfficeFile('docs/sheet.xls')).toBe(false);
    expect(isLegacyOfficeFile(undefined)).toBe(false);
  });

  it('splits Windows-style paths for extension lookup', () => {
    expect(categorizeFile('docs\\clip.MP4')).toBe('video');
  });
});
