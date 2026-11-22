import { isTauriShell, invokeIpc } from '../../tauri-bridge/tauri-shared';
import { listen } from '@tauri-apps/api/event';
import { requestPreviewApi } from '../../shared/ipc/preview-api';
import type { PageMeta, PageMetaUpdatedPayload, MetaSource } from '../../shared/ipc/browser';
import type { SiteMetaCacheEntry } from './siteMetaBackends/types';
import { applyBroadcastUpdate, getCachedSiteMeta } from './siteMetaCache';

export interface PageMetaClient {
  peek(url: string): SiteMetaCacheEntry | undefined;
  get(url: string, opts?: { force?: boolean }): Promise<PageMeta | null>;
  getSilent(url: string): Promise<PageMeta | null>;
  /** HTTP-only 抓取（不创建隐藏 WebView）；Tauri 失败返回空字段 PageMeta，Preview 失败返回 null。 */
  fetchHttp(url: string): Promise<PageMeta | null>;
  report(meta: PageMeta, source: MetaSource): Promise<void>;
  /**
   * 刷新页面元数据：先 HTTP 取图标，再按需静默 WebView 取渲染标题。
   * `iconOnly` 为 true 时（自动补图标）HTTP 拿到 data-URI 即返回，不建隐藏 WebView。
   */
  refresh(url: string, opts?: { iconOnly?: boolean }): Promise<PageMeta | null>;
  /** 显式维护面：批量补齐入口，当前无自动调用方（启动不再预热）。 */
  warmup(urls: string[]): Promise<void>;
  subscribeUpdated(listener: (p: PageMetaUpdatedPayload) => void): () => void;
}

const EVENT = 'digital-life://page-meta-updated';

export const pageMetaClient: PageMetaClient = isTauriShell()
  ? {
      peek: (url) => getCachedSiteMeta(url),
      get: async (url, opts) => {
        const r = await invokeIpc<PageMeta>('browser_page_meta_get', {
          url,
          force: opts?.force ?? false,
        });
        return r.ok && r.data ? r.data : null;
      },
      getSilent: async (url) => {
        const http = await pageMetaClient.fetchHttp(url);
        if (http && (http.faviconDataUri || http.favicon || http.title)) {
          return http;
        }
        return null;
      },
      fetchHttp: async (url) => {
        const r = await invokeIpc<PageMeta>('browser_page_meta_fetch_http', { url });
        return r.ok && r.data ? r.data : null;
      },
      report: async (meta, source) => {
        await invokeIpc<void>('browser_page_meta_report', {
          url: meta.url,
          title: meta.title ?? '',
          favicon: meta.favicon ?? '',
          source,
        });
      },
      refresh: async (url, opts) => {
        const http = await pageMetaClient.fetchHttp(url);
        if (opts?.iconOnly && http?.faviconDataUri) {
          return http;
        }
        // 显式刷新（刷新图标与标题）：即使 HTTP 已带图标也再取一次渲染标题；
        // 当前实现下，缺少这一步时「已有图标」的站点不会取 COM 标题。
        const r = await invokeIpc<PageMeta>('browser_page_meta_refresh', { url });
        const rendered = r.ok && r.data ? r.data : null;
        if (rendered && (rendered.title || rendered.favicon || rendered.faviconDataUri)) {
          return {
            ...rendered,
            favicon: rendered.favicon || http?.favicon || '',
            faviconDataUri: rendered.faviconDataUri || http?.faviconDataUri || '',
          };
        }
        return http;
      },
      warmup: async (urls) => {
        await invokeIpc<void>('browser_page_meta_warmup', { urls });
      },
      subscribeUpdated: (listener) => {
        let active = true;
        let unlisten: (() => void) | undefined;
        void listen<PageMetaUpdatedPayload>(EVENT, (e) => {
          if (active) {
            listener(e.payload);
          }
        })
          .then((u) => {
            if (active) {
              unlisten = u;
            } else {
              void Promise.resolve(u()).catch(() => {});
            }
          })
          .catch(() => {});
        return () => {
          active = false;
          void Promise.resolve(unlisten?.()).catch(() => {});
        };
      },
    }
  : {
      peek: (url) => getCachedSiteMeta(url),
      get: async (url, opts) => {
        const r = await requestPreviewApi<PageMeta>('/browser/page-meta/get', {
          method: 'POST',
          body: JSON.stringify({ url, force: opts?.force ?? false }),
        });
        return r.ok && r.data ? r.data : null;
      },
      getSilent: async (url) => {
        const http = await pageMetaClient.fetchHttp(url);
        if (http && (http.faviconDataUri || http.favicon || http.title)) {
          return http;
        }
        return null;
      },
      fetchHttp: async (url) => {
        const r = await requestPreviewApi<PageMeta>('/browser/page-meta/get', {
          method: 'POST',
          body: JSON.stringify({ url, force: false }),
        });
        return r.ok && r.data ? r.data : null;
      },
      report: async (meta, source) => {
        await requestPreviewApi<void>('/browser/page-meta/report', {
          method: 'POST',
          body: JSON.stringify({
            url: meta.url,
            title: meta.title ?? '',
            favicon: meta.favicon ?? '',
            source,
          }),
        });
      },
      refresh: async (url, opts) => {
        const http = await pageMetaClient.fetchHttp(url);
        if (opts?.iconOnly && http?.faviconDataUri) {
          return http;
        }
        const r = await requestPreviewApi<PageMeta>('/browser/page-meta/refresh', {
          method: 'POST',
          body: JSON.stringify({ url }),
        });
        const rendered = r.ok && r.data ? r.data : null;
        if (!rendered && !http) {
          return null;
        }
        const meta: PageMeta = rendered
          ? {
              ...rendered,
              favicon: rendered.favicon || http?.favicon || '',
              faviconDataUri: rendered.faviconDataUri || http?.faviconDataUri || '',
            }
          : http!;
        // 预览模式无事件（subscribeUpdated no-op），刷新结果直接落地镜像
        applyBroadcastUpdate({
          url: meta.url,
          title: meta.title,
          faviconUrl: meta.favicon,
          faviconDataUri: meta.faviconDataUri || '',
          source: (meta.source as MetaSource | undefined) || 'http',
        });
        return meta;
      },
      warmup: async (urls) => {
        const r = await requestPreviewApi<PageMeta[]>('/browser/page-meta/warmup', {
          method: 'POST',
          body: JSON.stringify({ urls }),
        });
        // 预览模式无事件（subscribeUpdated no-op），返回的 metas 直接落地镜像
        for (const meta of r.ok ? (r.data ?? []) : []) {
          applyBroadcastUpdate({
            url: meta.url,
            title: meta.title,
            faviconUrl: meta.favicon,
            faviconDataUri: meta.faviconDataUri || '',
            source: (meta.source as MetaSource | undefined) || 'http',
          });
        }
      },
      subscribeUpdated: () => () => {}, // 预览模式事件由 Task 12 previewPageMetaService 提供
    };
