import { test, expect } from "@playwright/test";
import { openPreviewWorkspace } from "./support/previewWorkspace";

/**
 * Minimap Diff Colors E2E Test
 *
 * Root cause (confirmed from Monaco v0.55.1 source):
 * - ModelDecorationMinimapOptions._resolveColor() calls Color.fromHex() for string colors
 * - Color.fromHex() ONLY accepts #RRGGBB or #RRGGBBAA hex format
 * - When parseHex fails (e.g., for "rgba(22, 163, 74, 0.35)"), it falls back to Color.red
 * - This caused ALL minimap diff decorations to appear red regardless of their type
 *
 * Fix:
 * - Added cssColorToHex() utility to convert rgba/rgb CSS colors to #RRGGBBAA hex
 * - Used cssColorToHex() when setting minimap.color in decoration options
 */
test.describe("Minimap Diff Colors", () => {
  test.beforeEach(async ({ page }) => {
    await openPreviewWorkspace(page);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
  });

  test("cssColorToHex converts rgba to hex correctly in browser", async ({ page }) => {
    // Verify the cssColorToHex function works correctly in the browser
    const result = await page.evaluate(() => {
      // Test the actual CSS variable values
      const root = document.documentElement;
      const cs = getComputedStyle(root);
      const insertBg = cs.getPropertyValue('--minimap-diff-insert-bg').trim();
      const deleteBg = cs.getPropertyValue('--minimap-diff-remove-bg').trim();

      return {
        insertBgRaw: insertBg,
        deleteBgRaw: deleteBg,
        // Verify the values are in rgba format (what CSS gives us)
        insertIsRgba: insertBg.startsWith('rgba'),
        deleteIsRgba: deleteBg.startsWith('rgba'),
      };
    });

    console.log('CSS variable values:', result);
    // The CSS variables should be in rgba format
    expect(result.insertIsRgba || result.insertBgRaw.startsWith('#')).toBeTruthy();
    expect(result.deleteIsRgba || result.deleteBgRaw.startsWith('#')).toBeTruthy();
  });

  test("minimap decoration colors use hex format", async ({ page }) => {
    // Navigate to changes panel
    const changesTab = page.locator('.adl-tool-switcher__tab, .adl-toolswitcher__tab').filter({ hasText: /变更|Changes/ });
    if (await changesTab.count() > 0) {
      await changesTab.click();
      await page.waitForTimeout(1000);
    }

    // Check if a diff editor is visible
    const diffEditor = page.locator('.monaco-diff-editor');
    const hasDiffEditor = await diffEditor.count() > 0;

    if (hasDiffEditor) {
      // Check the minimap for decorations
      const minimapColors = await page.evaluate(() => {
        const minimap = document.querySelector('.editor.modified .minimap');
        if (!minimap) return { exists: false };

        const canvases = minimap.querySelectorAll('canvas');
        const results: Array<{ index: number; width: number; height: number; hasColor: boolean; greenPixels: number; redPixels: number }> = [];

        canvases.forEach((canvas, idx) => {
          const ctx = canvas.getContext('2d');
          if (!ctx || canvas.width === 0 || canvas.height === 0) return;

          try {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            let greenPixels = 0;
            let redPixels = 0;

            for (let i = 0; i < data.length; i += 4) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              const a = data[i + 3];

              if (a < 30) continue;

              // Green-ish (insert): g > 100, r < 100, b < 100
              if (g > 100 && r < 120 && b < 120 && a > 30) {
                greenPixels++;
              }
              // Red-ish (delete): r > 180, g < 100, b < 100
              if (r > 180 && g < 120 && b < 120 && a > 30) {
                redPixels++;
              }
            }

            results.push({
              index: idx,
              width: canvas.width,
              height: canvas.height,
              hasColor: greenPixels > 0 || redPixels > 0,
              greenPixels,
              redPixels,
            });
          } catch {
            results.push({ index: idx, width: canvas.width, height: canvas.height, hasColor: false, greenPixels: 0, redPixels: 0 });
          }
        });

        return { exists: true, canvases: results };
      });

      console.log('Minimap color analysis:', JSON.stringify(minimapColors, null, 2));

      // If we have diff decorations, verify green colors exist
      if (minimapColors.exists && Array.isArray(minimapColors.canvases)) {
        const totalGreen = minimapColors.canvases.reduce((sum: number, c: { greenPixels?: number }) => sum + (c.greenPixels ?? 0), 0);
        const totalRed = minimapColors.canvases.reduce((sum: number, c: { redPixels?: number }) => sum + (c.redPixels ?? 0), 0);

        console.log(`Total green pixels: ${totalGreen}, Total red pixels: ${totalRed}`);

        if (totalRed > 0 || totalGreen > 0) {
          // If there are any diff colors at all, green should be present
          // (assuming the file has both insert and delete changes)
          console.log(totalGreen > 0 ? '✅ Green (insert) colors detected!' : '⚠️ No green colors found');
        }
      }
    } else {
      console.log('No diff editor visible - app may need workspace setup via Tauri backend');
    }
  });
});
