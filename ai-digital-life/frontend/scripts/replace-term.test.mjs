import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { replaceInText, replaceInFiles } from './replace-term.mjs';

function tmpFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'replace-term-'));
  const full = path.join(dir, name);
  fs.writeFileSync(full, content, 'utf8');
  return full;
}

describe('replace-term', () => {
  it('replaces CJK literally without touching anything else', () => {
    const { out, total } = replaceInText('用系统 Git / WSL 或手动路径）\n第二行手动路径\n', [
      { from: '手动路径', to: '指定路径' },
    ]);
    assert.equal(total, 2);
    assert.equal(out, '用系统 Git / WSL 或指定路径）\n第二行指定路径\n');
  });

  it('preserves CRLF byte-for-byte outside replacements', () => {
    const before = 'a手动路径b\r\nc\r\n';
    const full = tmpFile('crlf.txt', before);
    const { report, failed } = replaceInFiles([full], [{ from: '手动路径', to: '指定路径' }]);
    assert.equal(failed, false);
    assert.equal(report[0].total, 1);
    const raw = fs.readFileSync(full);
    assert.equal(raw.toString('hex'), Buffer.from('a指定路径b\r\nc\r\n', 'utf8').toString('hex'));
  });

  it('dry run reports but does not write', () => {
    const full = tmpFile('dry.txt', '手动路径');
    const { report, failed } = replaceInFiles([full], [{ from: '手动路径', to: '指定路径' }], {
      dryRun: true,
    });
    assert.equal(failed, false);
    assert.equal(report[0].total, 1);
    assert.equal(fs.readFileSync(full, 'utf8'), '手动路径');
  });

  it('fails on zero matches and on missing files', () => {
    const full = tmpFile('zero.txt', 'nothing here');
    const zero = replaceInFiles([full], [{ from: '手动路径', to: '指定路径' }]);
    assert.equal(zero.failed, true);
    assert.match(zero.report[0].reason, /zero/);
    const missing = replaceInFiles(
      [path.join(os.tmpdir(), 'no-such-file-xyz.txt')],
      [{ from: 'a', to: 'b' }],
    );
    assert.equal(missing.failed, true);
  });
});
