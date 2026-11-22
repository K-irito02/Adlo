import { $, browser } from '@wdio/globals';

/**
 * Dismiss the first-run overlay on top of the shell, if present.
 *
 * E2E builds set VITE_ADL_SKIP_FIRST_RUN=1, so the automatic first-run
 * provisioning wizard should not appear. This helper still handles explicit
 * resume / older builds by closing `first-run-wizard`.
 */
export async function dismissSetupWizards(): Promise<void> {
  const firstRunWizard = await $('[data-testid="first-run-wizard"]');
  if (!(await firstRunWizard.isExisting())) {
    return;
  }
  const close = await firstRunWizard.$('[data-testid="first-run-wizard-close"]');
  await close.waitForExist({
    timeout: 30_000,
    timeoutMsg:
      'first-run wizard did not finish; e2e builds should set VITE_ADL_SKIP_FIRST_RUN=1',
  });
  await close.click();
  await browser.waitUntil(async () => !(await firstRunWizard.isExisting()), {
    timeout: 10_000,
    timeoutMsg: 'first-run wizard stayed open after clicking close',
  });
}

/**
 * The app keeps a full-screen startup overlay for at least 3.5s. Instead of sleeping,
 * wait until the titlebar toggle is the topmost element at its own center.
 */
export async function waitForTitlebarClickable(): Promise<void> {
  await browser.waitUntil(
    async () =>
      (await browser.execute(() => {
        const el = document.querySelector('.adl-iconstrip__button--paneltoggle');
        if (!el) {
          return false;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          return false;
        }
        const top = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return top !== null && (top === el || el.contains(top));
      })) === true,
    {
      timeout: 30_000,
      interval: 250,
      timeoutMsg: 'titlebar toggle never became clickable (startup overlay still on top?)',
    },
  );
}
