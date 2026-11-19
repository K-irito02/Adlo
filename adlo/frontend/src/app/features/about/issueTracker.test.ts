import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ABOUT_URLS } from './aboutContent';
import {
  ISSUE_TRACKER_PROBE_TIMEOUT_MS,
  pickIssueTrackerUrl,
  type IssueTrackerProbeResult,
} from './issueTracker';

const GITEE = ABOUT_URLS.giteeIssues;
const GITHUB = ABOUT_URLS.issues;

const result = (reachable: boolean, latency_ms: number | null): IssueTrackerProbeResult => ({
  reachable,
  latency_ms,
});

describe('pickIssueTrackerUrl', () => {
  it('prefers the fastest reachable tracker', () => {
    expect(
      pickIssueTrackerUrl([
        { url: GITEE, ...result(true, 80) },
        { url: GITHUB, ...result(true, 20) },
      ]),
    ).toBe(GITHUB);
    expect(
      pickIssueTrackerUrl([
        { url: GITEE, ...result(true, 20) },
        { url: GITHUB, ...result(true, 80) },
      ]),
    ).toBe(GITEE);
  });

  it('prefers Gitee when latencies tie (candidate order)', () => {
    expect(
      pickIssueTrackerUrl([
        { url: GITEE, ...result(true, 20) },
        { url: GITHUB, ...result(true, 20) },
      ]),
    ).toBe(GITEE);
  });

  it('falls back to GitHub when nothing is reachable', () => {
    expect(
      pickIssueTrackerUrl([
        null,
        { url: GITEE, ...result(false, null) },
        { url: GITHUB, ...result(false, null) },
      ]),
    ).toBe(GITHUB);
  });
});

describe('chooseIssueTrackerUrl', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns Gitee when it is reachable first', async () => {
    const { chooseIssueTrackerUrl } = await import('./issueTracker');
    const chosen = await chooseIssueTrackerUrl(async (url) =>
      url === GITEE ? result(true, 12) : result(false, null),
    );
    expect(chosen).toBe(GITEE);
  });

  it('returns GitHub when only GitHub is reachable', async () => {
    const { chooseIssueTrackerUrl } = await import('./issueTracker');
    const chosen = await chooseIssueTrackerUrl(async (url) =>
      url === GITHUB ? result(true, 12) : result(false, null),
    );
    expect(chosen).toBe(GITHUB);
  });

  it('falls back to GitHub when both probes fail', async () => {
    const { chooseIssueTrackerUrl } = await import('./issueTracker');
    const chosen = await chooseIssueTrackerUrl(async () => result(false, null));
    expect(chosen).toBe(GITHUB);
  });

  it('falls back to GitHub when probes exceed the timeout', async () => {
    vi.useFakeTimers();
    try {
      const { chooseIssueTrackerUrl } = await import('./issueTracker');
      const pending = chooseIssueTrackerUrl(() => new Promise(() => {}));
      await vi.advanceTimersByTimeAsync(ISSUE_TRACKER_PROBE_TIMEOUT_MS);
      await expect(pending).resolves.toBe(GITHUB);
    } finally {
      vi.useRealTimers();
    }
  });
});
