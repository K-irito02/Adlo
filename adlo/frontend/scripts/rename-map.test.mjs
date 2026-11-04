import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRenameMap } from './lib/rename-map.mjs';

describe('parseRenameMap', () => {
  it('maps renamed and copied paths to their base counterpart', () => {
    const text = [
      'R100\told/a.css\tnew/a.css',
      'R087\told/b.ts\tnew/b.ts',
      'C095\told/c.ts\tnew/c-copy.ts',
    ].join('\n');
    const { renamed, changed } = parseRenameMap(text);
    assert.equal(renamed.get('new/a.css'), 'old/a.css');
    assert.equal(renamed.get('new/b.ts'), 'old/b.ts');
    assert.equal(renamed.get('new/c-copy.ts'), 'old/c.ts');
    assert.deepEqual(changed, ['new/a.css', 'new/b.ts', 'new/c-copy.ts']);
  });

  it('keeps added and modified paths without a rename entry', () => {
    const { renamed, changed } = parseRenameMap('A\tnew/file.ts\nM\tedited/file.ts\n');
    assert.equal(renamed.size, 0);
    assert.deepEqual(changed, ['new/file.ts', 'edited/file.ts']);
  });

  it('ignores deletions, blank lines and malformed rows', () => {
    const { renamed, changed } = parseRenameMap('D\tgone.ts\n\nbogus\nR100\tonly-old.ts\n');
    assert.equal(renamed.size, 0);
    assert.deepEqual(changed, []);
  });
});
