import { describe, expect, it } from 'vitest';
import type { PartData, PartRecord } from '../../../../kernel/types-part';
import { collectSessionFileParts, filePartUrlToWorkspaceRelativePath } from '../partFileUtils';

describe('filePartUrlToWorkspaceRelativePath', () => {
  it('passes through an already-relative url', () => {
    expect(filePartUrlToWorkspaceRelativePath('src/foo.ts')).toBe('src/foo.ts');
  });

  it('strips the file:// scheme and maps under the workspace root', () => {
    expect(filePartUrlToWorkspaceRelativePath('file:///C:/ws/src/a.txt', 'C:/ws')).toBe(
      'src/a.txt',
    );
    expect(filePartUrlToWorkspaceRelativePath('file:///home/u/ws/a.ts', '/home/u/ws')).toBe('a.ts');
  });

  it('maps an absolute path under the root case-insensitively (Windows)', () => {
    expect(filePartUrlToWorkspaceRelativePath('C:\\WS\\src\\b.ts', 'c:\\ws')).toBe('src/b.ts');
  });

  it('returns undefined for absolute urls outside the workspace or remote urls', () => {
    expect(
      filePartUrlToWorkspaceRelativePath('file:///C:/elsewhere/a.txt', 'C:/ws'),
    ).toBeUndefined();
    expect(filePartUrlToWorkspaceRelativePath('https://x/y.txt', 'C:/ws')).toBeUndefined();
  });

  it('returns undefined when no workspace root and the url is absolute', () => {
    expect(filePartUrlToWorkspaceRelativePath('file:///C:/elsewhere/a.txt')).toBeUndefined();
  });
});

describe('collectSessionFileParts', () => {
  const mk = (id: string, data: PartData): PartRecord => ({
    id,
    messageID: 'm1',
    sessionID: 's1',
    type: data.type,
    ordinal: 0,
    timeCreated: 0,
    data,
  });

  it('collects file parts deduped by url across messages, skipping non-file parts', () => {
    const partsByMessage = new Map<string, PartRecord[]>([
      ['m1', [mk('p1', { type: 'file', mime: 'text/plain', url: 'a.txt', filename: 'a.txt' })]],
      [
        'm2',
        [
          mk('p2', { type: 'file', mime: 'text/plain', url: 'a.txt' }),
          mk('p3', { type: 'file', mime: 'text/typescript', url: 'b.ts', filename: 'b.ts' }),
          mk('p4', { type: 'text', text: 'hi' }),
        ],
      ],
    ]);
    expect(collectSessionFileParts(partsByMessage)).toEqual([
      { url: 'a.txt', filename: 'a.txt' },
      { url: 'b.ts', filename: 'b.ts' },
    ]);
  });

  it('returns an empty list when there are no file parts', () => {
    const partsByMessage = new Map<string, PartRecord[]>();
    expect(collectSessionFileParts(partsByMessage)).toEqual([]);
  });
});
