import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../tauri-bridge/tauri-shared', () => ({
  invokeIpc: vi.fn(),
  isTauriShell: () => false,
}));

vi.mock('../../../../preview-bridge/preview-api', () => ({
  requestPreviewApi: vi.fn(),
}));

import { invokeIpc } from '../../../../tauri-bridge/tauri-shared';
import { requestPreviewApi } from '../../../../preview-bridge/preview-api';
import { tauriSiteMetaBackend } from '../tauri';
import { previewSiteMetaBackend } from '../preview';
import type { SiteMetaCacheEntry } from '../types';

const entry: SiteMetaCacheEntry = {
  title: 'A',
  faviconUrl: '',
  faviconDataUri: '',
  fetchedAt: 1,
};

describe('siteMeta backends propagate failures (ok:false must throw)', () => {
  beforeEach(() => {
    vi.mocked(invokeIpc).mockReset();
    vi.mocked(requestPreviewApi).mockReset();
  });

  it('tauri upsert throws when invokeIpc resolves ok:false', async () => {
    vi.mocked(invokeIpc).mockResolvedValue({
      ok: false,
      error: { code: 'X', message: 'tauri upsert boom' },
    });
    await expect(tauriSiteMetaBackend.upsert({ 'https://a.com/': entry })).rejects.toThrow(
      'tauri upsert boom',
    );
  });

  it('tauri remove throws when invokeIpc resolves ok:false', async () => {
    vi.mocked(invokeIpc).mockResolvedValue({
      ok: false,
      error: { code: 'X', message: 'tauri remove boom' },
    });
    await expect(tauriSiteMetaBackend.remove(['https://a.com'])).rejects.toThrow(
      'tauri remove boom',
    );
  });

  it('tauri clear throws when invokeIpc resolves ok:false', async () => {
    vi.mocked(invokeIpc).mockResolvedValue({
      ok: false,
      error: { code: 'X', message: 'tauri clear boom' },
    });
    await expect(tauriSiteMetaBackend.clear()).rejects.toThrow('tauri clear boom');
  });

  it('tauri upsert resolves when invokeIpc returns ok:true', async () => {
    vi.mocked(invokeIpc).mockResolvedValue({ ok: true, data: undefined });
    await expect(tauriSiteMetaBackend.upsert({ 'https://a.com/': entry })).resolves.toBeUndefined();
  });

  it('preview upsert throws when requestPreviewApi resolves ok:false', async () => {
    vi.mocked(requestPreviewApi).mockResolvedValue({
      ok: false,
      error: { code: 'X', message: 'preview upsert boom' },
    });
    await expect(previewSiteMetaBackend.upsert({ 'https://a.com/': entry })).rejects.toThrow(
      'preview upsert boom',
    );
  });

  it('preview remove throws when requestPreviewApi resolves ok:false', async () => {
    vi.mocked(requestPreviewApi).mockResolvedValue({
      ok: false,
      error: { code: 'X', message: 'preview remove boom' },
    });
    await expect(previewSiteMetaBackend.remove(['https://a.com'])).rejects.toThrow(
      'preview remove boom',
    );
  });

  it('preview clear throws when requestPreviewApi resolves ok:false', async () => {
    vi.mocked(requestPreviewApi).mockResolvedValue({
      ok: false,
      error: { code: 'X', message: 'preview clear boom' },
    });
    await expect(previewSiteMetaBackend.clear()).rejects.toThrow('preview clear boom');
  });

  it('preview upsert resolves when requestPreviewApi returns ok:true', async () => {
    vi.mocked(requestPreviewApi).mockResolvedValue({ ok: true, data: undefined });
    await expect(
      previewSiteMetaBackend.upsert({ 'https://a.com/': entry }),
    ).resolves.toBeUndefined();
  });
});
