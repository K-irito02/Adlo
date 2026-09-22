import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { useAppStore } from '../../stores/slicedStore';
import { DshSettings } from './DshSettings';

vi.mock('../../hooks/useAppActions', () => ({
  useAppActions: () => ({
    testSource: vi.fn(),
    saveSourceConfig: vi.fn(),
  }),
}));

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

describe('DshSettings editorial cards', () => {
  afterEach(() => {
    cleanup();
    useAppStore.setState({
      sourceStatus: undefined,
      toasts: [],
    });
  });

  it('renders source, proxy, and actions as settings cards', () => {
    render(
      <TestProvider>
        <DshSettings />
      </TestProvider>,
    );

    const root = document.querySelector('.adl-dsh-settings');
    expect(root).not.toBeNull();

    const cards = root?.querySelectorAll('.adl-settings-card') ?? [];
    expect(cards.length).toBeGreaterThanOrEqual(3);
    expect(root?.querySelector('.adl-dsh-settings__sources')).not.toBeNull();
    expect(root?.querySelector('.adl-dsh-settings__actions')).not.toBeNull();
  });
});
