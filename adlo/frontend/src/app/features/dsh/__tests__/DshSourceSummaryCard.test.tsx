import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import type { CopyDict } from '@i18n';
import { TCopyProvider } from '@i18n/TCopyContext';
import { useAppStore } from '@stores/slicedStore';
import type { DshSourceStatus } from '@shared/ipc/dsh';
import { SOURCE_SUMMARY_TIMEOUT_MS } from '@hooks/useSourceSummaryGrace';
import { DshSourceSummaryCard } from '../sub-components/DshSourceSummaryCard';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

function sourceStatus(): DshSourceStatus {
  return {
    system: null,
    running: null,
    versionSource: {
      mode: 'auto',
      effective: 'host',
      resolvedByMode: { auto: 'host', host: 'host', system: 'none' },
      hostVersion: '1.1.0',
    },
    config: {
      npm_registry: 'https://registry.npmjs.org',
      dsh_mirror: null,
      source_mode: 'manual',
      version_source: 'auto',
      proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
    },
  };
}

function renderCard() {
  return render(
    <TCopyProvider t={mockT} locale="en-US">
      <DshSourceSummaryCard />
    </TCopyProvider>,
  );
}

beforeEach(() => {
  useAppStore.setState({ sourceStatus: null } as never);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useAppStore.setState({ sourceStatus: null } as never);
});

describe('DshSourceSummaryCard', () => {
  it('renders no skeleton before the grace period, then the failure copy after 3s', () => {
    vi.useFakeTimers();
    renderCard();

    expect(document.querySelector('.adl-source-summary__loading')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(SOURCE_SUMMARY_TIMEOUT_MS - 1);
    });
    expect(document.querySelector('.adl-source-summary__loading')).toBeNull();
    expect(screen.queryByText('dshSourceSummaryUnavailable')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText('dshSourceSummaryUnavailable')).toBeInTheDocument();
  });

  it('renders the loaded registry instead of the failure copy', () => {
    vi.useFakeTimers();
    renderCard();
    act(() => {
      vi.advanceTimersByTime(SOURCE_SUMMARY_TIMEOUT_MS);
    });
    expect(screen.getByText('dshSourceSummaryUnavailable')).toBeInTheDocument();

    act(() => {
      useAppStore.setState({ sourceStatus: sourceStatus() } as never);
    });
    expect(screen.queryByText('dshSourceSummaryUnavailable')).toBeNull();
    expect(screen.getByText('dshSourceSummary')).toBeInTheDocument();
    expect(screen.getByText('dshSourceSummaryMode')).toBeInTheDocument();
  });
});
