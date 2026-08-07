import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { WelcomeState } from './WelcomeState';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

function TestProvider({ children }: { children: React.ReactNode }) {
  return (
    <TCopyProvider t={mockT} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

function ws(id: string, path: string, name: string): RecentWorkspaceEntry {
  return {
    id,
    path,
    rootPath: path,
    name,
    lastOpenedAt: 0,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true,
    hiddenFromRightPanels: false,
  };
}

function renderWelcome(count: number) {
  const workspaces = Array.from({ length: count }, (_, i) => ws(`w${i}`, `E:/ws-${i}`, `WS ${i}`));
  return render(
    <TestProvider>
      <WelcomeState
        hasWorkspace={false}
        recentWorkspaces={workspaces}
        onOpenWorkspace={vi.fn()}
        onPickWorkspaceDirectory={vi.fn()}
        onCreateSession={vi.fn()}
      />
    </TestProvider>,
  );
}

describe('WelcomeState recent workspaces', () => {
  it('renders all recent workspaces without truncation', () => {
    renderWelcome(9);
    for (let i = 0; i < 9; i += 1) {
      expect(screen.getByText(`WS ${i}`)).toBeInTheDocument();
    }
  });

  it('wraps the list in the reveal-scroll container', () => {
    const { container } = renderWelcome(9);
    expect(container.querySelector('.adl-welcome__recent-scroll.adl-reveal-scroll')).not.toBeNull();
  });

  it('keeps the scrollbar track outside the scroll container', () => {
    const { container } = renderWelcome(9);
    const host = container.querySelector('.adl-reveal-scrollbar-host') as HTMLElement;
    const scroll = container.querySelector('.adl-reveal-scroll') as HTMLElement;
    expect(host).not.toBeNull();
    expect(scroll.contains(container.querySelector('.adl-reveal-scrollbar'))).toBe(false);
  });

  it('does not render a scrollbar when there are few workspaces', () => {
    const { container } = renderWelcome(2);
    expect(container.querySelector('.adl-reveal-scrollbar')).toBeNull();
  });

  it('shows the overlay scrollbar on hover when scrollable', () => {
    const { container } = renderWelcome(9);
    const host = container.querySelector('.adl-reveal-scrollbar-host') as HTMLElement;
    const scroll = container.querySelector('.adl-reveal-scroll') as HTMLElement;
    Object.defineProperty(scroll, 'scrollHeight', { configurable: true, value: 400 });
    Object.defineProperty(scroll, 'clientHeight', { configurable: true, value: 100 });
    fireEvent.scroll(scroll);
    fireEvent.mouseEnter(host);
    const track = container.querySelector('.adl-reveal-scrollbar') as HTMLElement;
    expect(track).not.toBeNull();
    expect(track.getAttribute('data-visible')).toBe('true');
  });
});
