import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { useAppStore } from '../../stores/slicedStore';
import type { ProviderStatus, ModelDefinition } from '../../../shared/ipc/provider';
import { ModelPicker } from './ModelPicker';

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

function makeModel(id: string, name: string): ModelDefinition {
  return { id, providerId: '', name, description: '', capabilities: [] };
}

function makeProvider(
  overrides: Partial<ProviderStatus> & { id: string; name: string },
): ProviderStatus {
  return {
    description: '',
    apiType: 'openai',
    builtIn: true,
    configured: false,
    hasKey: true,
    requiresKey: true,
    baseUrl: 'https://api.example.com',
    models: [],
    enabled: true,
    enabledModels: null,
    ...overrides,
  };
}

beforeEach(() => {
  useAppStore.setState({
    providers: [],
    selectedProviderId: null,
    selectedModelId: null,
  });
});

afterEach(() => {
  cleanup();
  useAppStore.setState({ providers: [], selectedProviderId: null, selectedModelId: null });
});

function renderPicker() {
  render(
    <TestProvider>
      <ModelPicker />
    </TestProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'modelSelector' }));
}

describe('ModelPicker enabled-state filtering', () => {
  it('renders the empty affordance when there are no providers at all', () => {
    renderPicker();
    expect(screen.getByText('providerNoProviders')).toBeInTheDocument();
  });

  it('does not render a provider whose enabled is false (group header and models absent)', () => {
    useAppStore.setState({
      providers: [
        makeProvider({
          id: 'disabled',
          name: 'DisabledCo',
          enabled: false,
          models: [makeModel('d-model', 'Disabled Model')],
        }),
      ],
    });
    renderPicker();
    expect(screen.queryByText('DisabledCo')).not.toBeInTheDocument();
    expect(screen.queryByText('Disabled Model')).not.toBeInTheDocument();
  });

  it('renders only enabled models for an enabled provider with an explicit list', () => {
    useAppStore.setState({
      providers: [
        makeProvider({
          id: 'mix',
          name: 'MixCo',
          enabled: true,
          enabledModels: ['on-model'],
          models: [makeModel('on-model', 'On Model'), makeModel('off-model', 'Off Model')],
        }),
      ],
    });
    renderPicker();
    expect(screen.getByText('MixCo')).toBeInTheDocument();
    expect(screen.getByText('On Model')).toBeInTheDocument();
    expect(screen.queryByText('Off Model')).not.toBeInTheDocument();
  });

  it('renders all models when enabledModels is null (all enabled)', () => {
    useAppStore.setState({
      providers: [
        makeProvider({
          id: 'all',
          name: 'AllCo',
          enabled: true,
          enabledModels: null,
          models: [makeModel('m1', 'Model One'), makeModel('m2', 'Model Two')],
        }),
      ],
    });
    renderPicker();
    expect(screen.getByText('AllCo')).toBeInTheDocument();
    expect(screen.getByText('Model One')).toBeInTheDocument();
    expect(screen.getByText('Model Two')).toBeInTheDocument();
  });

  it('does not render a group for an enabled provider with zero enabled models', () => {
    useAppStore.setState({
      providers: [
        makeProvider({
          id: 'empty',
          name: 'EmptyCo',
          enabled: true,
          enabledModels: ['not-in-list'],
          models: [makeModel('m1', 'Model One'), makeModel('m2', 'Model Two')],
        }),
        makeProvider({
          id: 'other',
          name: 'OtherCo',
          enabled: true,
          models: [makeModel('other-model', 'Other Model')],
        }),
      ],
    });
    renderPicker();
    expect(screen.queryByText('EmptyCo')).not.toBeInTheDocument();
    expect(screen.getByText('OtherCo')).toBeInTheDocument();
    expect(screen.getByText('Other Model')).toBeInTheDocument();
  });

  it('shows the empty affordance when every provider is disabled', () => {
    useAppStore.setState({
      providers: [
        makeProvider({
          id: 'off',
          name: 'OffCo',
          enabled: false,
          models: [makeModel('m1', 'Model One')],
        }),
      ],
    });
    renderPicker();
    expect(screen.getByText('providerNoProviders')).toBeInTheDocument();
    expect(screen.queryByText('OffCo')).not.toBeInTheDocument();
  });

  it('calls selectModel when an enabled option is clicked', () => {
    const selectModel = vi.fn();
    useAppStore.setState({
      providers: [
        makeProvider({
          id: 'a',
          name: 'ACo',
          enabled: true,
          models: [makeModel('a-model', 'A Model')],
        }),
      ],
      selectModel,
    });
    renderPicker();
    fireEvent.click(screen.getByText('A Model'));
    expect(selectModel).toHaveBeenCalledWith('a', 'a-model');
  });
});
