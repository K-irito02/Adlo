// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('changes panel reveal wiring', () => {
  const source = readFileSync(
    new URL('./panels/ChangesPanel/useChangesPanelStateUtils.ts', import.meta.url),
    'utf8',
  );

  it('reuses the shared preview reveal helper instead of heading-only anchors', () => {
    expect(source).toContain('revealSourceLine');
    expect(source).not.toContain('container.querySelector(`[data-source-line="${line}"]`)');
  });

  it('guards the diff editor reveal against out-of-range lines', () => {
    expect(source).toContain('revealEditorLineSafely');
  });
});
