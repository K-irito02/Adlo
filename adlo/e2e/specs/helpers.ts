import { $, browser } from '@wdio/globals';

/**
 * First run of a fresh instance shows the environment wizard on top of the shell.
 * Dismiss it by the wizard's testid, never by localized text.
 */
export async function dismissSetupWizards(): Promise<void> {
  const envWizard = await $('[data-testid="env-wizard"]');
  if (await envWizard.isExisting()) {
    const skip = await envWizard.$('[data-testid="env-wizard-skip"]');
    if (await skip.isExisting()) {
      await skip.click();
    }
    await browser.waitUntil(async () => !(await envWizard.isExisting()), {
      timeout: 10_000,
      timeoutMsg: 'environment wizard stayed open after clicking skip',
    });
  }

  // 环境向导之后还会串行出现 harness 向导；它的全屏 overlay 会盖住标题栏，
  // 原生点击用例必须先把它关掉（否则 waitForTitlebarClickable 永远等不到）。
  const harnessDone = await browser.execute(() =>
    localStorage.getItem('adl.harnessWizardDone'),
  );
  if (harnessDone) {
    return;
  }
  const harnessWizard = await $('[data-testid="harness-wizard"]');
  try {
    await browser.waitUntil(async () => await harnessWizard.isExisting(), {
      timeout: 2_000,
      interval: 100,
    });
  } catch {
    return;
  }
  const harnessSkip = await harnessWizard.$('[data-testid="harness-wizard-skip"]');
  if (await harnessSkip.isExisting()) {
    await harnessSkip.click();
  }
  await browser.waitUntil(async () => !(await harnessWizard.isExisting()), {
    timeout: 10_000,
    timeoutMsg: 'harness wizard stayed open after clicking skip',
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
