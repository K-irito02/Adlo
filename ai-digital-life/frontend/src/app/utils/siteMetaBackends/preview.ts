import { requestPreviewApi } from '../../../preview-bridge/preview-api';
import type { SiteMetaBackend, SiteMetaCacheEntry } from './types';

const PREFIX = '/browser/site-meta-cache';

export const previewSiteMetaBackend: SiteMetaBackend = {
  getAll: async () => {
    const r = await requestPreviewApi<Record<string, SiteMetaCacheEntry>>(`${PREFIX}`);
    return r.ok ? (r.data ?? {}) : {};
  },
  upsert: async (entries) => {
    await requestPreviewApi<void>(`${PREFIX}`, {
      method: 'PUT',
      body: JSON.stringify({ entries }),
    });
  },
  remove: async (urls) => {
    await requestPreviewApi<void>(`${PREFIX}`, {
      method: 'DELETE',
      body: JSON.stringify({ urls }),
    });
  },
  clear: async () => {
    await requestPreviewApi<void>(`${PREFIX}`, {
      method: 'DELETE',
      body: JSON.stringify({ clearAll: true }),
    });
  },
};
