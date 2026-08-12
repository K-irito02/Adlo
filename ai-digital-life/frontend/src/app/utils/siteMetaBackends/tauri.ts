import { invokeIpc } from '../../../tauri-bridge/tauri-shared';
import type { SiteMetaBackend, SiteMetaCacheEntry } from './types';

export const tauriSiteMetaBackend: SiteMetaBackend = {
  getAll: async () => {
    const r = await invokeIpc<Record<string, SiteMetaCacheEntry>>('browser_site_meta_get_all');
    return r.ok ? (r.data ?? {}) : {};
  },
  upsert: async (entries) => {
    await invokeIpc<void>('browser_site_meta_upsert', { entries });
  },
  remove: async (urls) => {
    await invokeIpc<void>('browser_site_meta_remove', { urls });
  },
  clear: async () => {
    await invokeIpc<void>('browser_site_meta_clear');
  },
};
