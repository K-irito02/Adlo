import { describe, expect, it } from 'vitest';
import { buildSelectionPrompt } from './selectionPrompt';

describe('selectionPrompt', () => {
  describe('buildSelectionPrompt', () => {
    it('creates English prompt with file reference', async () => {
      const result = await buildSelectionPrompt('en-US', 'src/App.tsx', 'const x = 1;');
      expect(result).toContain('@src/App.tsx');
      expect(result).toContain('Continue from this selection:');
      expect(result).toContain('const x = 1;');
    });

    it('creates Chinese prompt with file reference', async () => {
      const result = await buildSelectionPrompt('zh-CN', 'src/App.tsx', 'const x = 1;');
      expect(result).toContain('@src/App.tsx');
      expect(result).toContain('请基于以下选区继续工作：');
      expect(result).toContain('const x = 1;');
    });

    it('wraps selection in code block', async () => {
      const result = await buildSelectionPrompt('en-US', 'test.ts', 'line1\nline2');
      expect(result).toContain('```\nline1\nline2\n```');
    });

    it('handles empty selection', async () => {
      const result = await buildSelectionPrompt('en-US', 'test.ts', '');
      expect(result).toContain('@test.ts');
      expect(result).toContain('```\n\n```');
    });

    it('handles special characters in selection', async () => {
      const result = await buildSelectionPrompt('en-US', 'test.ts', "<div class='test'>");
      expect(result).toContain("<div class='test'>");
    });

    it('handles Unicode in selection', async () => {
      const result = await buildSelectionPrompt('zh-CN', 'test.ts', '中文内容');
      expect(result).toContain('中文内容');
    });

    it('handles path with special characters', async () => {
      const result = await buildSelectionPrompt('en-US', 'src/file-with-dashes.ts', 'code');
      expect(result).toContain('@src/file-with-dashes.ts');
    });

    it('creates different prompts for different locales', async () => {
      const enResult = await buildSelectionPrompt('en-US', 'f.ts', 'c');
      const zhResult = await buildSelectionPrompt('zh-CN', 'f.ts', 'c');

      expect(enResult).not.toBe(zhResult);
      expect(enResult).toContain('Continue from this selection:');
      expect(zhResult).toContain('请基于以下选区继续工作：');
    });
  });
});
