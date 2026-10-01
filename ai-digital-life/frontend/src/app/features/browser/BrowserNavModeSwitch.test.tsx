import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserNavModeSwitch } from './BrowserNavModeSwitch';

describe('BrowserNavModeSwitch labels', () => {
  it('uses left/right labels as aria-label and no native title (tooltip provided by parent)', () => {
    render(
      <BrowserNavModeSwitch
        checked={false}
        onCheckedChange={() => {}}
        leftLabel="New tab"
        rightLabel="Current tab"
      />,
    );
    const switchEl = screen.getByRole('switch');
    expect(switchEl).toHaveAttribute('aria-label', 'New tab');
    expect(switchEl).not.toHaveAttribute('title');
  });

  it('uses right label as aria-label when checked', () => {
    render(
      <BrowserNavModeSwitch
        checked={true}
        onCheckedChange={() => {}}
        leftLabel="New tab"
        rightLabel="Current tab"
      />,
    );
    const switchEl = screen.getByRole('switch');
    expect(switchEl).toHaveAttribute('aria-label', 'Current tab');
    expect(switchEl).not.toHaveAttribute('title');
  });
});
