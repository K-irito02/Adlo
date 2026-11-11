import { describe, expect, it } from 'vitest';
import { parseBookmarkHtml, serializeBookmarkHtml } from '../bookmarkHtml';
import type { TransferNode } from '../bookmarkTransferTypes';

const bm = (
  url: string,
  title: string,
  addedAt = 1_700_000_000_000,
  lastModifiedAt = addedAt,
): TransferNode => ({ kind: 'bookmark', url, title, addedAt, lastModifiedAt });

const folder = (name: string, children: TransferNode[]): TransferNode => ({
  kind: 'folder',
  folder: { name, children },
});

const SAMPLE = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>工作区</H3>
    <DL><p>
        <DT><A HREF="https://react.dev/" ADD_DATE="1700000000">React 文档</A>
        <DT><H3>CSS</H3>
        <DL><p>
            <DT><A HREF="https://developer.mozilla.org/" ADD_DATE="1700000100" LAST_MODIFIED="1700000200">MDN</A>
        </DL><p>
    </DL><p>
    <DT><A HREF="https://vite.dev/" ADD_DATE="1700000300">Vite</A>
</DL><p>`;

describe('parseBookmarkHtml', () => {
  it('reads the title and top-level nodes', () => {
    const parsed = parseBookmarkHtml(SAMPLE);
    expect(parsed.rootName).toBe('Bookmarks');
    expect(parsed.invalidCount).toBe(0);
    expect(parsed.nodes.map((n) => (n.kind === 'bookmark' ? n.url : n.folder.name))).toEqual([
      '工作区',
      'https://vite.dev/',
    ]);
  });

  it('keeps nested folder structure and per-entry timestamps', () => {
    const parsed = parseBookmarkHtml(SAMPLE);
    const root = parsed.nodes[0];
    expect(root?.kind).toBe('folder');
    if (root?.kind !== 'folder') {
      throw new Error('expected folder');
    }
    expect(root.folder.name).toBe('工作区');
    const [reactNode, cssNode] = root.folder.children;
    expect(reactNode).toMatchObject({ kind: 'bookmark', url: 'https://react.dev/' });
    if (reactNode?.kind === 'bookmark') {
      expect(reactNode.addedAt).toBe(1_700_000_000_000);
      // 没有 LAST_MODIFIED 时回退到 ADD_DATE
      expect(reactNode.lastModifiedAt).toBe(1_700_000_000_000);
    }
    expect(cssNode?.kind).toBe('folder');
    if (cssNode?.kind !== 'folder') {
      throw new Error('expected nested folder');
    }
    const mdn = cssNode.folder.children[0];
    if (mdn?.kind !== 'bookmark') {
      throw new Error('expected bookmark');
    }
    expect(mdn.title).toBe('MDN');
    expect(mdn.addedAt).toBe(1_700_000_100_000);
    expect(mdn.lastModifiedAt).toBe(1_700_000_200_000);
  });

  it('counts and drops unsupported protocols without failing the file', () => {
    const html = `<DL><p>
      <DT><A HREF="https://ok.test/">ok</A>
      <DT><A HREF="javascript:alert(1)">bad</A>
      <DT><A HREF="">empty</A>
      <DT><A HREF="about:blank">blank</A>
    </DL><p>`;
    const parsed = parseBookmarkHtml(html);
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.invalidCount).toBe(3);
  });

  it('falls back to the hostname when the title is missing', () => {
    const parsed = parseBookmarkHtml(
      '<DL><p><DT><A HREF="https://www.example.com/path"></A></DL><p>',
    );
    expect(parsed.nodes[0]).toMatchObject({ kind: 'bookmark', title: 'www.example.com' });
  });

  it('reads ICON data uris', () => {
    const parsed = parseBookmarkHtml(
      '<DL><p><DT><A HREF="https://a.test/" ICON="data:image/png;base64,AAA">A</A></DL><p>',
    );
    expect(parsed.nodes[0]).toMatchObject({ icon: 'data:image/png;base64,AAA' });
  });

  it('drops ICON values that are not inline images (remote/script protocols)', () => {
    // ICON 会被渲染进 <img src>：只接受 data:image/*，远程 URL 会产生旁路请求，
    // javascript:/data:text/html 等脚本载体一律丢弃。
    const parsed = parseBookmarkHtml(
      [
        '<DL><p>',
        '<DT><A HREF="https://a.test/" ICON="https://evil.test/icon.png">A</A>',
        '<DT><A HREF="https://b.test/" ICON="javascript:alert(1)">B</A>',
        '<DT><A HREF="https://c.test/" ICON="data:image/svg+xml;base64,CCC">C</A>',
        '</DL><p>',
      ].join(''),
    );
    expect(parsed.nodes[0]).not.toHaveProperty('icon');
    expect(parsed.nodes[1]).not.toHaveProperty('icon');
    expect(parsed.nodes[2]).toMatchObject({ icon: 'data:image/svg+xml;base64,CCC' });
  });

  it('returns empty nodes for a file without any DL', () => {
    const parsed = parseBookmarkHtml('<html><head><title>X</title></head><body></body></html>');
    expect(parsed.rootName).toBe('X');
    expect(parsed.nodes).toEqual([]);
  });
});

describe('serializeBookmarkHtml', () => {
  it('writes the netscape header, title and entries', () => {
    const html = serializeBookmarkHtml('书签_2026_11_8', [bm('https://a.test/', 'A')]);
    expect(html).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
    expect(html).toContain('charset=UTF-8');
    expect(html).toContain('<H1>书签_2026_11_8</H1>');
    expect(html).toContain('HREF="https://a.test/"');
    expect(html).toContain('ADD_DATE="1700000000"');
    expect(html).toContain('LAST_MODIFIED="1700000000"');
    expect(html).toContain('>A</A>');
  });

  it('omits empty folders', () => {
    const html = serializeBookmarkHtml('T', [folder('空目录', []), bm('https://a.test/', 'A')]);
    expect(html).not.toContain('空目录');
    expect(html).toContain('https://a.test/');
  });

  it('writes ICON from the icon map and skips it when absent', () => {
    const icons = new Map([['https://a.test/', 'data:image/png;base64,ZZZ']]);
    const html = serializeBookmarkHtml(
      'T',
      [bm('https://a.test/', 'A'), bm('https://b.test/', 'B')],
      icons,
    );
    expect(html).toContain('ICON="data:image/png;base64,ZZZ"');
    expect(html.match(/ICON=/g)).toHaveLength(1);
  });

  it('escapes special characters in titles and urls', () => {
    const html = serializeBookmarkHtml('A & B <x>', [bm('https://a.test/?q=1&r=2', 'a & b <c>')]);
    expect(html).toContain('<H1>A &amp; B &lt;x&gt;</H1>');
    expect(html).toContain('HREF="https://a.test/?q=1&amp;r=2"');
    expect(html).toContain('>a &amp; b &lt;c&gt;</A>');
  });

  it('round-trips a tree through serialize + parse', () => {
    const tree: TransferNode[] = [
      folder('工作区', [
        bm('https://react.dev/', 'React & <docs>'),
        folder('CSS', [bm('https://mdn.test/:has', ':has() 选择器')]),
      ]),
      bm('https://vite.dev/', 'Vite'),
    ];
    const html = serializeBookmarkHtml('Bookmarks', tree);
    const parsed = parseBookmarkHtml(html);

    expect(parsed.rootName).toBe('Bookmarks');
    expect(parsed.invalidCount).toBe(0);
    expect(parsed.nodes).toHaveLength(2);

    const root = parsed.nodes[0];
    if (root?.kind !== 'folder') {
      throw new Error('expected folder');
    }
    expect(root.folder.name).toBe('工作区');
    expect(root.folder.children).toHaveLength(2);
    expect(root.folder.children[0]).toMatchObject({
      kind: 'bookmark',
      url: 'https://react.dev/',
      title: 'React & <docs>',
    });
    const css = root.folder.children[1];
    if (css?.kind !== 'folder') {
      throw new Error('expected nested folder');
    }
    expect(css.folder.children[0]).toMatchObject({
      kind: 'bookmark',
      url: 'https://mdn.test/:has',
      title: ':has() 选择器',
    });
    expect(parsed.nodes[1]).toMatchObject({ kind: 'bookmark', url: 'https://vite.dev/' });
  });
});
