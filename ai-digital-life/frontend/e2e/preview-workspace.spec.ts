import { expect, test } from "@playwright/test";
import { openPreviewWorkspace } from "./support/previewWorkspace";

test.describe("Preview workspace bootstrap", () => {
  test("opens a real workspace in an isolated browser session", async ({ page }) => {
    await openPreviewWorkspace(page);

    await expect(page.locator(".adl-leftbar")).toBeVisible();
    await expect(page.locator(".adl-center")).toBeVisible();
    await expect(page.locator(".adl-rightpanel")).toBeVisible();

    await expect
      .poll(async () => {
        return await page.evaluate(async () => {
          const result = await window.digitalLife.workspace.listTree();
          if (!result.ok) {
            return -1;
          }
          return result.data.length;
        });
      })
      .toBeGreaterThan(0);
  });
});
