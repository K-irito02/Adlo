import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@stores/slicedStore';

const reset = () =>
  useAppStore.setState({
    activeRightTool: 'files',
    activeSettingsGroup: 'general',
    aboutDialogRequest: null,
    settingsSearchQuery: '',
    rightCollapsed: true,
  });

describe('openAboutLicense', () => {
  beforeEach(reset);

  it('switches to settings → about, clears the settings search and requests the license dialog', () => {
    useAppStore.setState({ settingsSearchQuery: 'theme' });
    useAppStore.getState().openAboutLicense();

    const state = useAppStore.getState();
    expect(state.activeRightTool).toBe('settings');
    expect(state.activeSettingsGroup).toBe('about');
    expect(state.aboutDialogRequest).toBe('license');
    expect(state.settingsSearchQuery).toBe('');
    expect(state.rightCollapsed).toBe(false);
  });
});

describe('openShortcutsSettings', () => {
  beforeEach(reset);

  it('switches to shortcuts and clears the settings search', () => {
    useAppStore.setState({ settingsSearchQuery: 'theme' });
    useAppStore.getState().openShortcutsSettings();

    const state = useAppStore.getState();
    expect(state.activeRightTool).toBe('settings');
    expect(state.activeSettingsGroup).toBe('shortcuts');
    expect(state.settingsSearchQuery).toBe('');
    expect(state.rightCollapsed).toBe(false);
  });
});
