import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const editorAdaptersSource = readFileSync(
  new URL('../../features/editor/editorAdapters.ts', import.meta.url),
  'utf8'
);

describe('editor adapter layout listeners', () => {
  it('observes editor chrome, scroller, and content geometry so wrap changes notify immediately', () => {
    expect(editorAdaptersSource).toContain('onDidLayoutChange?(listener: () => void): Disposable');
    expect(editorAdaptersSource).toContain('observer.observe(this.view.dom);');
    expect(editorAdaptersSource).toContain('observer.observe(this.view.scrollDOM);');
    expect(editorAdaptersSource).toContain('observer.observe(this.view.contentDOM);');
  });
});
