import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { useAppStore } from '../../stores/slicedStore';
import type { ProviderStatus, ModelDefinition } from '../../../shared/ipc/provider';
import type { AppInfo } from '@shared/ipc';
import { ModelSettings } from './ModelSettings';

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

function makeModel(id: string, name: string, description?: string): ModelDefinition {
  return { id, providerId: '', name, description, capabilities: [] };
}

function makeProvider(
  overrides: Partial<ProviderStatus> & { id: string; name: string },
): ProviderStatus {
  return {
    description: '',
    apiType: 'openai',
    builtIn: true,
    configured: false,
    hasKey: false,
    requiresKey: true,
    baseUrl: 'https://api.example.com',
    models: [],
    enabled: true,
    enabledModels: null,
    ...overrides,
  };
}

type ProviderPreferences = AppInfo['config']['modelPreferences']['providers'];

function makeAppInfo(pref: ProviderPreferences): AppInfo {
  return {
    appName: 'test',
    version: '0.0.0',
    config: {
      language: 'en-US',
      themeMode: 'system',
      resolvedTheme: 'light',
      logLevel: 'info',
      terminalLogMode: 'overwrite',
      debugLogMode: 'overwrite',
      maxRecentWorkspaces: 5,
      modelPreferences: { providers: pref },
      keybinds: {},
      fonts: { uiFont: '', codeFont: '', terminalFont: '' },
      maxConcurrentWorkspaces: 6,
      workspacePriorityIds: [],
      workspaceDeferredIds: [],
      workspaceNaturalOrder: [],
    },
    currentWorkspace: undefined,
    recentLogs: [],
  };
}

const deepseek = makeProvider({
  id: 'deepseek',
  name: 'DeepSeek',
  builtIn: true,
  hasKey: true,
  requiresKey: true,
  models: [
    makeModel('deepseek-chat', 'DeepSeek Chat'),
    makeModel('deepseek-reasoner', 'DeepSeek Reasoner'),
  ],
});

const mystery = makeProvider({
  id: 'mystery',
  name: 'Mystery',
  builtIn: false,
  hasKey: false,
  requiresKey: true,
  baseUrl: 'https://mystery.example.com',
  enabledModels: ['mystery-1'],
  models: [makeModel('mystery-1', 'Mystery One'), makeModel('mystery-2', 'Mystery Two')],
});

const ollama = makeProvider({
  id: 'ollama',
  name: 'Ollama',
  builtIn: true,
  hasKey: false,
  requiresKey: false,
  baseUrl: 'http://localhost:11434',
});

const darkmode = makeProvider({
  id: 'darkmode',
  name: 'DarkMode',
  builtIn: true,
  hasKey: true,
  requiresKey: true,
  enabled: false,
  models: [makeModel('dark-1', 'Dark One')],
});

let spies: Record<string, Mock> = {};
let openExternalSpy: Mock;

