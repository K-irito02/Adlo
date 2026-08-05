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
    expect(deepseek?.models.map((m) => m.id)).toEqual(['deepseek-chat']);
    expect(deepseek?.models[0]?.name).toBe('DeepSeek Chat');
    expect(deepseek?.models[0]?.providerId).toBe('deepseek');
  });

  it('mirrors setup.rs minimax model exactly', () => {
    const minimax = MODEL_CATALOG.find((p) => p.id === 'minimax');
    expect(minimax).toBeDefined();
    expect(minimax?.models.map((m) => m.id)).toEqual(['MiniMax-M2.7']);
    expect(minimax?.models[0]?.name).toBe('MiniMax M2.7');
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
