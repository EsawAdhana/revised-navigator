import { test } from '@playwright/test';
test('debug html', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000); // wait a bit
    const html = await page.content();
    console.log("HTML_CONTENT_START");
    console.log(html);
    console.log("HTML_CONTENT_END");
});
