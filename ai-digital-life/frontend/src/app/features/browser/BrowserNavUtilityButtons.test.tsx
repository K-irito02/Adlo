import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BrowserNavUtilityButtons } from './BrowserNavUtilityButtons';

const labels = {
  newTab: '新建书签',
  alwaysNewTab: '始终新建标签页',
  clearOpenTabs: '关闭所有已打开标签页',
};

function setup(navigatorMode: 'tabs' | 'open' | 'list' | 'search') {
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
  it('renders always-new-tab button with native title and aria-label', () => {
    setup('open');
    const plus = screen.getByRole('button', { name: labels.alwaysNewTab });
    expect(plus).toHaveAttribute('title', labels.alwaysNewTab);
    expect(plus).toHaveAttribute('aria-label', labels.alwaysNewTab);
  });

  it('renders clear-open-tabs button with native title and aria-label', () => {
    setup('open');
    const trash = screen.getByRole('button', { name: labels.clearOpenTabs });
    expect(trash).toHaveAttribute('title', labels.clearOpenTabs);
    expect(trash).toHaveAttribute('aria-label', labels.clearOpenTabs);
  });

  it('renders new-bookmark button (tabs mode) without native title (uses custom tooltip)', () => {
    setup('tabs');
    const plus = screen.getByRole('button', { name: labels.newTab });
    expect(plus).not.toHaveAttribute('title');
  });

  it('does not render custom tooltip content element', () => {
    setup('open');
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
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
