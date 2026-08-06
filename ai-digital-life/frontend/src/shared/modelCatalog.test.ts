import { describe, it, expect } from 'vitest';
import { MODEL_CATALOG } from './modelCatalog';

describe('MODEL_CATALOG', () => {
  it('contains exactly 7 builtin providers', () => {
    expect(MODEL_CATALOG).toHaveLength(7);
  });

  it('has unique provider ids', () => {
    const ids = MODEL_CATALOG.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('mirrors setup.rs deepseek model exactly', () => {
    const deepseek = MODEL_CATALOG.find((p) => p.id === 'deepseek');
    expect(deepseek).toBeDefined();
    expect(deepseek?.models.map((m) => m.id)).toEqual([
      'deepseek-chat',
      'deepseek-v4-flash',
      'deepseek-v4-pro',
    ]);
    expect(deepseek?.models[0]?.name).toBe('DeepSeek Chat');
    expect(deepseek?.models[0]?.providerId).toBe('deepseek');
    expect(deepseek?.models[1]?.providerId).toBe('deepseek');
    expect(deepseek?.models[2]?.providerId).toBe('deepseek');
  });

  it('mirrors setup.rs minimax model exactly', () => {
    const minimax = MODEL_CATALOG.find((p) => p.id === 'minimax');
    expect(minimax).toBeDefined();
    expect(minimax?.baseUrl).toBe('https://api.minimaxi.com/v1');
    expect(minimax?.models.map((m) => m.id)).toEqual([
      'MiniMax-M3',
      'MiniMax-M2.7',
      'MiniMax-M2.7-highspeed',
      'MiniMax-M2.5',
      'MiniMax-M2.5-highspeed',
      'MiniMax-M2.1',
      'MiniMax-M2.1-highspeed',
      'MiniMax-M2',
    ]);
    expect(minimax?.models[0]?.name).toBe('MiniMax M3');
    expect(minimax?.models.every((m) => m.providerId === 'minimax')).toBe(true);
  });

  it('requiresKey is false only for ollama', () => {
    for (const p of MODEL_CATALOG) {
      expect(p.requiresKey).toBe(p.id !== 'ollama');
    }
  });

  it('every provider has non-empty models', () => {
    for (const p of MODEL_CATALOG) {
      expect(p.models.length).toBeGreaterThan(0);
    }
  });
});
