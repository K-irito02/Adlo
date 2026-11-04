import { describe, it, expect } from 'vitest';
import {
  type ConfigTransform,
  createConfigState,
  applyTransform,
  reloadFromBase,
  rollbackLastTransform,
} from '../configStateMachine';

const baseConfig = {
  language: 'zh-CN',
  themeMode: 'system' as const,
  logLevel: 'info',
};

describe('ConfigStateMachine', () => {
  it('creates initial state with empty transform log', () => {
    const state = createConfigState(baseConfig);
    expect(state.current.language).toBe('zh-CN');
    expect(state.transforms).toHaveLength(0);
  });

  it('applyTransform modifies current config and appends transform', () => {
    const state = createConfigState(baseConfig);
    const transform: ConfigTransform = {
      type: 'SET_LANGUAGE',
      payload: { language: 'en-US' },
      timestamp: 1000,
    };
    const next = applyTransform(state, transform);
    expect(next.current.language).toBe('en-US');
    expect(next.transforms).toHaveLength(1);
    expect(next.transforms[0].type).toBe('SET_LANGUAGE');
  });

  it('reloadFromBase replays all transforms on a new base', () => {
    const state = createConfigState(baseConfig);
    const t1: ConfigTransform = {
      type: 'SET_LANGUAGE',
      payload: { language: 'en-US' },
      timestamp: 1000,
    };
    const t2: ConfigTransform = {
      type: 'SET_THEME',
      payload: { themeMode: 'dark' as const },
      timestamp: 2000,
    };
    let current = applyTransform(state, t1);
    current = applyTransform(current, t2);

    const newBase = { ...baseConfig, language: 'ja-JP' };
    const reloaded = reloadFromBase(newBase, current.transforms);
    expect(reloaded.current.language).toBe('en-US');
    expect(reloaded.current.themeMode).toBe('dark');
    expect(reloaded.transforms).toHaveLength(2);
  });

  it('rollbackLastTransform removes the last transform', () => {
    const state = createConfigState(baseConfig);
    const t1: ConfigTransform = {
      type: 'SET_LANGUAGE',
      payload: { language: 'en-US' },
      timestamp: 1000,
    };
    const t2: ConfigTransform = {
      type: 'SET_THEME',
      payload: { themeMode: 'dark' as const },
      timestamp: 2000,
    };
    let current = applyTransform(applyTransform(state, t1), t2);
    current = rollbackLastTransform(current);
    expect(current.transforms).toHaveLength(1);
    expect(current.current.language).toBe('en-US');
    expect(current.current.themeMode).toBe('system');
  });

  it('rollbackLastTransform on empty log returns same state', () => {
    const state = createConfigState(baseConfig);
    const result = rollbackLastTransform(state);
    expect(result).toBe(state);
  });
});
