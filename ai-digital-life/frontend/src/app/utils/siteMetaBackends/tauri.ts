import { invokeIpc } from '../../../tauri-bridge/tauri-shared';
import type { SiteMetaBackend, SiteMetaCacheEntry } from './types';

export const tauriSiteMetaBackend: SiteMetaBackend = {
  getAll: async () => {
    const r = await invokeIpc<Record<string, SiteMetaCacheEntry>>('browser_site_meta_get_all');
    return r.ok ? (r.data ?? {}) : {};
  },
  upsert: async (entries) => {
    const r = await invokeIpc<void>('browser_site_meta_upsert', { entries });
    if (!r.ok) throw new Error(`site-meta upsert failed: ${r.error?.message}`);
  },
  remove: async (urls) => {
    const r = await invokeIpc<void>('browser_site_meta_remove', { urls });
    if (!r.ok) throw new Error(`site-meta remove failed: ${r.error?.message}`);
  },
  clear: async () => {
    const r = await invokeIpc<void>('browser_site_meta_clear');
    if (!r.ok) throw new Error(`site-meta clear failed: ${r.error?.message}`);
  },
};
