import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TCopyProvider } from '../i18n/TCopyContext';
import type { CopyDict } from '../i18n/types';
import { useAppStore } from '../stores/slicedStore';
import { TitleBar } from './TitleBar';

afterEach(cleanup);

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

function TestProvider({ children }: { children: ReactNode }) {
  return (
    <TCopyProvider t={mockT} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

function renderTitleBar(overrides: Partial<Parameters<typeof TitleBar>[0]> = {}) {
  const props = {
    onOpenSettings: vi.fn(),
    onTriggerCreateWorkspace: vi.fn(),
    onOpenFolder: vi.fn(),
    isOpeningWorkspace: false,
    onCycleTheme: vi.fn(),
    onSelectLanguage: vi.fn(),
    ...overrides,
  };
  render(
    <TestProvider>
      <TitleBar {...props} />
    </TestProvider>,
  );
  return props;
}

describe('TitleBar add-workspace control', () => {
  it('renders the add-workspace button with the addWorkspace aria-label', () => {
    renderTitleBar();
    const button = screen.getByRole('button', { name: 'addWorkspace' });
    expect(button).toBeInTheDocument();
  });

  it('calls onOpenFolder when the add-workspace button is clicked', () => {
    const { onOpenFolder } = renderTitleBar();
    fireEvent.click(screen.getByRole('button', { name: 'addWorkspace' }));
    expect(onOpenFolder).toHaveBeenCalledTimes(1);
  });

  it('renders a divider between the add-workspace button and the theme button', () => {
    renderTitleBar();
    const addButton = screen.getByRole('button', { name: 'addWorkspace' });
    const themeButton = screen.getByRole('button', { name: 'theme' });
    const divider = document.querySelector('.adl-titlebar__action-divider');
    expect(divider).not.toBeNull();
    expect(divider).toHaveAttribute('aria-hidden', 'true');
    const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(addButton.compareDocumentPosition(divider!) & FOLLOWING).toBeTruthy();
    expect(divider!.compareDocumentPosition(themeButton) & FOLLOWING).toBeTruthy();
  });
});

it('hamburger menu items carry no command-palette row (dead palette removed)', () => {
  useAppStore.setState({ hamburgerOpen: false, hoveredMenuCategory: null });
  renderTitleBar();
  fireEvent.click(screen.getByRole('button', { name: 'appMenu' }));
  expect(screen.queryByText('menuCommandPalette')).toBeNull();
  fireEvent.keyDown(document, { key: 'Escape' });
});

it('hamburger menu has exactly file/view/help categories (no command entry)', () => {
  useAppStore.setState({ hamburgerOpen: false, hoveredMenuCategory: null });
  renderTitleBar();
  fireEvent.click(screen.getByRole('button', { name: 'appMenu' }));
  const items = screen.getAllByRole('menuitem');
  const labels = items.map((el) => el.textContent);
  expect(labels).toEqual(['menuFile', 'menuView', 'menuHelp']);
});

it('hamburger submenu is keyboard reachable (ArrowRight focuses first item)', () => {
  useAppStore.setState({ hamburgerOpen: false, hoveredMenuCategory: null });
  const props = renderTitleBar();
  fireEvent.click(screen.getByRole('button', { name: 'appMenu' }));
  fireEvent.keyDown(document, { key: 'ArrowDown' });
  fireEvent.keyDown(document, { key: 'ArrowRight' });
  expect(document.activeElement?.getAttribute('data-sub-id')).toBe('new-ws');
  fireEvent.keyDown(document, { key: 'ArrowDown' });
  expect(document.activeElement?.getAttribute('data-sub-id')).toBe('open-folder');
  fireEvent.click(document.activeElement as HTMLElement);
  expect(props.onOpenFolder).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('menu')).toBeNull();
});
