import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { StreamingMarkdown } from '../StreamingMarkdown';

describe('StreamingMarkdown', () => {
  it('renders markdown text', () => {
    const { container } = render(
      <StreamingMarkdown text="**bold** and `code`" isStreaming={false} />,
    );
    expect(container.querySelector('strong')).toBeTruthy();
    expect(container.querySelector('code')).toBeTruthy();
  });
  it('appends streaming text', () => {
    const { rerender, container } = render(<StreamingMarkdown text="Hello" isStreaming />);
    rerender(<StreamingMarkdown text="Hello world" isStreaming />);
    expect(container.textContent).toContain('Hello world');
  });
});
