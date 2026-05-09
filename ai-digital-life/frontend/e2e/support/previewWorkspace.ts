import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";

const ACTIVE_WORKSPACE_STORAGE_KEY = "adl.preview.active-workspace.v1";
const __filename = fileURLToPath(import.meta.url);
const supportDir = path.dirname(__filename);
const defaultWorkspacePath = process.env.ADL_E2E_WORKSPACE ?? path.resolve(supportDir, "..", "..", "..");

export async function gotoPreviewApp(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForFunction(() => Boolean(window.digitalLife?.workspace?.open));
}

export async function openPreviewWorkspace(page: Page, workspacePath = defaultWorkspacePath): Promise<void> {
  await gotoPreviewApp(page);

  await page.evaluate(
    ([storageKey, targetWorkspacePath]) => {
      window.localStorage.setItem(storageKey, targetWorkspacePath);
    },
    [ACTIVE_WORKSPACE_STORAGE_KEY, workspacePath] as const
  );
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForFunction(() => Boolean(window.digitalLife?.app?.getInfo));

  await expect
    .poll(async () => {
      return await page.evaluate(async () => {
        const result = await window.digitalLife.app.getInfo();
        if (!result.ok) {
          return undefined;
        }
        return result.data.currentWorkspace?.rootPath;
      });
    })
    .toBe(workspacePath);
}

export async function openWorkspaceFile(page: Page, relativePath: string): Promise<void> {
  await page.evaluate(async (targetPath) => {
    const result = await window.digitalLife.workspace.readFile(targetPath);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
  }, relativePath);
}
