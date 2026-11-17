import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { BrowserNavUtilityButtons } from './BrowserNavUtilityButtons';

afterEach(() => {
  vi.useRealTimers();
});

const labels = {
  newTab: '新建书签',
  alwaysNewTab: '始终新建标签页',
  clearOpenTabs: '关闭所有已打开标签页',
};

function setup(navigatorMode: 'tree' | 'open' | 'list' | 'search') {
  const onAlwaysNewTab = vi.fn();
  const onClearOpenTabs = vi.fn();
  render(
    <BrowserNavUtilityButtons
      navigatorMode={navigatorMode}
      newBookmarkLabel={labels.newTab}
      alwaysNewTabLabel={labels.alwaysNewTab}
      clearOpenTabsLabel={labels.clearOpenTabs}
      onAlwaysNewTab={onAlwaysNewTab}
      onClearOpenTabs={onClearOpenTabs}
    />,
  );
  return { onAlwaysNewTab, onClearOpenTabs };
}

describe('BrowserNavUtilityButtons', () => {
  it('renders always-new-tab button with aria-label and no native title (uses custom tooltip)', () => {
    setup('open');
    const plus = screen.getByRole('button', { name: labels.alwaysNewTab });
    expect(plus).toHaveAttribute('aria-label', labels.alwaysNewTab);
    expect(plus).not.toHaveAttribute('title');
  });

  it('renders clear-open-tabs button with aria-label and no native title (uses custom tooltip)', () => {
    setup('open');
    const trash = screen.getByRole('button', { name: labels.clearOpenTabs });
    expect(trash).toHaveAttribute('aria-label', labels.clearOpenTabs);
    expect(trash).not.toHaveAttribute('title');
  });

  it('renders new-bookmark button (tabs mode) without native title (uses custom tooltip)', () => {
    setup('tree');
    const plus = screen.getByRole('button', { name: labels.newTab });
    expect(plus).not.toHaveAttribute('title');
  });

  async function hoverAndAssertTooltip(buttonName: string) {
    const button = screen.getByRole('button', { name: buttonName });
    fireEvent.mouseEnter(button);
    // showDelay(300) + mount rAF + enter double-rAF
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      vi.advanceTimersByTime(16);
    });
    await act(async () => {
      vi.advanceTimersByTime(16);
    });
    await act(async () => {
      vi.advanceTimersByTime(16);
    });
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent(buttonName);
    expect(tip.getAttribute('data-state')).toBe('open');
  }

  it('shows tooltip content carrying the button label on hover', async () => {
    vi.useFakeTimers();
    try {
      setup('open');
      await hoverAndAssertTooltip(labels.alwaysNewTab);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows tooltip content for the clear button on hover', async () => {
    vi.useFakeTimers();
    try {
      setup('open');
      await hoverAndAssertTooltip(labels.clearOpenTabs);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows tooltip content for the tabs-mode button on hover', async () => {
    vi.useFakeTimers();
    try {
      setup('tree');
      await hoverAndAssertTooltip(labels.newTab);
    } finally {
      vi.useRealTimers();
    }
  });

  it('invokes onAlwaysNewTab when always-new-tab button clicked', () => {
    const { onAlwaysNewTab } = setup('open');
    fireEvent.click(screen.getByRole('button', { name: labels.alwaysNewTab }));
    expect(onAlwaysNewTab).toHaveBeenCalledTimes(1);
  });

  it('invokes onClearOpenTabs when clear button clicked', () => {
    const { onClearOpenTabs } = setup('open');
    fireEvent.click(screen.getByRole('button', { name: labels.clearOpenTabs }));
    expect(onClearOpenTabs).toHaveBeenCalledTimes(1);
  });

  it('hides both buttons in list/search modes', () => {
    setup('list');
    expect(screen.queryByRole('button', { name: labels.newTab })).toBeNull();
    expect(screen.queryByRole('button', { name: labels.alwaysNewTab })).toBeNull();
    expect(screen.queryByRole('button', { name: labels.clearOpenTabs })).toBeNull();
  });
});
