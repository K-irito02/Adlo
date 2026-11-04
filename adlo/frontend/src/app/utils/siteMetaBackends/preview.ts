import { requestPreviewApi } from '../../../shared/ipc/preview-api';
import type { SiteMetaBackend, SiteMetaCacheEntry } from './types';

const PREFIX = '/browser/site-meta-cache';

export const previewSiteMetaBackend: SiteMetaBackend = {
  getAll: async () => {
    const r = await requestPreviewApi<Record<string, SiteMetaCacheEntry>>(`${PREFIX}`);
    return r.ok ? (r.data ?? {}) : {};
  },
  upsert: async (entries) => {
    const r = await requestPreviewApi<void>(`${PREFIX}`, {
      method: 'PUT',
      body: JSON.stringify({ entries }),
    });
    if (!r.ok) {
      throw new Error(`site-meta upsert failed: ${r.error?.message}`);
    }
  },
  remove: async (urls) => {
    const r = await requestPreviewApi<void>(`${PREFIX}`, {
      method: 'DELETE',
      body: JSON.stringify({ urls }),
    });
    if (!r.ok) {
      throw new Error(`site-meta remove failed: ${r.error?.message}`);
    }
  },
  clear: async () => {
    const r = await requestPreviewApi<void>(`${PREFIX}`, {
      method: 'DELETE',
      body: JSON.stringify({ clearAll: true }),
    });
    if (!r.ok) {
      throw new Error(`site-meta clear failed: ${r.error?.message}`);
    }
  },
};
