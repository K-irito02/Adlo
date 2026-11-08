import { describe, expect, it } from 'vitest';
import { outlineForEditorText } from './useFilesPanelProps';
import { TEXT_HEAVY_PREVIEW_CHARS } from '../heavyPreviewLimits';

describe('outlineForEditorText（打字后大纲跟手）', () => {
  it('按最新正文重建锚点，而不是沿用打开时的旧大纲', () => {
    const outline = outlineForEditorText('doc.md', '# Title\n\n## Section\n');
    expect(outline.map((item) => item.label)).toEqual(['Title', 'Section']);
  });

  it('正文新增小节后锚点随之出现', () => {
    const before = outlineForEditorText('doc.md', '# Title\n');
    const after = outlineForEditorText('doc.md', '# Title\n\n## Added\n');
    expect(before.map((item) => item.label)).toEqual(['Title']);
    expect(after.map((item) => item.label)).toEqual(['Title', 'Added']);
  });

  it('重型文本跳过大纲解析（与打开文件同口径）', () => {
    const huge = `# Title\n${'x'.repeat(TEXT_HEAVY_PREVIEW_CHARS)}`;
    expect(outlineForEditorText('huge.md', huge)).toEqual([]);
  });
});
