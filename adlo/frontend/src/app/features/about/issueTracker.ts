import { ABOUT_URLS } from './aboutContent';

/**
 * 「问题反馈」入口的网络选择。
 *
 * 复用下载源探针（`testSource`）：它与真实下载共用同一套代理语义，能反映
 * 用户当前网络对 GitHub / Gitee 的实际可达性。两个入口并发探测，先返回且可达
 * 者胜出；Gitee 候选在前，仅在同时返回时占先。全部失败/超时回退 GitHub，
 * 保持原行为。
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
  url: string;
}

/** Gitee 在前：两者同时返回时偏向国内网络。 */
export const ISSUE_TRACKER_CANDIDATES: readonly IssueTrackerCandidate[] = [
  { url: ABOUT_URLS.giteeIssues },
  { url: ABOUT_URLS.issues },
];

/** 用户点击后最多等多久；超时回退 GitHub，避免无反馈的长等待。 */
export const ISSUE_TRACKER_PROBE_TIMEOUT_MS = 2500;

const ISSUE_TRACKER_CACHE_TTL_MS = 5 * 60 * 1000;

let cached: { url: string; at: number } | null = null;
let inFlight: Promise<string> | null = null;

/**
 * 并发探测两个问题入口，取最先可达者；最多等待 2.5s，失败/超时回退 GitHub。
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
