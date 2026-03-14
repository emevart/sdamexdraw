import { test } from "@playwright/test";

const PROBLEM_URL =
  "/math/ege-prof/problems/types/97aacc07-1e63-4875-9067-adadbbcd5192?topics=a90c58b1-f249-467a-8ec0-6b1f68687770";

test.describe("Whiteboard visual checks", () => {
  test.setTimeout(120_000);

  test("open whiteboard and interact", async ({ page }) => {
    const proj = test.info().project.name;

    await page.goto(PROBLEM_URL, { timeout: 30_000 });

    // Wait for actual problem content to load (not skeletons)
    await page.waitForSelector('[placeholder*="Введите ответ"]', {
      timeout: 60_000,
    });
    await page.waitForTimeout(2000);

    // Dismiss cookie banner
    const cookieBtn = page.locator('button:has-text("Принять все")');
    if ((await cookieBtn.count()) > 0) {
      await cookieBtn.click();
      await page.waitForTimeout(500);
    }

    // Screenshot 1: page loaded
    await page.screenshot({ path: `e2e/screenshots/01-page-${proj}.png` });

    // Click the input area to activate it
    const inputTrigger = page
      .locator('[placeholder*="Введите ответ"]')
      .first();
    await inputTrigger.click();
    await page.waitForTimeout(1500);

    // Screenshot 2: input area active
    await page.screenshot({ path: `e2e/screenshots/02-input-${proj}.png` });

    // Find "Доска" in dropdown. The attachment menu is a DropdownMenu.
    // Click the trigger that opens it (Paperclip/Plus icon button near the textarea).
    // Try clicking all small icon buttons near the input until "Доска" menuitem appears.
    let found = false;
    const allButtons = page.locator("button");
    const btnCount = await allButtons.count();

    for (let i = btnCount - 1; i >= Math.max(0, btnCount - 20); i--) {
      const btn = allButtons.nth(i);
      if (!(await btn.isVisible())) continue;

      try {
        await btn.click({ timeout: 500 });
      } catch {
        continue;
      }
      await page.waitForTimeout(300);

      const doskaItem = page.locator(
        '[role="menuitem"]:has-text("Доска")',
      );
      if ((await doskaItem.count()) > 0) {
        await doskaItem.first().click();
        found = true;
        break;
      }
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }

    if (!found) {
      console.log("Could not find Доска menuitem");
      await page.screenshot({
        path: `e2e/screenshots/02-no-doska-${proj}.png`,
      });
      return;
    }

    // Wait for whiteboard to render
    await page.waitForTimeout(5000);

    // Screenshot 3: whiteboard visible
    await page.screenshot({ path: `e2e/screenshots/03-whiteboard-${proj}.png` });

    // Check if excalidraw loaded
    const excalidraw = page.locator(".excalidraw");
    if ((await excalidraw.count()) > 0) {
      // Draw a rectangle
      const rectBtn = page.locator('[data-testid="toolbar-rectangle"]');
      if ((await rectBtn.count()) > 0) {
        await rectBtn.click();
        const canvas = page.locator("canvas").first();
        const box = await canvas.boundingBox();
        if (box) {
          const cx = box.x + box.width / 2;
          const cy = box.y + box.height / 2;
          await page.mouse.move(cx - 60, cy - 40);
          await page.mouse.down();
          await page.mouse.move(cx + 60, cy + 40, { steps: 5 });
          await page.mouse.up();
          await page.waitForTimeout(1000);

          // Screenshot 4: rectangle with properties panel
          await page.screenshot({
            path: `e2e/screenshots/04-rect-props-${proj}.png`,
          });
        }
      }
    } else {
      console.log(
        "Excalidraw not found — provider may be tldraw or feature flag is off",
      );
    }
  });
});
