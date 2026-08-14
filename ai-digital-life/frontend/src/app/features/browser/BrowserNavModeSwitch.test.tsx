import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserNavModeSwitch } from './BrowserNavModeSwitch';

describe('BrowserNavModeSwitch native title', () => {
  it('renders the native title attribute from the title prop', () => {
    render(
      <BrowserNavModeSwitch
        checked={false}
        onCheckedChange={() => {}}
        leftLabel="New tab"
        rightLabel="Current tab"
        title="Current tab: sidebar/address bar links open in active tab"
      />,
    );
    expect(screen.getByRole('switch')).toHaveAttribute(
      'title',
      'Current tab: sidebar/address bar links open in active tab',
    );
  });

  it('keeps aria-label from labels when no title is given', () => {
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
