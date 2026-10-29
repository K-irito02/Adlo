import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { CopyDict } from '@i18n';
import { TCopyProvider } from '@i18n/TCopyContext';
import { useAppStore } from '@stores/slicedStore';
import { HarnessVersionCard } from '../HarnessVersionCard';
import type {
  HarnessVersionBridge,
  HarnessVersionResult,
  HarnessVersionSnapshot,
  HarnessVersionStatus,
} from '../harnessVersionBridge';
import { DshVersionReadout } from '@features/dsh/DshVersionReadout';

/**
 * 旧 DSH 版本管理块的结构契约（基线 `2ea69fd7` 的 `DshVersionManagement` + `dsh-version.css`）：
 * 单张 `adl-settings-card`、行顺序 source → current → check/update → stable → prerelease →
 * official-links、行内 channel picker 菜单、行内读数（含骨架/徽章/latest/卸载提示）。
 * 通用卡片改用中性前缀 `adl-harness-version__*` 复刻这套结构；DSH 默认不渲染
 * 手动版本行与已安装独立卡（能力门控 `extraRows`，默认 `'none'`）。
 */

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

function status(overrides: Partial<HarnessVersionStatus> = {}): HarnessVersionStatus {
  return {
    currentSelected: '1.1.0',
    installed: ['1.1.0', '1.0.0'],
    latestAvailable: '1.2.0',
    hasUpdate: true,
    prereleaseAvailable: '2.0.0-rc.2',
    hasPrereleaseUpdate: false,
    prereleaseUnknown: false,
    ...overrides,
  };
}

const CATALOG = {
  stable: [
    { version: '1.2.0', publishedAt: '2026-01-02T03:04:00Z' },
    { version: '1.1.0', publishedAt: '2026-01-01T00:00:00Z' },
    { version: '1.0.0', publishedAt: null },
  ],
  prerelease: [
    { version: '2.0.0-rc.2', publishedAt: '2026-02-02T03:04:00Z' },
    { version: '2.0.0-rc.1', publishedAt: null },
  ],
  latestStable: '1.2.0',
  latestPrerelease: '2.0.0-rc.2',
};

function snapshot(overrides: Partial<HarnessVersionSnapshot> = {}): HarnessVersionSnapshot {
  return {
    status: status(),
    catalog: CATALOG,
    source: { mode: 'auto', effective: 'host', systemPath: null, ready: true },
    failed: false,
    ...overrides,
  };
}

const OK: HarnessVersionResult = { ok: true };

