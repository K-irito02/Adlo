// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('store outline wiring', () => {
  const editorSource = readFileSync(
    new URL('./stores/actions/editorActions.ts', import.meta.url),
    'utf8'
  );
  const editorHelpersSource = readFileSync(
    new URL('./stores/actions/editorActionsHelpers.ts', import.meta.url),
    'utf8'
  );

  it('builds file outlines from loaded content through the shared parser', () => {
    expect(editorSource).toContain("from '@shared/outline'");
    const outlineOccurrences =
      (editorSource.match(/buildOutlineFromContent/g) ?? []).length +
      (editorHelpersSource.match(/buildOutlineFromContent/g) ?? []).length;
    expect(outlineOccurrences).toBeGreaterThanOrEqual(3);
  });
});
