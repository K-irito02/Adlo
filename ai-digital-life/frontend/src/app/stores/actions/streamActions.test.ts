import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useAppStore } from '../slicedStore';

describe('/model slash command', () => {
  beforeEach(() => {
    useAppStore.setState({ activeRightTool: 'files', activeSettingsGroup: 'general' });
  });

  afterEach(() => {
    useAppStore.setState({ activeRightTool: 'files', activeSettingsGroup: 'general' });
  });

  it('opens the settings tool with the providers group', async () => {
    await useAppStore.getState().sendMessage('/model');
    expect(useAppStore.getState().activeRightTool).toBe('settings');
    expect(useAppStore.getState().activeSettingsGroup).toBe('providers');
  });
});
