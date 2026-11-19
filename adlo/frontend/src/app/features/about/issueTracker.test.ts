import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ABOUT_URLS } from './aboutContent';
import { ISSUE_TRACKER_PROBE_TIMEOUT_MS, type IssueTrackerProbeResult } from './issueTracker';

const GITEE = ABOUT_URLS.giteeIssues;
const GITHUB = ABOUT_URLS.issues;

const result = (reachable: boolean, latency_ms: number | null): IssueTrackerProbeResult => ({
  reachable,
  latency_ms,
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

  it('returns GitHub when GitHub responds first while both are reachable', async () => {
    const { chooseIssueTrackerUrl } = await import('./issueTracker');
    const chosen = await chooseIssueTrackerUrl(async (url) => {
      if (url === GITEE) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return result(true, url === GITEE ? 20 : 5);
    });
    expect(chosen).toBe(GITHUB);
  });

  it('prefers Gitee when both candidates resolve in the same tick', async () => {
    const { chooseIssueTrackerUrl } = await import('./issueTracker');
    const chosen = await chooseIssueTrackerUrl(async () => result(true, 5));
    expect(chosen).toBe(GITEE);
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

  it('caches a successful choice', async () => {
    const { chooseIssueTrackerUrl } = await import('./issueTracker');
    let calls = 0;
    const probe = async (url: string) => {
      calls += 1;
      return result(url === GITEE, 10);
    };
    await expect(chooseIssueTrackerUrl(probe)).resolves.toBe(GITEE);
    await expect(chooseIssueTrackerUrl(probe)).resolves.toBe(GITEE);
    expect(calls).toBe(2);
  });

  it('does not cache a failure and allows a retry', async () => {
    const { chooseIssueTrackerUrl } = await import('./issueTracker');
    let calls = 0;
    const probe = async () => {
      calls += 1;
      return result(false, null);
    };
    await expect(chooseIssueTrackerUrl(probe)).resolves.toBe(GITHUB);
    await expect(chooseIssueTrackerUrl(probe)).resolves.toBe(GITHUB);
    expect(calls).toBe(4);
  });
});
