import { describe, it, expect } from 'vitest';
import { adaptSunburstData } from '../chartDataAdapters';

describe('adaptSunburstData', () => {
  it('unwraps { tree } wrapper from backend payload', () => {
    const input = {
      tree: {
        name: 'root',
        type: 'directory',
        children: [{ name: 'src', type: 'directory', children: [] }],
      },
    };
    const result = adaptSunburstData(input);
    expect(result.name).toBe('root');
    expect(result.children).toHaveLength(1);
    expect(result.children?.[0].name).toBe('src');
  });

  it('maps size to value recursively on leaf nodes', () => {
    const input = {
      tree: {
        name: 'root',
        type: 'directory',
        children: [{ name: 'main.js', type: 'file', size: 120 }],
      },
    };
    const result = adaptSunburstData(input);
    expect(result.children?.[0].value).toBe(120);
  });

  it('drops the type field from output nodes', () => {
    const input = {
      tree: {
        name: 'root',
        type: 'directory',
        children: [{ name: 'f.js', type: 'file', size: 1 }],
      },
    };
    const result = adaptSunburstData(input);
    expect((result as unknown as Record<string, unknown>).type).toBeUndefined();
    expect(result.children?.[0]).not.toHaveProperty('type');
  });

  it('returns empty root for null/undefined/{} input', () => {
    expect(adaptSunburstData(null)).toEqual({ name: '', children: [] });
    expect(adaptSunburstData(undefined)).toEqual({ name: '', children: [] });
    expect(adaptSunburstData({})).toEqual({ name: '', children: [] });
  });

  it('accepts bare root node without { tree } wrapper', () => {
    const input = { name: 'root', children: [{ name: 'a', size: 1 }] };
    const result = adaptSunburstData(input);
    expect(result.name).toBe('root');
    expect(result.children?.[0].value).toBe(1);
  });
});
