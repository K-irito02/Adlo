import { describe, expect, it } from 'vitest';
import { splitMarkdownIncrements } from '../markdown-utils';

describe('splitMarkdownIncrements', () => {
  it('returns full text when no prior', () => {
    expect(splitMarkdownIncrements('', 'hello')).toBe('hello');
  });
  it('returns only the delta when text grows', () => {
    expect(splitMarkdownIncrements('Hello', 'Hello world')).toBe(' world');
  });
});
