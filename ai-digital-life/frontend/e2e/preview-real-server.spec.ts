import { expect, test } from '@playwright/test';

const adServerUrl = process.env.ADL_E2E_AD_SERVER_URL;

test.describe('Preview against the real ad-server', () => {
  // Only meaningful when the webServer boots via `dev:preview` (real server +
  // VITE_ADL_SERVER_URL injection). Skipped by default so the mock-path suite
  // stays independent of a running Rust engine.
  test.skip(!adServerUrl, 'set ADL_E2E_AD_SERVER_URL to exercise the real ad-server');

  test('preview page loads and the real HTTP surface responds', async ({ page }) => {
    const base = adServerUrl as string;
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => Boolean(window.digitalLife?.workspace?.open));

    // /health answers with ok:true and carries the real bound port.
    const health = await page.evaluate(async (url) => {
      const resp = await fetch(`${url}/health`);
      return resp.json();
    }, base);
    expect(health.ok).toBe(true);
    expect(typeof health.port).toBe('number');

    // GET /sessions answers through the httpBridge (business surface is up).
    const sessions = await page.evaluate(async (url) => {
      const resp = await fetch(`${url}/sessions`);
      return resp.json();
    }, base);
    expect(sessions.ok).toBe(true);

    // POST /session creates a real session row.
    const created = await page.evaluate(async (url) => {
      const resp = await fetch(`${url}/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId: 'e2e-real-server', title: 'real-server smoke' }),
      });
      return resp.json();
    }, base);
    expect(created.ok).toBe(true);
    expect(typeof created.data?.id).toBe('string');

    // The page-side SSE bridge reaches /event (cold subscribe is live-only).
    const eventSourceOk = await page.evaluate(
      async (url) =>
        new Promise<boolean>((resolve) => {
          const es = new EventSource(`${url}/event?after=latest`);
          const timer = setTimeout(() => {
            es.close();
            resolve(false);
          }, 4000);
          es.onopen = () => {
            clearTimeout(timer);
            es.close();
            resolve(true);
          };
          es.onerror = () => {
            clearTimeout(timer);
            es.close();
            resolve(false);
          };
        }),
      base,
    );
    expect(eventSourceOk).toBe(true);
  });
});
