import { test, expect } from '@playwright/test';

test.describe('AI Digital Life - Basic UI Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load the application', async ({ page }) => {
    await expect(page).toHaveTitle(/砚|AI Digital Life/);
  });

  test('should display title bar', async ({ page }) => {
    const titlebar = page.locator('.adl-titlebar');
    await expect(titlebar).toBeVisible();
  });

  test('should display left sidebar', async ({ page }) => {
    const leftbar = page.locator('.adl-leftbar');
    await expect(leftbar).toBeVisible();
  });

  test('should display center panel', async ({ page }) => {
    const center = page.locator('.adl-center');
    await expect(center).toBeVisible();
  });

  test('should display right panel', async ({ page }) => {
    const rightpanel = page.locator('.adl-rightpanel');
    await expect(rightpanel).toBeVisible();
  });

  test('should display composer input', async ({ page }) => {
    const composer = page.locator('.adl-composer');
    await expect(composer).toBeVisible();
  });

  test('should have theme toggle button', async ({ page }) => {
    const themeBtn = page.locator('button[aria-label="主题"]');
    await expect(themeBtn).toBeVisible();
  });

  test('should have language toggle button', async ({ page }) => {
    const langBtn = page.locator('button[aria-label*="语言"]');
    await expect(langBtn).toBeVisible();
  });

  test('should toggle theme on click', async ({ page }) => {
    const themeBtn = page.locator('button[aria-label="主题"]');
    
    const initialTheme = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme');
    });
    
    await themeBtn.click();
    
    await page.waitForFunction(() => {
      const theme = document.documentElement.getAttribute('data-theme');
      return theme !== null;
    });
    
    const newTheme = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme');
    });
    
    expect(newTheme).not.toBe(initialTheme);
  });

  test('should toggle left sidebar', async ({ page }) => {
    const toggleBtn = page.locator('button[aria-label="切换左侧边栏"]');
    const leftbar = page.locator('.adl-leftbar');
    
    const initialState = await leftbar.evaluate((el) => 
      el.classList.contains('adl-leftbar--collapsed')
    );
    
    await toggleBtn.click();
    
    await page.waitForFunction(() => {
      const leftbar = document.querySelector('.adl-leftbar');
      return leftbar?.classList.contains('adl-leftbar--collapsed') !== initialState;
    });
    
    const newState = await leftbar.evaluate((el) => 
      el.classList.contains('adl-leftbar--collapsed')
    );
    
    expect(newState).not.toBe(initialState);
  });
});
