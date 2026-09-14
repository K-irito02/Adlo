import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { terminalOutputStore } from '../terminalOutputStore';

const mockSave = vi.fn();
const mockLoad = vi.fn();
const mockDelete = vi.fn();

Object.defineProperty(window, 'digitalLife', {
  value: {
    terminalOutput: { save: mockSave, load: mockLoad, delete: mockDelete },
  },
  writable: true,
});

describe('terminalOutputStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSave.mockResolvedValue({ ok: true });
    mockLoad.mockResolvedValue({ ok: true, data: null });
    mockDelete.mockResolvedValue({ ok: true });
  });

  it('save calls bridge with sessionId and output', async () => {
    await terminalOutputStore.save('sess-1', 'hello world');
    expect(mockSave).toHaveBeenCalledWith('sess-1', 'hello world');
  });

  it('load returns data from bridge', async () => {
    mockLoad.mockResolvedValue({ ok: true, data: 'stored output' });
    const result = await terminalOutputStore.load('sess-1');
    expect(result).toBe('stored output');
  });

  it('load returns null when not found', async () => {
    const result = await terminalOutputStore.load('nonexistent');
    expect(result).toBeNull();
  });

  it('delete calls bridge with sessionId', async () => {
    await terminalOutputStore.delete('sess-1');
    expect(mockDelete).toHaveBeenCalledWith('sess-1');
  });

  it('save swallows errors gracefully', async () => {
    mockSave.mockRejectedValue(new Error('network'));
    await expect(terminalOutputStore.save('sess-1', 'data')).resolves.not.toThrow();
  });

  it('load returns null on error', async () => {
    mockLoad.mockRejectedValue(new Error('network'));
    const result = await terminalOutputStore.load('sess-1');
    expect(result).toBeNull();
  });
});

describe('terminalOutputStore.save', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('服务端返回 ok:false 时返回 false（而非静默成功）', async () => {
    vi.stubGlobal('window', {
      digitalLife: {
        terminalOutput: {
          save: async () => ({ ok: false, error: { code: 'INVALID_INPUT', message: 'too large' } }),
        },
      },
    });
    await expect(terminalOutputStore.save('s1', 'x')).resolves.toBe(false);
  });

  it('ok:true 时返回 true', async () => {
    vi.stubGlobal('window', {
      digitalLife: { terminalOutput: { save: async () => ({ ok: true, data: undefined }) } },
    });
    await expect(terminalOutputStore.save('s1', 'x')).resolves.toBe(true);
  });

  it('抛异常时返回 false', async () => {
    vi.stubGlobal('window', {
      digitalLife: {
        terminalOutput: {
          save: async () => {
            throw new Error('network down');
          },
        },
      },
    });
    await expect(terminalOutputStore.save('s1', 'x')).resolves.toBe(false);
  });
});
