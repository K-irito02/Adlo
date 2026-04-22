import { expect, test } from "@playwright/test";

test("phase 2 workspace shell drives the single-agent patch flow", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "AI Digital Life" })).toBeVisible();
  await expect(page.locator(".adl-center__header")).toHaveCount(0);
  await expect(
    page.locator(".adl-center .adl-run-card").filter({ has: page.getByRole("heading", { name: "模型状态" }) })
  ).toHaveCount(0);
  await expect(page.getByText("欢迎进入第二阶段工作区主界面。")).toHaveCount(0);
  await expect(page.getByTestId("composer-input")).toBeVisible();

  await page.getByTestId("composer-input").fill("请更新 @packages/kernel/src/index.ts");
  await page.getByTestId("composer-send").click();

  await expect(page.getByRole("heading", { name: "Patch 预览" })).toBeVisible();
  await expect(page.getByRole("button", { name: "应用补丁" })).toBeVisible();

  await page.getByRole("button", { name: "应用补丁" }).click();

  await expect(page.getByText("Validation command completed successfully.").first()).toBeVisible();
  await expect(page.getByText("applied").first()).toBeVisible();
});
