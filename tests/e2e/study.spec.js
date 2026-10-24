import { test, expect, expectNoHorizontalScroll } from './fixtures.js';

test('original Greek word study', async ({ page }) => {
  await page.goto('./#/read/john/1/1');
  await page.locator('#original-btn').click();
  await page.locator('.verse-block[data-v="1"] .word').nth(4).click(); // λόγος
  await expect(page.locator('.dialog-body .lemma-gloss')).toBeVisible();
  await page.getByText('Full word study').click();
  await expect(page.locator('#occurrences .result').first()).toBeVisible();
});

test('verse study: compare, commentary (gzip data) and manuscript notes', async ({ page }) => {
  await page.goto('./#/study/verse/61/5/7');
  await expect(page.locator('.compare-row')).toHaveCount(5);
  await expect(page.locator('.note-box').first()).toContainText('KJV');
  await expect(page.locator('#verse-commentary .comm-section, #verse-commentary .comm-intro').first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('topics, Bible dictionary, people and places', async ({ page }) => {
  await page.goto('./#/study/topic/forgiveness');
  await expect(page.locator('.topic-line').first()).toBeVisible();
  await page.goto('./#/study/entry/tabernacle');
  await expect(page.locator('.dict-def')).toHaveCount(2);
  await page.goto('./#/study/people?q=Ruth');
  await page.locator('.name-result').first().click();
  await expect(page.locator('h1')).toHaveText('Ruth');
  await expect(page.locator('.rel-row').first()).toBeVisible();
});

test('map shows the places of a chapter', async ({ page }) => {
  await page.goto('./#/study/maps?book=43&chapter=13');
  await expect(page.locator('#places-map path.leaflet-interactive')).toHaveCount(15);
  const box = await page.locator('#places-map').boundingBox();
  const inside = await page.$$eval('#places-map path.leaflet-interactive', (els, b) => els.filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.left >= b.x && r.right <= b.x + b.width && r.top >= b.y && r.bottom <= b.y + b.height;
  }).length, box);
  expect(inside).toBe(15);
});

test('timeline lists kings', async ({ page }) => {
  await page.goto('./#/study/timeline?show=reign');
  await expect(page.locator('.tl-reign').first()).toBeVisible();
  await expect(page.locator('.tl-item:not(.tl-reign)')).toHaveCount(0);
});
