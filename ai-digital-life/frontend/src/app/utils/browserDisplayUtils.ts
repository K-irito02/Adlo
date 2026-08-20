export function hostnameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') || url;
  } catch {
    return '';
  }
}

export function normalizeTabTitle(title: string | undefined, url: string): string {
  if (title && !isPlaceholderTitle(title, url)) {
    return title;
  }
  // 无真实标题/占位标题（空、纯URL、主机、主机+路径如 "douyin.com/jingxuan"）时，
  // 回退主机名（如 "douyin.com"）——Chrome/Edge 语义，通用所有站点。
  return hostnameFromUrl(url);
}

/**
 * 反爬/验证码/安全校验拦截页占位标题检测（与 Rust `adl_browser::is_unsafe_title` 镜像对齐）。
 * 命中视为"未抓到真实标题"，调用方回退宿主名而非显示验证码页标题。
 */
export function isUnsafeTitle(title: string): boolean {
  const lower = (title || '').trim().toLowerCase();
  if (!lower) {
    return false;
  }
  return [
    '验证码',
    '人机验证',
    '安全验证',
    '滑动验证',
    '行为验证',
    '访问验证',
    '安全检查',
    '身份验证',
    '异常访问',
    '访问被拦截',
    '访问拒绝',
    'please confirm you are a human',
    'captcha',
    'verify you are human',
    'are you human',
    'anti-bot',
    'antibot',
    'confirm you are not a robot',
    'robot check',
    'access denied',
    'forbidden',
  ].some((kw) => lower.includes(kw));
}

/**
 * 无 scheme 的"主机[/路径]"标签（如 "douyin.com"、"douyin.com/jingxuan"、"m.youtube.com/watch"）。
 * SPA 水合前 document.title 常回落成这种 URL 片段，属于占位而非真实标题。
 */
const SCHEME_LESS_URL_LABEL =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[\S]*)?$/i;

/**
 * 占位标题：空 / 等于 URL / http(s) 前缀 / 裸域名 / 无 scheme 的主机+路径标签
 * （与 useBrowserPageMeta / meta_merge 一致）。
 */
export function isPlaceholderTitle(title: string, url: string): boolean {
  if (!title) {
    return true;
  }
  if (title === url) {
    return true;
  }
  if (/^https?:\/\//i.test(title)) {
    return true;
  }
  const trimmed = title.trim();
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    if (!host) {
      return false;
    }
    const t = trimmed.toLowerCase();
    if (t === host || t === `www.${host}`) {
      return true;
    }
  } catch {
    return false;
  }
  return SCHEME_LESS_URL_LABEL.test(trimmed);
}

/**
 * 收藏树节点标题解析（快照优先）：
 * 快照标题非占位（用户自定义）→ 返回快照标题（永不覆盖）；
 * 快照标题为占位（空 / 纯 URL / 裸域名）→ 优先返回服务端 metaTitle（可为空串）。
 *
 * 修复：当 metaTitle 为空或本身就是占位（如 JS/SPA 站抓不到真实标题）时，
 * 回退快照占位（宿主名），保证收藏节点永不显示空标题。
 */
export function resolveDisplayTitle(snapshotTitle: string, metaTitle: string, url: string): string {
  if (!isPlaceholderTitle(snapshotTitle, url)) {
    return snapshotTitle;
  }
  if (metaTitle && !isPlaceholderTitle(metaTitle, url)) {
    return metaTitle;
  }
  return snapshotTitle;
}

/**
 * 站点标题展示解析（仓库"已打开标签页/书签"节点使用；Chrome/Edge 语义 + 去中间态跳动）。
 *
 * 优先级：
 * 1. 真实标题（storedTitle / metaTitle 非占位）→ 直接返回真实标题；
 * 2. 已确认抓取结算（resolved=true）但仍无真实标题 → 回退主机名（兜底）；
 * 3. 尚未确认（resolved=false，抓取/加载中）→ 返回空串占位，等真实标题到达后直接显示，
 *    避免"主机名 → 真实标题"的中间态跳动。
 *
 * @param storedTitle 存储标题（标签 live 标题 / 书签快照标题）
 * @param metaTitle   站点缓存元数据标题（getCachedTitle）
 * @param url         页面 URL，用于占位/回退判定与主机名解析
 * @param resolved    该 URL 元数据是否已抓取结算（isSiteMetaResolved）
 */
export function resolveSiteTitle(
  storedTitle: string,
  metaTitle: string,
  url: string,
  resolved: boolean,
): string {
  if (storedTitle && !isPlaceholderTitle(storedTitle, url)) {
    return storedTitle;
  }
  if (metaTitle && !isPlaceholderTitle(metaTitle, url)) {
    return metaTitle;
  }
  if (resolved) {
    return hostnameFromUrl(url);
  }
  return '';
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

/**
 * 是否携带"视图身份"参数 modal_id（抖音等 SPA 视频弹层）。
 * 同一 path 下每个视频以 modal_id 区分；不带 modal_id 的同 path URL 只是
 * "容器/scaffold"（feed 骨架），并非独立视图。与 normalizeUrlForCompare 的
 * modal_id 特判约定保持一致。
 */
export function hasViewIdentityParam(url: string): boolean {
  try {
    return new URL(url).searchParams.has('modal_id');
  } catch {
    return false;
  }
}

/**
 * "容器"身份键：剥离 modal_id 后计算的历史键。
 * 视频条目与其 base 脚手架共享同一容器键，用于识别并清理冗余的 base 条目，
 * 使历史中只保留具体视频条目（Chrome/Edge 式：每个刷到的视频各自成条，
 * 不重复累积/跳位基础 URL）。
 */
export function historyContainerKey(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete('modal_id');
    return historyDedupKey(u.toString());
  } catch {
    return historyDedupKey(url);
  }
}

/**
 * 页面/文档"内容身份"参数：值一旦不同即视为不同的资源/页面（跨站点通用）。
 * SPA 导航突发中的来源/导航参数（from_*、enter_*、showTab 等）不会出现在此，
 * 而 YouTube `v`、Bilibili `bvid`、搜索引擎 `q`、抖音视频弹层 `modal_id`、
 * 淘宝/京东商品 `id`/`skuId`/`itemId`、今日头条/抖音 `aid`、Google/百度搜索
 * `search_query`/`wd`、通用 `keyword` 属于内容身份，值变化时不得合并
 * （Chrome/Edge 语义：同一文档合并，不同内容各自成条）。
 */
const IDENTITY_PARAM_PATTERN = /^(modal_id|v|bvid|q|id|skuId|itemId|aid|search_query|wd|keyword)$/i;

/**
 * 历史合并用的"文档键"：hostname + pathname + 身份参数值（仅 IDENTITY_PARAM_PATTERN）。
 * 同一文档（同 hostname+pathname+身份参数值）在一段导航窗口内到达的 URL 变体
 * （如抖音一次点击产生的 user/self?from_nav=1 / ?from_tab_name=... / 裸 user/self）
 * 应合并为一条历史；不同内容（YouTube v=AAA → v=BBB、不同 modal_id、不同 q）则分开。
 */
export function historyDocumentKey(url: string): string {
  try {
    const u = new URL(url);
    const hostname = u.hostname.replace(/^www\./, '');
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname;
    const identity: string[] = [];
    for (const [key, value] of u.searchParams.entries()) {
      if (IDENTITY_PARAM_PATTERN.test(key)) {
        identity.push(`${key}=${value}`);
      }
    }
    identity.sort();
    return identity.length ? `${hostname}${path}?${identity.join('&')}` : `${hostname}${path}`;
  } catch {
    return url;
  }
}
