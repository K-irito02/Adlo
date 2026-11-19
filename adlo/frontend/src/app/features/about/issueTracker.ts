import { ABOUT_URLS } from './aboutContent';

/**
 * 「问题反馈」入口的网络选择。
 *
 * 复用下载源探针（`testSource`）：它与真实下载共用同一套代理语义，能反映
 * 用户当前网络对 GitHub / Gitee 的实际可达性与延迟。选择规则是「先到先得」：
 * 两个入口并发探测，第一个可达的胜出；Gitee 在候选顺序里靠前，因此同时可达
 * 时偏向国内网络。全部失败/超时回退 GitHub，保持原行为。
 */

export interface IssueTrackerProbeResult {
  reachable: boolean;
  latency_ms: number | null;
}

export type IssueTrackerTestSource = (
  url: string,
  silent?: boolean,
) => Promise<IssueTrackerProbeResult | null | undefined>;

export interface IssueTrackerCandidate {
  key: 'gitee' | 'github';
  url: string;
}

/** Gitee 在前：两者同时可达时偏向国内网络。 */
export const ISSUE_TRACKER_CANDIDATES: readonly IssueTrackerCandidate[] = [
  { key: 'gitee', url: ABOUT_URLS.giteeIssues },
  { key: 'github', url: ABOUT_URLS.issues },
];

/** 用户点击后最多等多久；超时回退 GitHub，避免无反馈的长等待。 */
export const ISSUE_TRACKER_PROBE_TIMEOUT_MS = 2500;

const ISSUE_TRACKER_CACHE_TTL_MS = 5 * 60 * 1000;

let cached: { url: string; at: number } | null = null;
let inFlight: Promise<string> | null = null;

/**
 * 纯规则：在已探测结果中取「可达且延迟最低」的候选；延迟相同按候选顺序
 * （Gitee 在前）。全部不可达时回退 GitHub。
 */
export function pickIssueTrackerUrl(
  probes: readonly (
    | { url: string; reachable: boolean; latency_ms: number | null }
    | null
    | undefined
  )[],
): string {
  let best: { url: string; latency_ms: number | null } | null = null;
  for (const probe of probes) {
    if (!probe?.reachable) {
      continue;
    }
    if (
      best === null ||
      (probe.latency_ms ?? Number.MAX_SAFE_INTEGER) < (best.latency_ms ?? Number.MAX_SAFE_INTEGER)
    ) {
      best = probe;
    }
  }
  return best?.url ?? ABOUT_URLS.issues;
}

/**
 * 并发探测两个问题入口，取最快可达者；最多等待 2.5s，失败/超时回退 GitHub。
 * 成功结果缓存 5 分钟，避免每次点击都等待网络；失败不缓存，便于网络恢复后重试。
 */
export async function chooseIssueTrackerUrl(testSource: IssueTrackerTestSource): Promise<string> {
  if (cached && Date.now() - cached.at < ISSUE_TRACKER_CACHE_TTL_MS) {
    return cached.url;
  }
  if (inFlight) {
    return inFlight;
  }

  inFlight = firstReachable(testSource)
    .then((url) => {
      const chosen = url ?? ABOUT_URLS.issues;
      if (url) {
        cached = { url, at: Date.now() };
      }
      return chosen;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

function firstReachable(testSource: IssueTrackerTestSource): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    let pending = ISSUE_TRACKER_CANDIDATES.length;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (url: string | null) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
      resolve(url);
    };

    timer = setTimeout(() => finish(null), ISSUE_TRACKER_PROBE_TIMEOUT_MS);

    for (const candidate of ISSUE_TRACKER_CANDIDATES) {
      Promise.resolve()
        .then(() => testSource(candidate.url, true))
        .then((result) => {
          pending -= 1;
          if (result?.reachable) {
            finish(candidate.url);
            return;
          }
          if (pending === 0) {
            finish(null);
          }
        })
        .catch(() => {
          pending -= 1;
          if (pending === 0) {
            finish(null);
          }
        });
    }
  });
}
