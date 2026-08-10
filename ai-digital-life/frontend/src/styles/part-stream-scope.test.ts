// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const partStreamCss = readFileSync(new URL('./part-stream.css', import.meta.url), 'utf-8');

/** Brace-matched rule blocks for a selector (handles comma groups / inner braces). */
function findRuleGroups(css: string, selector: string): string[] {
  const blocks: string[] = [];
  let from = 0;
  while (from < css.length) {
    const open = css.indexOf(selector, from);
    if (open === -1) {
      break;
    }
    from = open + selector.length;
    // Skip occurrences inside comments.
    const lastCommentEnd = css.lastIndexOf('*/', open);
    const lastCommentStart = css.lastIndexOf('/*', open);
    if (lastCommentStart > lastCommentEnd) {
      continue;
    }
    // Require a selector boundary before the match (suffix guard).
    const prev = open === 0 ? '' : css[open - 1];
    if (prev && !/[\s,{>+~]/.test(prev)) {
      continue;
    }
    const bodyStart = css.indexOf('{', open);
    if (bodyStart === -1) {
      break;
    }
    let depth = 1;
    let i = bodyStart + 1;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') {
        depth += 1;
      } else if (css[i] === '}') {
        depth -= 1;
      }
      i += 1;
    }
    blocks.push(css.slice(open, i));
    from = i;
  }
  return blocks;
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Every class the part-stream components render. Each block element /
 * modifier is styled by part-stream.css so the T5-8 renderers get a coherent
 * look. This list mirrors the `className` literals in:
 *   - StreamingMarkdown.tsx      (adl-part-scope, adl-part-markdown, adl-part-code)
 *   - BasicToolCard.tsx / ToolErrorCard.tsx
 *   - ContextToolGroup.tsx
 *   - PartDiffPanel.tsx
 *   - AskCard.tsx
 *   - TurnSummary.tsx
 *   - SessionDocks.tsx
 *   - SessionSidePanel.tsx
 *   - PartConversation.tsx
 */
const RENDERED_CLASSES = [
  '.adl-part-scope',
  '.adl-part-conversation',
  '.adl-part-message',
  '.adl-part-message--user',
  '.adl-part-message--assistant',
  '.adl-part-message__text',
  '.adl-part-docks',
  '.adl-part-side-panel',
  '.adl-part-side-panel__title',
  '.adl-part-side-panel__files',
  '.adl-part-markdown',
  '.adl-part-code',
  '.adl-part-tool',
  '.adl-part-tool--pending',
  '.adl-part-tool--running',
  '.adl-part-tool--completed',
  '.adl-part-tool--error',
  '.adl-part-tool__summary',
  '.adl-part-tool__title',
  '.adl-part-tool__status',
  '.adl-part-tool__body',
  '.adl-part-tool__input',
  '.adl-part-tool__output',
  '.adl-part-tool-error',
  '.adl-part-tool-error__text',
  '.adl-part-context',
  '.adl-part-context--busy',
  '.adl-part-context__label',
  '.adl-part-context__tools',
  '.adl-part-diff',
  '.adl-part-diff__files',
  '.adl-part-diff__file',
  '.adl-part-ask',
  '.adl-part-ask__prompt',
  '.adl-part-ask__options',
  '.adl-part-ask__option',
  '.adl-part-turn-summary',
  '.adl-part-turn-summary--idle',
  '.adl-part-turn-summary--busy',
  '.adl-part-turn-summary--completed',
  '.adl-part-turn-summary--error',
  '.adl-part-turn-summary--cancelled',
];

describe('part-stream.css — .adl-part-scope local visual scope', () => {
  it('defines the local variable mapping on .adl-part-scope (never touching global tokens)', () => {
    const blocks = findRuleGroups(partStreamCss, '.adl-part-scope');
    expect(blocks.length).toBeGreaterThan(0);
    const all = blocks.join('\n');
    expect(all).toContain('--adl-part-text:');
    expect(all).toContain('--adl-part-muted:');
    expect(all).toContain('--adl-part-border:');
    expect(all).toContain('--adl-part-radius:');
    expect(all).toContain('--adl-part-tool-bg:');
    expect(all).toContain('--adl-part-error:');
    expect(all).toContain('--adl-part-success:');
  });

  it('maps every local var to a global token via var(--…)', () => {
    const scope = findRuleGroups(partStreamCss, '.adl-part-scope').join('\n');
    const localVars = [...scope.matchAll(/(--adl-part-[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
    expect(localVars.length).toBeGreaterThanOrEqual(7);
    for (const block of findRuleGroups(partStreamCss, '.adl-part-scope')) {
      const vars = [...block.matchAll(/(--adl-part-[a-z0-9-]+)\s*:\s*([^;]+);/g)];
      for (const [, name, value] of vars) {
        if (name === '--adl-part-radius') {
          continue;
        }
        expect(value.trim()).toMatch(/^var\(--/);
      }
    }
  });

  it('styles every class the part-stream components render', () => {
    const missing = RENDERED_CLASSES.filter(
      (sel) => findRuleGroups(partStreamCss, sel).length === 0,
    );
    expect(missing).toEqual([]);
  });

  it('uses only var(--…) for colors (no raw hex / rgb literals in rule values)', () => {
    const body = stripComments(partStreamCss);
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(body).not.toMatch(/\b(rgba?|hsla?)\(/);
  });
});