/** DSH 形态：双通道选择器 + 卸载确认 + 只检查更新 + 官方术语标签（旧行结构）。 */
function dshBridge(
  overrides: Partial<HarnessVersionBridge<unknown>> & { initial?: HarnessVersionSnapshot } = {},
): HarnessVersionBridge<unknown> {
  const { initial = snapshot(), ...rest } = overrides;
  return {
    toolName: 'settingsDsh',
    available: true,
    capabilities: {
      channelPicker: true,
      uninstallConfirm: true,
      updateAction: 'check',
      taskPercent: false,
      taskCounts: true,
      sourceManaged: true,
      resetSourceAction: false,
      extraRows: 'none',
    },
    labels: {
      stable: 'dshOfficialStable',
      prerelease: 'dshPrereleaseTitle',
      uninstallCurrentHint: 'dshUninstallCurrentHint',
    },
    load: vi.fn(async () => initial),
    getTask: vi.fn(async () => null),
    install: vi.fn(async () => OK),
    update: vi.fn(async () => OK),
    checkUpdate: vi.fn(async () => OK),
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

function renderDshCard(bridge: HarnessVersionBridge<unknown>) {
  return render(
    <TCopyProvider t={mockT} locale="en-US">
      <HarnessVersionCard
        bridge={bridge}
        slots={{
          hideHeader: true,
          sourceHint: 'dshVersionSourceHint',
          sourceOptions: [
            { value: 'auto', label: 'dshVersionSourceAuto' },
            { value: 'system', label: 'dshVersionSourceSystem' },
            { value: 'host', label: 'dshVersionSourceHost' },
          ],
          sourceNote: (
            <>
              <small className="adl-harness-version__row-warn">dshSystemManagedNote</small>
            </>
          ),
          currentHint: 'dshCurrentVersionHint',
          stableHint: 'dshOfficialStableHint',
          prereleaseHint: 'dshPrereleaseHint',
          runtimeReadout: (
            <span className="adl-harness-version__readout-value">
              1.1.0
              <span className="adl-harness-version__badge adl-harness-version__badge--update">
                harnessVersionHasUpdate
              </span>
            </span>
          ),
          footer: (
            <div className="adl-settings-row" data-settings-row="dshOfficialLinksLabel">
              <div className="adl-settings-row__label">
                <div className="adl-settings-row__label-text">
                  <span>dshOfficialLinksLabel</span>
                </div>
              </div>
            </div>
          ),
        }}
      />
    </TCopyProvider>,
  );
}

function mainCard(container: HTMLElement): HTMLElement {
  const cards = container.querySelectorAll('.adl-harness-version .adl-settings-card');
  expect(cards).toHaveLength(1);
  return cards[0] as HTMLElement;
}

function rowMarkers(card: HTMLElement): (string | null)[] {
  return Array.from(card.querySelectorAll(':scope > .adl-settings-row')).map((row) =>
    row.getAttribute('data-settings-row'),
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useAppStore.setState({
    sourceStatus: null,
    versionStatus: null,
    versionCatalog: null,
    settingsSnapshotFailed: false,
    dshVersionSourcePending: null,
  });
});

describe('HarnessVersionCard old-DSH structure', () => {
  it('renders exactly one settings card with the old six-row order', async () => {
    const bridge = dshBridge();
    const { container } = renderDshCard(bridge);
    // 首屏快照落定后断言（`load` 被调用不等于快照已应用；picker 按钮只在落定后出现）。
    await screen.findByRole('button', { name: '1.1.0' });

    const card = mainCard(container);
    expect(rowMarkers(card)).toEqual([
      'harnessVersionSourceTitle',
      'harnessVersionCurrent',
      'harnessVersionUpdate',
      'dshOfficialStable',
      'dshPrereleaseTitle',
      'dshOfficialLinksLabel',
    ]);
  });

  it('renders the source row first with a select and the warn-note slot', async () => {
    const bridge = dshBridge();
    const { container } = renderDshCard(bridge);
    // 首屏快照落定后断言（`load` 被调用不等于快照已应用；picker 按钮只在落定后出现）。
    await screen.findByRole('button', { name: '1.1.0' });

    const card = mainCard(container);
    const sourceRow = card.querySelector(
      ':scope > .adl-settings-row[data-settings-row="harnessVersionSourceTitle"]',
    ) as HTMLElement;
    expect(sourceRow).not.toBeNull();
    // 旧实现是自定义下拉（SettingsSelect），不是原生 select。
    expect(sourceRow.querySelector('select')).toBeNull();
    expect(
      within(sourceRow).getByRole('button', { name: 'harnessVersionSourceTitle' }),
    ).not.toBeNull();
    expect(sourceRow.querySelector('.adl-harness-version__row-warn')?.textContent).toBe(
      'dshSystemManagedNote',
    );
  });

  it('keeps the current row readout inline with badges and the uninstall hint slot', async () => {
    const bridge = dshBridge();
    const { container } = renderDshCard(bridge);
    // 首屏快照落定后断言（`load` 被调用不等于快照已应用；picker 按钮只在落定后出现）。
    await screen.findByRole('button', { name: '1.1.0' });

    const card = mainCard(container);
    const currentRow = card.querySelector(
      ':scope > .adl-settings-row[data-settings-row="harnessVersionCurrent"]',
    ) as HTMLElement;
    expect(currentRow).not.toBeNull();
    const readout = currentRow.querySelector('.adl-harness-version__readout');
    expect(readout).not.toBeNull();
    expect(readout?.querySelector('.adl-harness-version__readout-value')).not.toBeNull();
    expect(readout?.querySelector('.adl-harness-version__badge--update')).not.toBeNull();
  });

  it('opens the channel picker menu with version/time/badges/check-slot and aria wiring', async () => {
    const bridge = dshBridge();
    const { container } = renderDshCard(bridge);
    // 首屏快照落定后断言（`load` 被调用不等于快照已应用；picker 按钮只在落定后出现）。
    await screen.findByRole('button', { name: '1.1.0' });

    const card = mainCard(container);
    const stableRow = card.querySelector(
      ':scope > .adl-settings-row[data-settings-row="dshOfficialStable"]',
    ) as HTMLElement;
    const picker = within(stableRow).getByRole('button', { name: '1.1.0' });
    expect(picker.className).toContain('adl-harness-version__version-picker');
    expect(picker).toHaveAttribute('aria-haspopup', 'listbox');
    expect(picker).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(picker);
    expect(picker).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('listbox');
    expect(menu.className).toContain('adl-harness-version__version-menu');
    const options = within(menu).getAllByRole('option');
    expect(options).toHaveLength(3);
    for (const option of options) {
      expect(option.className).toContain('adl-harness-version__version-menu-item');
      expect(option).toHaveAttribute('aria-selected');
      expect(
        option.querySelector('.adl-harness-version__version-menu-item-version'),
      ).not.toBeNull();
      expect(option.querySelector('.adl-harness-version__version-menu-item-badges')).not.toBeNull();
      // 勾号槽位常驻：徽章不因勾号出现而位移。
      expect(option.querySelectorAll('.adl-harness-version__version-menu-item-check')).toHaveLength(
        1,
      );
    }
    const current = options.find((o) => o.textContent?.includes('1.1.0'))!;
    expect(current.getAttribute('aria-selected')).toBe('true');
    expect(current.textContent).toContain('harnessVersionCurrentBadge');
    expect(current.textContent).not.toContain('harnessVersionInstalled');
  });

  it('has no new-prefix remnants without an old counterpart', async () => {
    const bridge = dshBridge();
    const { container } = renderDshCard(bridge);
    // 首屏快照落定后断言（`load` 被调用不等于快照已应用；picker 按钮只在落定后出现）。
    await screen.findByRole('button', { name: '1.1.0' });

    mainCard(container);
    for (const cls of [
      'adl-harness-version__value',
      'adl-harness-version__hint',
      'adl-harness-version__note',
      'adl-harness-version__channel',
      'adl-harness-version__channel-time',
      'adl-harness-version__actions',
      'adl-harness-version__progress',
      'adl-harness-version__menu-item-action',
      'adl-harness-version__picker-check',
      'adl-harness-version__dialog-message',
    ]) {
      expect(container.getElementsByClassName(cls).length, cls).toBe(0);
    }
  });

  it('renders no manual row and no separate installed card for the DSH default', async () => {
    const bridge = dshBridge();
    const { container } = renderDshCard(bridge);
    // 首屏快照落定后断言（`load` 被调用不等于快照已应用；picker 按钮只在落定后出现）。
    await screen.findByRole('button', { name: '1.1.0' });

    mainCard(container);
    expect(container.querySelector('[data-settings-row="harnessVersionManual"]')).toBeNull();
    expect(container.querySelector('[data-settings-row="harnessVersionInstalled"]')).toBeNull();
    expect(container.querySelectorAll('.adl-settings-card')).toHaveLength(1);
  });
});

describe('DshVersionReadout old-DSH readout structure', () => {
  function seedStore() {
    useAppStore.setState({
      sourceStatus: {
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
      },
      versionStatus: status(),
      settingsSnapshotFailed: false,
      dshRestarting: false,
      dshVersionSourcePending: null,
    });
  }

  it('renders the readout fragment without its own readout wrapper', () => {
    seedStore();
    const { container } = render(
      <TCopyProvider t={mockT} locale="en-US">
        <div className="adl-harness-version__readout">
          <DshVersionReadout busy={false} />
        </div>
      </TCopyProvider>,
    );
    const readout = container.querySelector('.adl-harness-version__readout')!;
    // 读数容器由卡片提供，插槽只渲染片段：容器内没有嵌套的第二层 readout。
    expect(readout.querySelector('.adl-harness-version__readout')).toBeNull();
    expect(readout.querySelector('.adl-harness-version__readout-value')).not.toBeNull();
    expect(readout.querySelector('.adl-harness-version__badge--update')).not.toBeNull();
    expect(readout.querySelector('.adl-harness-version__readout-sub')).toBeNull();
    // 最新可用版本行用独立的 latest 类（与副行区分）。
    expect(readout.querySelector('.adl-harness-version__latest')?.textContent).toBe('dshLatest');
  });

  it('renders the skeleton with role=status while busy', () => {
    seedStore();
    const { container } = render(
      <TCopyProvider t={mockT} locale="en-US">
        <div className="adl-harness-version__readout">
          <DshVersionReadout busy />
        </div>
      </TCopyProvider>,
    );
    const loading = container.querySelector('.adl-harness-version__readout-loading');
    expect(loading).not.toBeNull();
    expect(loading?.getAttribute('role')).toBe('status');
  });

  it('renders the empty value with is-empty when nothing is installed', () => {
    useAppStore.setState({
      sourceStatus: {
        system: null,
        running: null,
        versionSource: {
          mode: 'host',
          effective: 'none',
          resolvedByMode: { auto: 'none', host: 'none', system: 'none' },
          hostVersion: null,
        },
        config: {
          npm_registry: 'https://registry.npmjs.org',
          dsh_mirror: null,
          source_mode: 'manual',
          version_source: 'host',
          proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
        },
      },
      versionStatus: status({ currentSelected: null, installed: [] }),
      dshVersionSourcePending: null,
    });
    const { container } = render(
      <TCopyProvider t={mockT} locale="en-US">
        <div className="adl-harness-version__readout">
          <DshVersionReadout busy={false} />
        </div>
      </TCopyProvider>,
    );
    const value = container.querySelector('.adl-harness-version__readout-value');
    expect(value?.className).toContain('is-empty');
  });
});
