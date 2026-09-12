import { describe, expect, it } from 'vitest';
import { msysPathToWindows, normalizeReportedCwd, scanOsc99 } from '../terminalCwdOsc';

const ESC = '\u001b';

/** 构造 OSC 9;9 序列（默认用 ST 终止符，即 ESC \） */
function osc99(path: string, terminator: 'st' | 'bel' = 'st'): string {
  return `${ESC}]9;9;${path}${terminator === 'st' ? `${ESC}\\` : '\u0007'}`;
}

describe('scanOsc99', () => {
  it('parses an ST-terminated sequence', () => {
    const result = scanOsc99(`${osc99('E:\\work')}PS E:\\work> `);
    expect(result.cwds).toEqual(['E:\\work']);
    expect(result.carry).toBe('');
  });

  it('parses a BEL-terminated sequence', () => {
    const result = scanOsc99(osc99('/e/work', 'bel'));
    expect(result.cwds).toEqual(['/e/work']);
  });

  it('parses multiple sequences in one chunk and keeps order', () => {
    const result = scanOsc99(`${osc99('E:\\a')}x${osc99('E:\\b')}`);
    expect(result.cwds).toEqual(['E:\\a', 'E:\\b']);
  });

  it('returns the unterminated tail as carry and does not report it', () => {
    const chunk = `before${ESC}]9;9;E:\\trunc`;
    const result = scanOsc99(chunk);
    expect(result.cwds).toEqual([]);
    expect(result.carry).toBe(`${ESC}]9;9;E:\\trunc`);
  });

  it('parses a sequence split across two chunks via carry', () => {
    const first = scanOsc99(`out${ESC}]9;9;E:\\splitpa`);
    expect(first.cwds).toEqual([]);

    const second = scanOsc99(`${first.carry}th${ESC}\\PS> `);
    expect(second.cwds).toEqual(['E:\\splitpath']);
    expect(second.carry).toBe('');
  });

  it('keeps a bare prefix tail for the next chunk', () => {
    const first = scanOsc99(`out${ESC}]9`);
    expect(first.carry).toBe(`${ESC}]9`);
    const second = scanOsc99(`${first.carry};9;C:\\x${ESC}\\`);
    expect(second.cwds).toEqual(['C:\\x']);
  });

  it('ignores unrelated escape sequences', () => {
    const result = scanOsc99(`${ESC}[2J${ESC}[Hno cwd here`);
    expect(result.cwds).toEqual([]);
    expect(result.carry).toBe('');
  });
});

describe('msysPathToWindows', () => {
  it('converts a drive path', () => {
    expect(msysPathToWindows('/e/AI-DIGITAL-LIFE/SourceWorkspace')).toBe(
      'E:\\AI-DIGITAL-LIFE\\SourceWorkspace',
    );
  });

  it('converts a bare drive root', () => {
    expect(msysPathToWindows('/c')).toBe('C:\\');
  });

  it('converts a lowercase drive and collapes duplicate slashes', () => {
    expect(msysPathToWindows('/d/a//b')).toBe('D:\\a\\b');
  });

  it('rejects WSL-style and relative paths', () => {
    expect(msysPathToWindows('/mnt/c/Users')).toBeNull();
    expect(msysPathToWindows('~/work')).toBeNull();
    expect(msysPathToWindows('relative/path')).toBeNull();
  });
});

describe('normalizeReportedCwd', () => {
  it('accepts a native Windows absolute path as-is', () => {
    expect(normalizeReportedCwd('E:\\work\\sub', { msys: false })).toBe('E:\\work\\sub');
    expect(normalizeReportedCwd('e:/work', { msys: false })).toBe('e:/work');
  });

  it('converts MSYS paths only when the shell is bash', () => {
    expect(normalizeReportedCwd('/e/work', { msys: true })).toBe('E:\\work');
    expect(normalizeReportedCwd('/e/work', { msys: false })).toBeNull();
  });

  it('trims whitespace and rejects empty or non-absolute values', () => {
    expect(normalizeReportedCwd('  E:\\a  ', { msys: false })).toBe('E:\\a');
    expect(normalizeReportedCwd('   ', { msys: true })).toBeNull();
    expect(normalizeReportedCwd('~', { msys: true })).toBeNull();
  });
});
