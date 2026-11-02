import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import type { CopyDict } from '@i18n';
import { TCopyProvider } from '@i18n/TCopyContext';
import type { OpencodeSourceStatus } from '@shared/ipc/opencode';
import { SOURCE_SUMMARY_TIMEOUT_MS } from '@hooks/useSourceSummaryGrace';
import { OpencodeSourceSummaryCard } from '../sub-components/OpencodeSourceSummaryCard';

// 与设置组测试同构：Proxy 桩文案（返回 key 本身）。
const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

function sourceStatus(): OpencodeSourceStatus {
  return {
    system: null,
    versionSource: {
      mode: 'auto',
      effective: 'host',
      resolvedByMode: { auto: 'host', host: 'host', system: 'none' },
      hostVersion: '2.2.5',
    },
    config: {
      version_source: 'auto',
      source_mode: 'manual',
      npm_registry: 'https://registry.npmjs.org',
    },
    terminalInjection: true,
  };
}

function renderCard(source: OpencodeSourceStatus | null) {
  return render(
    <TCopyProvider t={mockT} locale="en-US">
      <OpencodeSourceSummaryCard source={source} />
    </TCopyProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('OpencodeSourceSummaryCard', () => {
  it('shows a skeleton before the grace period, then the failure copy after 3s', () => {
    vi.useFakeTimers();
    renderCard(null);

    expect(document.querySelector('.adl-source-summary__loading')).not.toBeNull();
    expect(screen.queryByText('dshSourceSummaryUnavailable')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(SOURCE_SUMMARY_TIMEOUT_MS - 1);
    });
    expect(document.querySelector('.adl-source-summary__loading')).not.toBeNull();
    expect(screen.queryByText('dshSourceSummaryUnavailable')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(document.querySelector('.adl-source-summary__loading')).toBeNull();
    expect(screen.getByText('dshSourceSummaryUnavailable')).toBeInTheDocument();
  });

  it('renders the loaded registry instead of the failure copy', () => {
    vi.useFakeTimers();
    const view = renderCard(null);
    act(() => {
      vi.advanceTimersByTime(SOURCE_SUMMARY_TIMEOUT_MS);
    });
    expect(screen.getByText('dshSourceSummaryUnavailable')).toBeInTheDocument();

    view.rerender(
      <TCopyProvider t={mockT} locale="en-US">
        <OpencodeSourceSummaryCard source={sourceStatus()} />
      </TCopyProvider>,
    );
    expect(screen.queryByText('dshSourceSummaryUnavailable')).toBeNull();
    expect(screen.queryByText('dshSourceSummaryLoading')).toBeNull();
    expect(screen.getByText('dshSourceSummary')).toBeInTheDocument();
    expect(screen.getByText('dshSourceSummaryMode')).toBeInTheDocument();
  });
});
