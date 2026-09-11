import { describe, it, expect, vi, beforeEach } from 'vitest';
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
