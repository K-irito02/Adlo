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

  it('renders a divider between the add-workspace button and the panel group', () => {
    renderTitleBar();
    const addButton = screen.getByRole('button', { name: 'addWorkspace' });
    const divider = document.querySelector('.adl-titlebar__action-divider');
    const panelGroup = document.querySelector('.adl-titlebar__panel-group');
    expect(divider).not.toBeNull();
    expect(divider).toHaveAttribute('aria-hidden', 'true');
    const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(addButton.compareDocumentPosition(divider!) & FOLLOWING).toBeTruthy();
    expect(divider!.compareDocumentPosition(panelGroup!) & FOLLOWING).toBeTruthy();
  });

  it('keeps a drag lane between the tab strip and the right controls', () => {
    renderTitleBar();
    const lane = document.querySelector('.adl-titlebar__drag-lane');
    const strip = document.querySelector('.adl-center-tab-strip');
    const right = document.querySelector('.adl-titlebar__right');
    expect(lane).not.toBeNull();
    expect(lane).toHaveAttribute('data-tauri-drag-region');
    const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(strip!.compareDocumentPosition(lane!) & FOLLOWING).toBeTruthy();
    expect(lane!.compareDocumentPosition(right!) & FOLLOWING).toBeTruthy();
  });

  it('uses the folder-plus glyph for add workspace', () => {
    renderTitleBar();
    const paths = screen.getByRole('button', { name: 'addWorkspace' }).querySelectorAll('svg path');
    expect(paths.length).toBe(3);
    expect(paths[0]?.getAttribute('d')).toBe(
      'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
    );
    expect(paths[1]?.getAttribute('d')).toBe('M12 11v6');
    expect(paths[2]?.getAttribute('d')).toBe('M9 14h6');
  });

  it('switches the both-panels glyph with the collapsed state', () => {
    useAppStore.setState({ leftCollapsed: false, rightCollapsed: false });
    renderTitleBar();
    const expanded = screen
      .getByRole('button', { name: 'panelToggleBoth' })
      .querySelectorAll('svg path');
    expect(expanded[2]?.getAttribute('d')).toBe('m9.5 9-3 3 3 3');
    expect(expanded[3]?.getAttribute('d')).toBe('m14.5 9 3 3-3 3');

    cleanup();
    useAppStore.setState({ leftCollapsed: true, rightCollapsed: true });
    renderTitleBar();
    const collapsed = screen
      .getByRole('button', { name: 'panelToggleBoth' })
      .querySelectorAll('svg path');
    expect(collapsed[2]?.getAttribute('d')).toBe('m7 9 3 3-3 3');
    expect(collapsed[3]?.getAttribute('d')).toBe('m17 9-3 3 3 3');
  });

  it('does not render theme or language buttons (moved to settings)', () => {
    renderTitleBar();
    expect(screen.queryByRole('button', { name: 'theme' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'language' })).toBeNull();
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
