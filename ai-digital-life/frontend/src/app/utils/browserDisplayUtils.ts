export function hostnameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') || url;
  } catch {
    return '';
  }
}

export function normalizeTabTitle(title: string | undefined, _url: string): string {
  if (title && !/^https?:\/\//.test(title)) {
    return title;
  }
  return '';
}

/**
 * 占位标题：空 / 等于 URL / http(s) 前缀 / 裸域名（与 useBrowserPageMeta / meta_merge 一致）。
 */
export function isPlaceholderTitle(title: string, url: string): boolean {
  if (!title) return true;
  if (title === url) return true;
  if (/^https?:\/\//i.test(title)) return true;
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    if (!host) return false;
    const t = title.trim().toLowerCase();
    return t === host || t === `www.${host}`;
  } catch {
    return false;
  }
}

/**
 * 收藏树节点标题解析（快照优先）：
 * 快照标题非占位（用户自定义）→ 返回快照标题（永不覆盖）；
 * 快照标题为占位（空 / 纯 URL / 裸域名）→ 返回服务端 metaTitle（可为空串）。
 */
export function resolveDisplayTitle(snapshotTitle: string, metaTitle: string, url: string): string {
  if (!isPlaceholderTitle(snapshotTitle, url)) {
    return snapshotTitle;
  }
  return metaTitle;
}

/**
 * Known tracking/analytics query params that carry no page identity. SPA sites
 * (Bilibili `vd_source`/`spm_id_from`/`trackid`, UTM campaigns, ad click ids)
 * mutate/append these during navigation, which would otherwise create redundant
 * history entries and break URL-based tab matching.
 */
const TRACKING_PARAM_PATTERN =
  /^(vd_source|spm_id_from|trackid|sfrom|ref|referrer|utm_source|utm_medium|utm_campaign|utm_term|utm_content|utm_id|utm_campaign_type|gclid|fbclid|yclid|igshid|igsh)$/i;

/**
 * YouTube radio/auto-play params that carry no page identity. `start_radio=1`
 * only signals "start radio"; a `list=RD...` value is an auto-generated radio
 * queue (RD = radio) that changes as the queue advances — neither should split
 * a video's history identity. `pp` and `index` are queue-progress markers that
 * also change every radio step. A real user playlist (`list=PL...`) is kept.
 */
function isNonIdentityParam(key: string, value: string): boolean {
  if (TRACKING_PARAM_PATTERN.test(key)) {
    return true;
  }
  if (key === 'start_radio') {
    return true;
  }
  if (key === 'list' && /^RD/i.test(value)) {
    return true;
  }
  return false;
}

/**
 * YouTube radio-queue progress markers (`pp`, `index`) that are meaningless for
 * history identity but change on every radio auto-advance. They only apply when
 * the URL is inside a radio queue (list=RD...).
 */
const RADIO_PROGRESS_PARAMS = /^(pp|index)$/i;

/**
 * Normalize a URL query string for identity/dedup purposes: strip known
 * tracking params and sort the remaining params (so `?b=2&a=1` and `?a=1&b=2`
 * collapse to the same key).
 */
export function normalizedQueryForDedup(search: string): string {
  if (!search) {
    return '';
  }
  const params = new URLSearchParams(search);
  // Detect radio queue (list=RD...) so queue-progress markers can be dropped.
  const isRadioQueue = Array.from(params.entries()).some(
    ([key, value]) => key === 'list' && /^RD/i.test(value),
  );
  const kept: [string, string][] = [];
  for (const [key, value] of params.entries()) {
    if (isNonIdentityParam(key, value)) {
      continue;
    }
    if (isRadioQueue && RADIO_PROGRESS_PARAMS.test(key)) {
      continue;
    }
    kept.push([key, value]);
  }
  if (kept.length === 0) {
    return '';
  }
  // Code-unit comparison (matches the C1 injected-script sorter in
  // init_script.js) so both sides produce identical normalized keys
  // regardless of locale.
  kept.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const sp = new URLSearchParams();
  for (const [k, v] of kept) {
    sp.append(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/**
 * Normalize URL for history dedup — matches by hostname+pathname+query string,
 * ignoring hash, trailing slash, and www. prefix.
 * Query params are normalized (tracking params stripped, remaining sorted) so
 * SPA pages that only differ by tracking params (e.g. Bilibili adding
 * `vd_source`) collapse into one entry, while genuinely different pages
 * (YouTube `?v=AAA` vs `?v=BBB`) stay separate.
 */
export function historyDedupKey(url: string): string {
  try {
    const u = new URL(url);
    const hostname = u.hostname.replace(/^www\./, '');
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname;
    const query = normalizedQueryForDedup(u.search);
    return `${hostname}${path}${query}`;
  } catch {
    return url;
  }
}
