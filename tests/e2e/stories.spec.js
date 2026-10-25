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
