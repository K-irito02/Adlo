import { describe, expect, it } from 'vitest';
import { buildLocalFileUrl, isLocalFileInput, isLocalViewableFileUrl } from '../localFileInput';

describe('localFileInput', () => {
  it('recognizes file:// inputs', () => {
    expect(isLocalFileInput('file:///D:/Desktop/a.html')).toBe(true);
    expect(isLocalFileInput('FILE:///D:/Desktop/a.html')).toBe(true);
  });

  it('recognizes Windows absolute path inputs with forward slashes', () => {
    expect(isLocalFileInput('D:/Desktop/a.html')).toBe(true);
  });

  it('recognizes Windows absolute path inputs with backslashes and spaces', () => {
    expect(isLocalFileInput('D:\\Desktop folder\\a b.html')).toBe(true);
  });

  it('builds a canonical file URL from a Windows path', () => {
    expect(buildLocalFileUrl('D:\\Desktop folder\\a b.html')).toBe(
      'file:///D:/Desktop%20folder/a%20b.html',
    );
  });

  it('normalizes file:// inputs to a canonical file URL', () => {
    expect(buildLocalFileUrl('FILE:///D:/Desktop/a.html')).toBe('file:///D:/Desktop/a.html');
  });

  it('recognizes and builds UNC paths', () => {
    expect(isLocalFileInput('\\\\server\\share\\a.html')).toBe(true);
    expect(buildLocalFileUrl('\\\\server\\share\\a b.html')).toBe('file://server/share/a%20b.html');
  });

  it('encodes #, ? and % in file names instead of treating them as URL syntax', () => {
    expect(buildLocalFileUrl('D:\\Desktop\\a#1.html')).toBe('file:///D:/Desktop/a%231.html');
    expect(buildLocalFileUrl('D:\\Desktop\\a?b.html')).toBe('file:///D:/Desktop/a%3Fb.html');
    expect(buildLocalFileUrl('D:\\Desktop\\100% done.html')).toBe(
      'file:///D:/Desktop/100%25%20done.html',
    );
    expect(isLocalViewableFileUrl('file:///D:/Desktop/100%25%20done.html')).toBe(true);
  });

  it('does not treat a normal web url as local', () => {
    expect(isLocalFileInput('https://example.com/a.html')).toBe(false);
    expect(isLocalFileInput('example.com/a.html')).toBe(false);
  });

  it('treats browser-renderable local files as viewable', () => {
    expect(isLocalViewableFileUrl('file:///D:/Desktop/a.html')).toBe(true);
    expect(isLocalViewableFileUrl('file:///D:/Desktop/a.PDF')).toBe(true);
    expect(isLocalViewableFileUrl('file:///D:/Desktop/a.mp4')).toBe(true);
  });

  it('does not treat executables as viewable', () => {
    expect(isLocalViewableFileUrl('file:///D:/Desktop/setup.exe')).toBe(false);
  });
});
