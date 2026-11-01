import { test, expect, expectNoHorizontalScroll } from './fixtures.js';

test('read the Bible as stories', async ({ page }) => {
  const total = (await (await page.request.get('data/stories.json')).json()).reduce((n, s) => n + s.stories.length, 0);
  await page.goto('./#/stories');
  await expect(page.locator('.story-row')).toHaveCount(total);
  await page.locator('#story-filter').fill('prodigal');
  await expect(page.locator('.story-list li:not([hidden])')).toHaveCount(1);
  await page.locator('.story-list li:not([hidden]) a').click();
  await expect(page.locator('.story h1')).toHaveText('The Prodigal Son');
  await expect(page.locator('.story-intro')).toContainText('runaway son');
  await expect(page.locator('.story-text p').first()).toBeVisible();
  // Stories default to the readable BSB; switch to KJV.
  await expect(page.locator('[data-story-t="bsb"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-story-t="kjv"]').click();
  await expect(page.locator('.story-text')).toContainText('A certain man had two sons');
  await expectNoHorizontalScroll(page);
  // Listening plays just this story and stops at its last verse.
  await page.locator('#story-listen').click();
  await expect(page.locator('#player-ref')).toContainText('The Prodigal Son');
  await expect(page.locator('#player')).toBeHidden({ timeout: 20_000 });
  const spoken = await page.evaluate(() => window.__spoken.map((s) => s.text));
  expect(spoken.length).toBe(22); // Luke 15:11-32
  // Next story marks this one as read.
  await page.locator('[data-finish]').click();
  await expect(page.locator('.story h1')).toHaveText('The Pharisee and the Tax Collector');
  await page.goto('./#/stories');
  await expect(page.locator('.story-row.read')).toHaveCount(1);
});

test('today suggests the next story', async ({ page }) => {
  await page.goto('./#/today');
  await expect(page.getByText('Start with Creation')).toBeVisible();
});

test('story questions and the one-story-a-day plan', async ({ page }) => {
  await page.goto('./#/stories/goliath');
  await expect(page.locator('#story-questions h2')).toHaveText('Talk about it');
  await expect(page.locator('#story-questions li').first()).toContainText('?');
  await page.goto('./#/plans');
  await page.locator('[data-start="stories"]').click();
  await expect(page.locator('.reading-list a').first()).toContainText('Creation');
  await page.locator('.reading-list a').first().click();
  await expect(page.locator('.story h1')).toHaveText('Creation');
  await page.locator('[data-finish]').click(); // finishing the story completes day 1
  await page.goto('./#/plans');
  await expect(page.locator('[data-done="0"]')).toBeChecked();
});

test('kids stories: pictures, simple text, listening and a quiz with stars', async ({ page }) => {
  await page.goto('./#/stories');
  await page.locator('[data-story-mode="kids"]').click();
  await expect(page.locator('.kids-card')).toHaveCount(40);
  await expect(page.locator('.kids-card svg').first()).toBeVisible();
  await page.locator('.kids-card', { hasText: 'Noah and the Flood' }).click();
  await expect(page.locator('.story-art svg')).toBeVisible();
  await expect(page.locator('.kids-text')).toContainText('two by two');
  await page.locator('#story-listen').click();
  await expect(page.locator('#player-ref')).toContainText('Noah and the Flood · part');
  await expect(page.locator('#player')).toBeHidden({ timeout: 20_000 });
  // Answer the quiz: two right, one wrong.
  await page.locator('[data-q="0"] [data-option="2"]').click(); // An ark (right)
  await expect(page.locator('[data-q="0"] .right')).toHaveText('An ark');
  await page.locator('[data-q="1"] [data-option="1"]').click(); // wrong
  await expect(page.locator('[data-q="1"] .wrong')).toBeVisible();
  await page.locator('[data-q="2"] [data-option="1"]').click(); // A rainbow (right)
  await expect(page.locator('.quiz-result')).toContainText('You got 2 of 3');
  // Switch to the Bible text.
  await page.locator('.story-view [data-story-mode="everyone"]').click();
  await expect(page.locator('.story-intro')).toBeVisible();
  await page.goto('./#/stories');
  await page.locator('[data-story-mode="kids"]').click();
  await expect(page.locator('.star-total')).toContainText('2 of 120 stars');
});

test('collections: commandments, parables and praying a Bible prayer', async ({ page }) => {
  await page.goto('./#/stories');
  await page.locator('.story-tabs a', { hasText: 'Collections' }).click();
  await expect(page.locator('h1')).toHaveText('Collections');
  await expect(page.locator('.collection-card')).toHaveCount(5);
  await expectNoHorizontalScroll(page);
  await page.locator('.collection-card', { hasText: 'Ten Commandments' }).click();
  await expect(page.locator('.story-row')).toHaveCount(13);
  await page.locator('.story-row', { hasText: '6. Do Not Murder' }).click();
  await expect(page.locator('.story h1')).toHaveText('6. Do Not Murder');
  await page.locator('[data-story-t="kjv"]').click();
  await expect(page.locator('.story-text')).toContainText('Thou shalt not kill');
  await expect(page.locator('.related h2')).toHaveText('How Jesus and the apostles taught it');
  await expect(page.locator('.related-passage')).toContainText('Matthew 5:21-22');
  await page.locator('[data-finish]').click();
  await expect(page.locator('.story h1')).toHaveText('7. Be Faithful in Marriage');
  // Parables: filter and listen to just the passage.
  await page.goto('./#/stories/collections/parables');
  await page.locator('#collection-filter').fill('samaritan');
  await expect(page.locator('.story-list li:not([hidden])')).toHaveCount(1);
  await page.locator('.story-list li:not([hidden]) a').click();
  await page.locator('#item-listen').click();
  await expect(page.locator('#player')).toBeHidden({ timeout: 20_000 });
  expect(await page.evaluate(() => window.__spoken.length)).toBe(13); // Luke 10:25-37
  // Prayers: "Pray this" fills the prayer journal.
  await page.goto('./#/stories/collections/prayers/1');
  await expect(page.locator('.story h1')).toHaveText("The Lord's Prayer");
  await page.locator('#item-pray').click();
  await expect(page.locator('#p-title')).toHaveValue("The Lord's Prayer");
  await expect(page.locator('#p-verses')).toHaveValue('Matthew 6:9-13');
  await page.locator('#prayer-form button[type=submit]').click();
  await page.goto('./#/library/prayers');
  await expect(page.locator('main')).toContainText("The Lord's Prayer");
  await page.goto('./#/stories/collections');
  await expect(page.locator('.collection-card', { hasText: 'Ten Commandments' })).toContainText('1 read');
});