beforeEach(() => {
  useAppStore.setState({
    providers: [deepseek, mystery, ollama],
    isFetchingProviders: false,
    connectionTestResults: {},
    testingProviderId: null,
    appInfo: makeAppInfo({
      deepseek: { enabled: true, priority: 0, modelId: 'deepseek-chat', enabledModels: null },
    }),
  });
  openExternalSpy = vi.fn().mockResolvedValue(undefined);
  (window as unknown as { digitalLife?: unknown }).digitalLife = {
    window: { openExternal: openExternalSpy },
  };
  const state = useAppStore.getState();
  spies = {
    fetchProviders: vi.spyOn(state, 'fetchProviders').mockResolvedValue(undefined) as Mock,
    setApiKey: vi.spyOn(state, 'setApiKey').mockResolvedValue(undefined) as Mock,
    clearApiKey: vi.spyOn(state, 'clearApiKey').mockResolvedValue(undefined) as Mock,
    testConnection: vi.spyOn(state, 'testConnection').mockResolvedValue(undefined) as Mock,
    fetchModels: vi.spyOn(state, 'fetchModels').mockResolvedValue(undefined) as Mock,
    removeCustomProvider: vi
      .spyOn(state, 'removeCustomProvider')
      .mockResolvedValue(undefined) as Mock,
    setProviderEnabled: vi
      .spyOn(state, 'setProviderEnabled')
      .mockImplementation(async (providerId: string, enabled: boolean) => {
        useAppStore.setState((s) => ({
          providers: s.providers.map((p) => (p.id === providerId ? { ...p, enabled } : p)),
        }));
      }) as Mock,
    toggleModel: vi.spyOn(state, 'toggleModel').mockResolvedValue(undefined) as Mock,
    setAllModelsEnabled: vi
      .spyOn(state, 'setAllModelsEnabled')
      .mockResolvedValue(undefined) as Mock,
    updatePreferences: vi.spyOn(state, 'updatePreferences').mockResolvedValue(true) as Mock,
    addCustomProvider: vi.spyOn(state, 'addCustomProvider').mockResolvedValue(undefined) as Mock,
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  (window as unknown as { digitalLife?: unknown }).digitalLife = undefined;
  useAppStore.setState({
    providers: [],
    connectionTestResults: {},
    testingProviderId: null,
  });
});

function renderSettings() {
  return render(
    <TestProvider>
      <ModelSettings />
    </TestProvider>,
  );
}

describe('ModelSettings upper zone — provider cards', () => {
  it('renders a provider card per provider with the section headers', () => {
    renderSettings();
    expect(screen.getByTestId('provider-card-deepseek')).toBeInTheDocument();
    expect(screen.getByTestId('provider-card-mystery')).toBeInTheDocument();
    expect(screen.getByTestId('provider-card-ollama')).toBeInTheDocument();
    expect(screen.getAllByText('DeepSeek').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('modelSettingsProvidersZone')).toBeInTheDocument();
    expect(screen.getByText('modelSettingsEnabledModelsZone')).toBeInTheDocument();
  });

  it('marks status dot connected when hasKey is set or requiresKey is false', () => {
    renderSettings();
    expect(
      screen.getByTestId('provider-card-deepseek').querySelector('.adl-provider-card__status-dot'),
    ).toHaveClass('is-connected');
    expect(
      screen.getByTestId('provider-card-mystery').querySelector('.adl-provider-card__status-dot'),
    ).toHaveClass('is-missing');
    expect(
      screen.getByTestId('provider-card-ollama').querySelector('.adl-provider-card__status-dot'),
    ).toHaveClass('is-connected');
  });

  it('reflects provider.enabled on the master switch and calls setProviderEnabled on click', () => {
    renderSettings();
    const card = screen.getByTestId('provider-card-deepseek');
    const master = within(card).getByRole('switch');
    expect(master).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(master);
    expect(spies.setProviderEnabled).toHaveBeenCalledWith('deepseek', false);
  });

  it('shows base URL and api key input with save/clear in the expanded area (no status chip)', () => {
    renderSettings();
    const card = screen.getByTestId('provider-card-deepseek');
    fireEvent.click(within(card).getByRole('button', { name: 'modelProviderDetailsAria' }));

    expect(within(card).getByText('https://api.example.com')).toBeInTheDocument();
    expect(within(card).queryByText('providerManagerStatusOk')).not.toBeInTheDocument();
    expect(within(card).queryByText('providerManagerStatusNoKey')).not.toBeInTheDocument();

    const input = within(card).getByPlaceholderText(
      'providerManagerApiKeyPlaceholder',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-test' } });
    fireEvent.click(within(card).getByText('providerManagerSaveKey'));
    expect(spies.setApiKey).toHaveBeenCalledWith('deepseek', 'sk-test');

    fireEvent.click(within(card).getByText('providerClear'));
    expect(spies.clearApiKey).toHaveBeenCalledWith('deepseek');
  });

  it('toggles the api key input visibility with the show/hide button', () => {
    renderSettings();
    const card = screen.getByTestId('provider-card-deepseek');
    fireEvent.click(within(card).getByRole('button', { name: 'modelProviderDetailsAria' }));

    const input = within(card).getByPlaceholderText(
      'providerManagerApiKeyPlaceholder',
    ) as HTMLInputElement;
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(within(card).getByRole('button', { name: 'providerShowKey' }));
    expect(input).toHaveAttribute('type', 'text');
    fireEvent.click(within(card).getByRole('button', { name: 'providerHideKey' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('dispatches testConnection from the expanded actions and leaves no fetch-models button', () => {
    renderSettings();
    const card = screen.getByTestId('provider-card-deepseek');
    fireEvent.click(within(card).getByRole('button', { name: 'modelProviderDetailsAria' }));

    fireEvent.click(within(card).getByText('providerManagerTestConnection'));
    expect(spies.testConnection).toHaveBeenCalledWith('deepseek');

    expect(spies.fetchModels).not.toHaveBeenCalled();
    expect(within(card).queryByText('providerManagerFetchModels')).not.toBeInTheDocument();
  });

  it('toggles the card body when the whole header expand area is clicked', () => {
    renderSettings();
    const card = screen.getByTestId('provider-card-deepseek');
    const expand = within(card).getByRole('button', { name: 'modelProviderDetailsAria' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(within(card).queryByText(/providerManagerBaseUrl/)).not.toBeInTheDocument();

    fireEvent.click(expand);
    expect(expand).toHaveAttribute('aria-expanded', 'true');
    expect(within(card).getByText(/providerManagerBaseUrl/)).toBeInTheDocument();

    fireEvent.click(expand);
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(within(card).queryByText(/providerManagerBaseUrl/)).not.toBeInTheDocument();
  });

  it('does not expand the card body when the enabled switch is clicked', () => {
    renderSettings();
    const card = screen.getByTestId('provider-card-deepseek');
    const master = within(card).getByRole('switch');
    expect(master).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(master);
    expect(spies.setProviderEnabled).toHaveBeenCalledWith('deepseek', false);
    expect(master).toHaveAttribute('aria-checked', 'false');
    expect(within(card).queryByText(/providerManagerBaseUrl/)).not.toBeInTheDocument();
  });

  it('does not render the built-in/custom meta chips on the provider card header', () => {
    renderSettings();
    const card = screen.getByTestId('provider-card-deepseek');
    expect(within(card).queryByText('providerManagerBuiltIn')).not.toBeInTheDocument();
    expect(within(card).queryByText('providerManagerCustom')).not.toBeInTheDocument();
  });

  it('keyboard Enter on the master switch does not expand the card (header does not swallow keydown)', () => {
    renderSettings();
    const card = screen.getByTestId('provider-card-deepseek');
    const master = within(card).getByRole('switch');
    fireEvent.keyDown(master, { key: 'Enter' });
    expect(within(card).queryByText(/providerManagerBaseUrl/)).not.toBeInTheDocument();
  });

  it('keyboard Enter on the header toggles the card body', () => {
    renderSettings();
    const card = screen.getByTestId('provider-card-deepseek');
    const header = within(card).getByRole('button', { name: 'modelProviderDetailsAria' });
    fireEvent.keyDown(header, { key: 'Enter' });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(within(card).getByText(/providerManagerBaseUrl/)).toBeInTheDocument();
  });

  it('keeps the eye toggle inside the key input container', () => {
    renderSettings();
    const card = screen.getByTestId('provider-card-deepseek');
    fireEvent.click(within(card).getByRole('button', { name: 'modelProviderDetailsAria' }));

    const input = within(card).getByPlaceholderText(
      'providerManagerApiKeyPlaceholder',
    ) as HTMLInputElement;
    const group = input.closest('.adl-provider-card__key-input-group') as HTMLElement;
    expect(within(group).getByRole('button', { name: 'providerShowKey' })).toBeInTheDocument();
  });

  it('places the save-key and test-connection buttons on the same action row', () => {
    renderSettings();
    const card = screen.getByTestId('provider-card-deepseek');
    fireEvent.click(within(card).getByRole('button', { name: 'modelProviderDetailsAria' }));

    const actionsRow = within(card)
      .getByText('providerManagerSaveKey')
      .closest('.adl-provider-card__actions') as HTMLElement;
    expect(within(actionsRow).getByText('providerManagerTestConnection')).toBeInTheDocument();
  });

  it('renders remove-custom only for non-builtIn providers', () => {
    renderSettings();
    const customCard = screen.getByTestId('provider-card-mystery');
    fireEvent.click(within(customCard).getByRole('button', { name: 'modelProviderDetailsAria' }));
    expect(within(customCard).getByText('providerManagerRemoveProvider')).toBeInTheDocument();

    const builtInCard = screen.getByTestId('provider-card-deepseek');
    fireEvent.click(within(builtInCard).getByRole('button', { name: 'modelProviderDetailsAria' }));
    expect(
      within(builtInCard).queryByText('providerManagerRemoveProvider'),
    ).not.toBeInTheDocument();
  });

  it('opens the custom provider dialog from the provider zone title row', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'providerManagerAddCustom' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('submits the custom provider dialog with Enter and closes it', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'providerManagerAddCustom' }));
    fireEvent.change(screen.getByPlaceholderText('providerCustomNamePlaceholder'), {
      target: { value: 'My Provider' },
    });
    fireEvent.change(screen.getByPlaceholderText('providerCustomUrlPlaceholder'), {
      target: { value: 'https://api.example.com/v1' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText('providerCustomNamePlaceholder'), {
      key: 'Enter',
    });
    await waitFor(() =>
      expect(spies.addCustomProvider).toHaveBeenCalledWith(
        'My Provider',
        'https://api.example.com/v1',
        '',
        [],
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes the custom provider dialog with Escape', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'providerManagerAddCustom' }));
    fireEvent.keyDown(document.querySelector('.adl-prompt-modal') as HTMLElement, {
      key: 'Escape',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not submit when Enter is pressed on a focused button (only on inputs)', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'providerManagerAddCustom' }));
    const actions = document.querySelector('.adl-prompt-modal__actions--fill') as HTMLElement;
    fireEvent.keyDown(within(actions).getByRole('button', { name: 'providerCancel' }), {
      key: 'Enter',
    });
    expect(spies.addCustomProvider).not.toHaveBeenCalled();
  });

  it('renders the add-custom button as a borderless ghost button and the dialog as a centered modal', () => {
    renderSettings();
    const addButton = screen.getByRole('button', { name: 'providerManagerAddCustom' });
    expect(addButton).toHaveClass('adl-btn--ghost');
    expect(addButton).not.toHaveClass('adl-btn--secondary');
    fireEvent.click(addButton);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveClass('adl-prompt-modal__panel');
    expect(document.querySelector('.adl-prompt-modal')).toBeInTheDocument();
  });

  it('sits in the provider zone title row next to the search input', () => {
    renderSettings();
    const addButton = screen.getByRole('button', { name: 'providerManagerAddCustom' });
    const zoneControls = addButton.closest('.adl-model-settings__zone-controls') as HTMLElement;
    expect(zoneControls).not.toBeNull();
    expect(
      within(zoneControls).getByPlaceholderText('modelSettingsSearchProviders'),
    ).toBeInTheDocument();
    expect(within(zoneControls).getByRole('button', { name: 'providerManagerAddCustom' })).toBe(
      addButton,
    );
  });

  it('carries the adl-model-settings ancestor class so model-region button radius scoping applies', () => {
    renderSettings();
    expect(document.querySelector('.adl-settings-section')).toHaveClass('adl-model-settings');
  });

  it('does not render a status chip row inside the expanded provider card', () => {
    renderSettings();
    const card = screen.getByTestId('provider-card-deepseek');
    fireEvent.click(within(card).getByRole('button', { name: 'modelProviderDetailsAria' }));
    expect(within(card).queryByText('providerManagerStatusOk')).not.toBeInTheDocument();
    expect(within(card).queryByText('providerManagerStatusNoKey')).not.toBeInTheDocument();
    expect(card.querySelector('.adl-chip')).toBeNull();
  });

  it('does not render the api key label above the input but keeps an accessible name', () => {
    renderSettings();
    const card = screen.getByTestId('provider-card-deepseek');
    fireEvent.click(within(card).getByRole('button', { name: 'modelProviderDetailsAria' }));
    expect(within(card).queryByText('providerManagerApiKey')).not.toBeInTheDocument();
    const input = within(card).getByPlaceholderText(
      'providerManagerApiKeyPlaceholder',
    ) as HTMLInputElement;
    expect(input).toHaveAttribute('aria-label', 'providerManagerApiKey');
  });

  it('shows the api key guide link and friendly hint for built-in providers and opens the official url', () => {
    renderSettings();
    const card = screen.getByTestId('provider-card-deepseek');
    fireEvent.click(within(card).getByRole('button', { name: 'modelProviderDetailsAria' }));

    const guide = within(card).getByRole('button', { name: 'providerApiKeyGuide' });
    expect(guide).toBeInTheDocument();
    expect(within(card).getByText('providerApiKeyGuideHint')).toBeInTheDocument();

    fireEvent.click(guide);
    expect(openExternalSpy).toHaveBeenCalledWith('https://platform.deepseek.com/api_keys');
  });

  it('shows only the friendly hint for custom providers without an official guide url', () => {
    renderSettings();
    const card = screen.getByTestId('provider-card-mystery');
    fireEvent.click(within(card).getByRole('button', { name: 'modelProviderDetailsAria' }));

    expect(
      within(card).queryByRole('button', { name: 'providerApiKeyGuide' }),
    ).not.toBeInTheDocument();
    expect(within(card).getByText('providerApiKeyGuideHint')).toBeInTheDocument();
  });

  it('shows no guide block for providers that do not require an api key', () => {
    renderSettings();
    const card = screen.getByTestId('provider-card-ollama');
    fireEvent.click(within(card).getByRole('button', { name: 'modelProviderDetailsAria' }));

    expect(within(card).queryByText('providerApiKeyGuideHint')).not.toBeInTheDocument();
    expect(
      within(card).queryByPlaceholderText('providerManagerApiKeyPlaceholder'),
    ).not.toBeInTheDocument();
  });

  it('places the test-connection button leftmost and the save button rightmost', () => {
    renderSettings();
    const card = screen.getByTestId('provider-card-deepseek');
    fireEvent.click(within(card).getByRole('button', { name: 'modelProviderDetailsAria' }));

    const actionsRow = within(card)
      .getByText('providerManagerSaveKey')
      .closest('.adl-provider-card__actions') as HTMLElement;
    const buttons = within(actionsRow).getAllByRole('button');
    expect(buttons[0].textContent).toBe('providerManagerTestConnection');
    expect(buttons[buttons.length - 1].textContent).toBe('providerManagerSaveKey');
  });

  it('sets a native title tooltip on the provider master switch showing the current state', () => {
    renderSettings();
    const card = screen.getByTestId('provider-card-deepseek');
    const master = within(card).getByRole('switch');
    expect(master).toHaveAttribute('title', 'modelProviderToggleStateEnabled');
  });
});

function makeProviders(count: number): ProviderStatus[] {
  return Array.from({ length: count }, (_, i) =>
    makeProvider({
      id: `provider-${i}`,
      name: `Provider ${i}`,
      builtIn: true,
      hasKey: false,
      requiresKey: true,
    }),
  );
}

describe('ModelSettings upper zone — collapse & search', () => {
  it('shows only the first 5 provider cards by default with a show-more button when >5 providers', () => {
    useAppStore.setState({ providers: makeProviders(7) });
    renderSettings();
    expect(screen.getByTestId('provider-card-provider-0')).toBeInTheDocument();
    expect(screen.getByTestId('provider-card-provider-4')).toBeInTheDocument();
    expect(screen.queryByTestId('provider-card-provider-5')).not.toBeInTheDocument();
    expect(screen.getByText('modelSettingsShowMoreProviders')).toBeInTheDocument();
  });

  it('shows all cards with the expanded class after clicking show more, and collapses again', () => {
    useAppStore.setState({ providers: makeProviders(7) });
    renderSettings();
    fireEvent.click(screen.getByText('modelSettingsShowMoreProviders'));
    expect(screen.getByTestId('provider-card-provider-6')).toBeInTheDocument();
    expect(screen.getByText('modelSettingsCollapseProviders')).toBeInTheDocument();
    expect(document.querySelector('.adl-model-settings__provider-grid')).toHaveClass('is-expanded');

    fireEvent.click(screen.getByText('modelSettingsCollapseProviders'));
    expect(screen.queryByTestId('provider-card-provider-5')).not.toBeInTheDocument();
  });

  it('filters the upper-zone cards by search and bypasses the 5-card limit', () => {
    useAppStore.setState({ providers: makeProviders(7) });
    renderSettings();
    const input = screen.getByPlaceholderText('modelSettingsSearchProviders') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'provider-6' } });
    expect(screen.getByTestId('provider-card-provider-6')).toBeInTheDocument();
    expect(screen.queryByTestId('provider-card-provider-0')).not.toBeInTheDocument();
    expect(screen.queryByText('modelSettingsShowMoreProviders')).not.toBeInTheDocument();
  });

  it('shows the loading row only when fetching and no providers exist yet', () => {
    useAppStore.setState({ providers: [], isFetchingProviders: true });
    renderSettings();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does not show the loading row during a background fetch when providers already exist', () => {
    useAppStore.setState({ providers: [deepseek, mystery, ollama], isFetchingProviders: true });
    renderSettings();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByTestId('provider-card-deepseek')).toBeInTheDocument();
  });
});

describe('ModelSettings lower zone — model toggle list', () => {
  it('renders model rows grouped by enabled providers only', () => {
    useAppStore.setState({ providers: [deepseek, mystery, ollama, darkmode] });
    renderSettings();
    const group = screen.getByTestId('model-group-deepseek');
    expect(within(group).getByText('DeepSeek Chat')).toBeInTheDocument();
    expect(within(group).getByText('DeepSeek Reasoner')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('model-group-mystery')).getByText('Mystery Two'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('model-group-darkmode')).not.toBeInTheDocument();
  });

  it('shows no set-default button, default badge, all-enabled hint or disabled hint', () => {
    useAppStore.setState({ providers: [deepseek, mystery, ollama, darkmode] });
    renderSettings();
    expect(screen.queryByText('modelSetDefault')).not.toBeInTheDocument();
    expect(screen.queryByText('modelDefaultBadge')).not.toBeInTheDocument();
    expect(screen.queryByText('modelAllEnabledHint')).not.toBeInTheDocument();
    expect(screen.queryByText('modelProviderDisabledHint')).not.toBeInTheDocument();
  });

  it('renders a fetch-models icon button in each group header with native title', () => {
    renderSettings();
    const group = screen.getByTestId('model-group-deepseek');
    const btn = within(group).getByRole('button', { name: 'providerManagerFetchModels' });
    expect(btn).toHaveAttribute('title', 'providerManagerFetchModels');
    fireEvent.click(btn);
    expect(spies.fetchModels).toHaveBeenCalledWith('deepseek');
  });

  it('sets a native title tooltip on model toggles showing the current state', () => {
    renderSettings();
    const group = screen.getByTestId('model-group-deepseek');
    const row = within(group).getByText('DeepSeek Chat').closest('li') as HTMLElement;
    const toggle = within(row).getByRole('switch');
    expect(toggle).toHaveAttribute('title', 'modelModelToggleStateEnabled');
  });

  it('calls toggleModel when a model switch is toggled', () => {
    renderSettings();
    const group = screen.getByTestId('model-group-deepseek');
    const row = within(group).getByText('DeepSeek Reasoner').closest('li') as HTMLElement;
    const toggle = within(row).getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    expect(spies.toggleModel).toHaveBeenCalledWith('deepseek', 'deepseek-reasoner', false);
  });

  it('calls toggleModel with true when enabling an explicitly disabled model', () => {
    renderSettings();
    const group = screen.getByTestId('model-group-mystery');
    const row = within(group).getByText('Mystery Two').closest('li') as HTMLElement;
    const toggle = within(row).getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(spies.toggleModel).toHaveBeenCalledWith('mystery', 'mystery-2', true);
  });

  it('batch enable-all calls setAllModelsEnabled(id, true)', () => {
    renderSettings();
    fireEvent.click(within(screen.getByTestId('model-group-mystery')).getByText('modelEnableAll'));
    expect(spies.setAllModelsEnabled).toHaveBeenCalledWith('mystery', true);
  });

  it('batch disable-all calls setAllModelsEnabled(id, false)', () => {
    renderSettings();
    fireEvent.click(within(screen.getByTestId('model-group-mystery')).getByText('modelDisableAll'));
    expect(spies.setAllModelsEnabled).toHaveBeenCalledWith('mystery', false);
  });

  it('renders the empty message when no provider is enabled', () => {
    useAppStore.setState({ providers: [darkmode] });
    renderSettings();
    expect(screen.getByText('providerManagerNoProviders')).toBeInTheDocument();
    expect(screen.queryByTestId('model-group-darkmode')).not.toBeInTheDocument();
  });
});
