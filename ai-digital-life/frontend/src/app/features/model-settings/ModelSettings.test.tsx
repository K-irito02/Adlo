import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
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
    enabledModels: [],
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

let spies: Record<string, Mock> = {};

beforeEach(() => {
  useAppStore.setState({
    providers: [deepseek, mystery, ollama],
    isFetchingProviders: false,
    connectionTestResults: {},
    testingProviderId: null,
    appInfo: makeAppInfo({
      deepseek: { enabled: true, priority: 0, modelId: 'deepseek-chat', enabledModels: [] },
    }),
  });
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
    setProviderEnabled: vi.spyOn(state, 'setProviderEnabled').mockResolvedValue(undefined) as Mock,
    toggleModel: vi.spyOn(state, 'toggleModel').mockResolvedValue(undefined) as Mock,
    setDefaultModel: vi.spyOn(state, 'setDefaultModel').mockResolvedValue(undefined) as Mock,
    updatePreferences: vi.spyOn(state, 'updatePreferences').mockResolvedValue(undefined) as Mock,
    addCustomProvider: vi.spyOn(state, 'addCustomProvider').mockResolvedValue(undefined) as Mock,
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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

  it('shows base URL, key chip and api key input with save/clear in the expanded area', () => {
    renderSettings();
    const card = screen.getByTestId('provider-card-deepseek');
    fireEvent.click(within(card).getByRole('button', { name: 'modelProviderDetailsAria' }));

    expect(within(card).getByText('https://api.example.com')).toBeInTheDocument();
    expect(within(card).getByText('providerManagerStatusOk')).toBeInTheDocument();

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

  it('dispatches testConnection and fetchModels from the expanded actions', () => {
    renderSettings();
    const card = screen.getByTestId('provider-card-deepseek');
    fireEvent.click(within(card).getByRole('button', { name: 'modelProviderDetailsAria' }));

    fireEvent.click(within(card).getByText('providerManagerTestConnection'));
    expect(spies.testConnection).toHaveBeenCalledWith('deepseek');

    fireEvent.click(within(card).getByText('providerManagerFetchModels'));
    expect(spies.fetchModels).toHaveBeenCalledWith('deepseek');
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

  it('opens the custom provider dialog from the header action', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'providerManagerAddCustom' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('ModelSettings lower zone — model toggle list', () => {
  it('renders model rows grouped by provider', () => {
    renderSettings();
    const group = screen.getByTestId('model-group-deepseek');
    expect(within(group).getByText('DeepSeek Chat')).toBeInTheDocument();
    expect(within(group).getByText('DeepSeek Reasoner')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('model-group-mystery')).getByText('Mystery Two'),
    ).toBeInTheDocument();
  });

  it('shows the all-enabled hint when enabledModels is empty', () => {
    renderSettings();
    expect(
      within(screen.getByTestId('model-group-deepseek')).getByText('modelAllEnabledHint'),
    ).toBeInTheDocument();
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

  it('batch enable-all patches enabledModels to empty', () => {
    renderSettings();
    fireEvent.click(within(screen.getByTestId('model-group-mystery')).getByText('modelEnableAll'));
    expect(spies.updatePreferences).toHaveBeenCalledWith({
      modelPreferences: { mystery: { enabledModels: [] } },
    });
  });

  it('batch disable-all calls setProviderEnabled(false)', () => {
    renderSettings();
    fireEvent.click(within(screen.getByTestId('model-group-mystery')).getByText('modelDisableAll'));
    expect(spies.setProviderEnabled).toHaveBeenCalledWith('mystery', false);
  });

  it('marks the current default model and calls setDefaultModel', () => {
    renderSettings();
    const group = screen.getByTestId('model-group-deepseek');
    const defaultRow = within(group).getByText('DeepSeek Chat').closest('li') as HTMLElement;
    expect(within(defaultRow).getByText('modelDefaultBadge')).toBeInTheDocument();

    const reasonerRow = within(group).getByText('DeepSeek Reasoner').closest('li') as HTMLElement;
    fireEvent.click(within(reasonerRow).getByText('modelSetDefault'));
    expect(spies.setDefaultModel).toHaveBeenCalledWith('deepseek', 'deepseek-reasoner');
  });
});
