// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exactRuleBody } from './testing/cssRules';

/**
 * 剪贴板「放大查看」的 Markdown 预览排版与右侧文件/变更面板保持一致。
 *
 * 两侧共用同一个 MarkdownPreview 渲染器，但弹窗为了外层自绘滚动条覆盖了
 * height/overflow/padding；这里把 padding 与右侧面板绑定，避免后续只改一边
 * 造成排版漂移。
 */
const viewerCss = readFileSync(
  new URL('./regions/leftbar-clipboard.css', import.meta.url),
  'utf-8',
);
const rightPanelCss = readFileSync(
  new URL('./regions/rightpanel/markdown-preview.css', import.meta.url),
  'utf-8',
);

const VIEWER_MARKDOWN = '.adl-clipboard-viewer__scroll .adl-markdown-preview';
const RIGHT_PANEL_MARKDOWN = '.adl-markdown-preview';

function paddingOf(body: string | null): string | undefined {
  return body
    ?.match(/padding:\s*([^;]+);/)?.[1]
    .replace(/\s+/g, ' ')
    .trim();
}

/** 取 at-rule 内某条规则的规则体（`exactRuleBody` 不进入 @media）。 */
function ruleBodyInMedia(css: string, media: string, selector: string): string | undefined {
  const mediaStart = css.indexOf(media);
  if (mediaStart < 0) {
    return undefined;
  }
  const open = css.indexOf('{', mediaStart);
  if (open < 0) {
    return undefined;
  }
  let depth = 0;
  let end = -1;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') {
      depth += 1;
    } else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) {
    return undefined;
  }
  const block = css.slice(open + 1, end);
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(block)?.[1];
}

describe('clipboard viewer markdown layout', () => {
  it('keeps the same padding as the right-side markdown preview', () => {
    const viewerPadding = paddingOf(exactRuleBody(viewerCss, VIEWER_MARKDOWN));
    const rightPanelPadding = paddingOf(exactRuleBody(rightPanelCss, RIGHT_PANEL_MARKDOWN));
    expect(rightPanelPadding).toBeTruthy();
    expect(viewerPadding).toBe(rightPanelPadding);
  });

  it('keeps the same narrow-viewport padding as the right-side markdown preview', () => {
    const media = '@media (max-width: 760px)';
    const viewerPadding = paddingOf(ruleBodyInMedia(viewerCss, media, VIEWER_MARKDOWN) ?? null);
    const rightPanelPadding = paddingOf(
      ruleBodyInMedia(rightPanelCss, media, RIGHT_PANEL_MARKDOWN) ?? null,
    );
    expect(rightPanelPadding).toBeTruthy();
    expect(viewerPadding).toBe(rightPanelPadding);
  });

  it('leaves the surface color to the viewer body (no markdown canvas background)', () => {
    const body = exactRuleBody(viewerCss, VIEWER_MARKDOWN);
    expect(body).toContain('background-color: transparent');
  });
});
