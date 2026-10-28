import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor, within, act } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { HarnessVersionCard } from './HarnessVersionCard';
import type {
  HarnessVersionBridge,
  HarnessVersionResult,
  HarnessVersionSnapshot,
  HarnessVersionStatus,
} from './harnessVersionBridge';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

function renderCard(bridge: HarnessVersionBridge<unknown>) {
  return render(
    <TCopyProvider t={mockT} locale="en-US">
      <HarnessVersionCard bridge={bridge} />
    </TCopyProvider>,
  );
}

function status(overrides: Partial<HarnessVersionStatus> = {}): HarnessVersionStatus {
  return {
    currentSelected: '1.0.0',
    installed: ['1.0.0', '1.1.0'],
    latestAvailable: '1.1.0',
    hasUpdate: true,
    prereleaseAvailable: null,
    hasPrereleaseUpdate: false,
    prereleaseUnknown: false,
    ...overrides,
  };
}

const CATALOG = {
  stable: [
    { version: '1.0.0', publishedAt: null },
    { version: '1.1.0', publishedAt: null },
  ],
  prerelease: [],
  latestStable: '1.1.0',
  latestPrerelease: null,
};

function snapshot(overrides: Partial<HarnessVersionSnapshot> = {}): HarnessVersionSnapshot {
  return {
    status: status(),
    catalog: CATALOG,
    source: { mode: 'auto', effective: 'host', systemPath: null },
    failed: false,
    ...overrides,
  };
}

const OK: HarnessVersionResult = { ok: true };

function makeBridge(
  overrides: Partial<HarnessVersionBridge<unknown>> & {
    initial?: HarnessVersionSnapshot;
  } = {},
): HarnessVersionBridge<unknown> {
  const { initial = snapshot(), ...rest } = overrides;
  return {
    toolName: 'OpenCode CLI',
    available: true,
    capabilities: {},
    load: vi.fn(async () => initial),
    getTask: vi.fn(async () => null),
    install: vi.fn(async () => OK),
    update: vi.fn(async () => OK),
    revert: vi.fn(async () => OK),
    uninstall: vi.fn(async () => OK),
    reinstall: vi.fn(async () => OK),
    cancel: vi.fn(async () => OK),
    saveSourceMode: vi.fn(async () => OK),
    resetSourceMode: vi.fn(async () => OK),
    notify: vi.fn(),
    ...rest,
  };
}

function rowFor(version: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(`[data-harness-version-row="${version}"]`);
  if (!row) {
    throw new Error(`version row not found: ${version}`);
  }
  return row;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('HarnessVersionCard', () => {
  it('installs the selected stable version through the injected bridge', async () => {
    const bridge = makeBridge({
      initial: snapshot({
        status: status({
          currentSelected: null,
          installed: [],
          latestAvailable: '1.1.0',
        }),
      }),
    });
    renderCard(bridge);

    await waitFor(() => expect(bridge.load).toHaveBeenCalled());

    const stableSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    await waitFor(() => expect(stableSelect.value).toBe('1.1.0'));
    const stableRow = stableSelect.closest('.adl-settings-row') as HTMLElement;
    fireEvent.click(within(stableRow).getByRole('button', { name: 'harnessVersionInstall' }));

    await waitFor(() => expect(bridge.install).toHaveBeenCalledWith('1.1.0'));
    await waitFor(() =>
      expect(bridge.notify).toHaveBeenCalledWith('harnessVersionInstallStarted', 'success'),
    );
  });

  it('switches to an installed version through the injected bridge', async () => {
    const bridge = makeBridge();
    renderCard(bridge);

    await waitFor(() => expect(bridge.load).toHaveBeenCalled());

    fireEvent.click(
      within(rowFor('1.1.0')).getByRole('button', { name: 'harnessVersionSwitch' }),
    );

    await waitFor(() => expect(bridge.revert).toHaveBeenCalledWith('1.1.0'));
    await waitFor(() =>
      expect(bridge.notify).toHaveBeenCalledWith('harnessVersionSwitched', 'success'),
    );
  });

  it('marks the current version and disables switching to it', async () => {
    renderCard(makeBridge());

    await waitFor(() => expect(rowFor('1.0.0')).toBeTruthy());

    expect(
      within(rowFor('1.0.0')).getByText('harnessVersionCurrentBadge'),
    ).toBeInTheDocument();
    expect(
      within(rowFor('1.0.0')).getByRole('button', { name: 'harnessVersionSwitch' }),
    ).toBeDisabled();
    expect(
      within(rowFor('1.1.0')).getByRole('button', { name: 'harnessVersionSwitch' }),
    ).toBeEnabled();
  });

  it('disables actions while busy and lets the running task be cancelled', async () => {
    let resolveInstall!: (result: HarnessVersionResult) => void;
    const installPromise = new Promise<HarnessVersionResult>((resolve) => {
      resolveInstall = resolve;
    });
    const bridge = makeBridge();
    bridge.install = vi.fn(() => installPromise);
    bridge.getTask = vi.fn(async () => ({
      kind: 'dsh-install' as const,
      version: '1.1.0',
      phase: 'installing' as const,
      percent: 42,
      done: 42,
      total: 100,
      cancellable: true,
    }));

    renderCard(bridge);
    await waitFor(() => expect(bridge.load).toHaveBeenCalled());

    const stableSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    await waitFor(() => expect(stableSelect.value).toBe('1.0.0'));
    const stableRow = stableSelect.closest('.adl-settings-row') as HTMLElement;

    vi.useFakeTimers();
    fireEvent.click(within(stableRow).getByRole('button', { name: 'harnessVersionInstall' }));

    expect(
      within(rowFor('1.1.0')).getByRole('button', { name: 'harnessVersionSwitch' }),
    ).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(screen.getByText('42%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'harnessVersionCancel' }));
    expect(bridge.cancel).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInstall(OK);
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it('renders the not-installed and missing-harness guidance for an empty install', async () => {
    renderCard(
      makeBridge({
        initial: snapshot({
          status: status({ currentSelected: null, installed: [] }),
        }),
      }),
    );

    await waitFor(() => expect(screen.getByText('harnessVersionNotInstalled')).toBeInTheDocument());
    expect(screen.getByText('harnessVersionMissingBanner')).toBeInTheDocument();
  });

  it('renders an error readout when the status cannot be loaded', async () => {
    renderCard(
      makeBridge({
        initial: { status: null, catalog: null, source: null, failed: true },
      }),
    );

    await waitFor(() => expect(screen.getByText('harnessVersionLoadFailed')).toBeInTheDocument());
    expect(screen.queryByText('harnessVersionMissingBanner')).not.toBeInTheDocument();
  });
});
