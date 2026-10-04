import { createRef, useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { fireEvent, render, screen, act, cleanup } from '@testing-library/react';
import { TerminalShellSelector } from '../TerminalShellSelector';
import type { TerminalShellMenuItem } from '../useTerminalPanel';
import { useAppStore } from '@stores/slicedStore';
import { TCopyProvider } from '@i18n/TCopyContext';

const mockT = {
  menuNewTerminal: 'New terminal',
  terminalIndependent: 'Independent',
  shellTypeSelect: 'Select shell type',
} as never;

function TestProvider({ children }: { children: React.ReactNode }) {
  return (
    <TCopyProvider t={mockT} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

const shellItems: TerminalShellMenuItem[] = [
  {
    id: 'powershell',
    label: 'PowerShell',
    profile: 'powershell',
    action: vi.fn(),
  },
];

function Harness({
  onToggleSpy,
  onCloseSpy,
}: {
  onToggleSpy?: () => void;
  onCloseSpy?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <TerminalShellSelector
      currentProfile="powershell"
      currentProfileLabel="PowerShell"
      menuOpen={menuOpen}
      menuItems={shellItems}
      menuRef={createRef<HTMLDivElement | null>()}
      onCreateTab={vi.fn()}
      onToggle={() => {
        onToggleSpy?.();
        setMenuOpen((v) => !v);
      }}
      onClose={() => {
        onCloseSpy?.();
        setMenuOpen(false);
      }}
      onSelect={vi.fn()}
    />
  );
}

function mockHoverCapable(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches }));
}

describe('TerminalShellSelector hover open', () => {
  beforeEach(() => {
    useAppStore.setState({ terminalWorkspaceId: '', recentWorkspaces: [] });
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    cleanup();
  });

  it('opens the menu 120ms after hovering the toggle on hover-capable devices', () => {
    mockHoverCapable(true);
    const onToggleSpy = vi.fn();
    render(
      <TestProvider>
        <Harness onToggleSpy={onToggleSpy} />
      </TestProvider>,
    );
    fireEvent.mouseEnter(screen.getByLabelText(/Select shell type/));
    expect(onToggleSpy).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(onToggleSpy).toHaveBeenCalledTimes(1);
  });

  it('does not open on hover when the device has no hover capability', () => {
    mockHoverCapable(false);
    const onToggleSpy = vi.fn();
    render(
      <TestProvider>
        <Harness onToggleSpy={onToggleSpy} />
      </TestProvider>,
    );
    fireEvent.mouseEnter(screen.getByLabelText(/Select shell type/));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onToggleSpy).not.toHaveBeenCalled();
  });

  it('closes the menu 2s after leaving all zones', () => {
    mockHoverCapable(true);
    const onCloseSpy = vi.fn();
    render(
      <TestProvider>
        <Harness onCloseSpy={onCloseSpy} />
      </TestProvider>,
    );
    // open via click (works on every device; click alone fires no mouseenter)
    fireEvent.click(screen.getByLabelText(/Select shell type/));
    expect(screen.getByRole('menu')).toBeDefined();
    // leave the menu card: its own 2s timer fires exactly once (idempotent close)
    fireEvent.mouseLeave(screen.getByRole('menu'));
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(onCloseSpy).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
  });

  it('renders the full workspace name (width-driven truncation) and exposes it in the accessible name', () => {
    mockHoverCapable(true);
    const workspaceName = 'A Very Long Workspace Name';
    useAppStore.setState({
      terminalWorkspaceId: 'ws-1',
      recentWorkspaces: [
        {
          id: 'ws-1',
          name: workspaceName,
          removedFromSidebar: false,
          available: true,
        } as never,
      ],
    });
    render(
      <TestProvider>
        <Harness />
      </TestProvider>,
    );
    const label = document.querySelector('.adl-split-pill__workspace-label');
    // 完整名称进入 DOM（截断交给 CSS 宽度驱动，不再做 JS substring）
    expect(label?.textContent).toBe(workspaceName);
    // 可访问名包含完整名称（窄宽/触屏下裁剪后仍可获知）
    expect(screen.getByLabelText(`Select shell type ${workspaceName}`)).toBeDefined();
  });
});
