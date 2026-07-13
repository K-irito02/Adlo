import { describe, expect, it } from 'vitest';
import {
  applySlashScenarioOverride,
  augmentPromptWithChips,
  chatModeToScenario,
} from './composerSend';

describe('composerSend', () => {
  it('maps chat mode to API scenario', () => {
    expect(chatModeToScenario('plan')).toBe('plan');
    expect(chatModeToScenario('ask')).toBe('chat');
    expect(chatModeToScenario('debug')).toBe('code-edit');
  });

  it('augments with chips', async () => {
    const out = await augmentPromptWithChips('hello', [{ id: '1', kind: 'file', label: 'x.rs' }]);
    expect(out).toContain('x.rs');
    expect(out).toContain('hello');
  });

  it('overrides scenario from /plan prefix', async () => {
    const { scenario, prompt } = await applySlashScenarioOverride('/plan do thing', 'chat');
    expect(scenario).toBe('plan');
    expect(prompt).toContain('do thing');
  });
});
