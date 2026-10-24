import { test, expect, expectNoHorizontalScroll } from './fixtures.js';

test('today screen shows the verse of the day', async ({ page }) => {
  await page.goto('./#/today');
  await expect(page.locator('.votd-text')).not.toBeEmpty();
  await expectNoHorizontalScroll(page);
});

test('read, highlight, bookmark and add a note', async ({ page }) => {
  await page.goto('./#/read/john/3/16');
  const verse = page.locator('.verse[data-v="16"]');
  await expect(verse).toContainText('For God so loved the world');
  await verse.click();
  await expect(page.locator('#action-ref')).toHaveText('John 3:16');
  await page.locator('.swatch[data-color="yellow"]').click();
  await expect(verse).toHaveAttribute('data-hl', 'yellow');
  await verse.click();
  await page.locator('[data-action="note"]').click();
  await page.locator('#note-text').fill('God’s love for the whole world');
  await page.locator('[data-save]').click();
  await expect(page.locator('.verse[data-v="16"] [data-note]')).toBeVisible();
  await page.goto('./#/library/notes');
  await expect(page.locator('.note-text')).toHaveText('God’s love for the whole world');
  await expectNoHorizontalScroll(page);
});

test('more menu actions: memorize, pray and copy', async ({ page }) => {
  await page.goto('./#/read/philippians/4/6');
  await page.locator('.verse[data-v="6"]').click();
  await page.locator('[data-action="more"]').click();
  await page.locator('[data-pick="memorize"]').click();
  await expect(page.locator('#toast')).toContainText('memory verses');
  await page.locator('.verse[data-v="7"]').click();
  await page.locator('[data-action="more"]').click();
  await page.locator('[data-pick="pray"]').click();
  await page.locator('#p-title').fill('Peace for my family');
  await page.locator('#prayer-form [type="submit"]').click();
  await page.goto('./#/library/prayers');
  await expect(page.locator('.prayer .ref-chip')).toHaveText('Philippians 4:7');
});

test('switch translation and read side by side', async ({ page }) => {
  await page.goto('./#/read/matthew/17/21');
  await page.locator('#translation-btn').click();
  await page.locator('[data-parallel="bsb"]').click();
  await expect(page.locator('.pr-b[data-pv="21"] .omitted')).toBeVisible(); // Matthew 17:21 is not in the BSB
  await expect(page.locator('#translation-btn')).toContainText('BSB');
  await expectNoHorizontalScroll(page);
});

test('search finds verses and jumps to references', async ({ page }) => {
  await page.goto('./#/search?q=%22be%20still%22');
  await expect(page.locator('.result').first()).toBeVisible();
  await page.goto('./#/search?q=Rom%208%3A28');
  await expect(page.locator('.result').first()).toContainText('Go to Romans 8:28');
});
