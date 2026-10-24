import { test, expect } from './fixtures.js';

test('audio Bible: deep male voice, follows along into the next book', async ({ page }) => {
  await page.goto('./#/read/jude/1');
  await page.locator('#speak-btn').click();
  await expect(page.locator('#player')).toBeVisible();
  const first = await page.evaluate(() => window.__spoken[0]);
  expect(first.text).toMatch(/^Jude, chapter 1\./);
  expect(first.voice).toContain('Guy');
  expect(first.pitch).toBe(1); // natural pitch by default (lowered pitch sounds robotic)
  await expect(page).toHaveURL(/#\/read\/revelation\/1/, { timeout: 20_000 });
  await page.locator('[data-p="stop"]').click();
  await expect(page.locator('#player')).toBeHidden();
});

test('welcome tour and simple mode', async ({ page }) => {
  // Runs after the fixture's "tour already seen" script: show the tour on the first load only.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('tour-reset')) return;
    sessionStorage.setItem('tour-reset', '1');
    const s = JSON.parse(localStorage.getItem('bible-app:v1') || '{}');
    s.onboarded = false;
    localStorage.setItem('bible-app:v1', JSON.stringify(s));
  });
  await page.goto('./');
  await expect(page.locator('.tour')).toBeVisible();
  for (let i = 0; i < 4; i++) await page.locator('[data-next]').click();
  await page.locator('[data-mode="simple"]').click();
  await page.locator('[data-next]').click();
  await expect(page.locator('.tabbar a[data-tab="study"]')).toBeHidden();
  await page.goto('./#/read/john/1');
  await expect(page.locator('#original-btn')).toBeHidden();
});

test('installable: manifest, PNG icons and service worker', async ({ page, request }) => {
  await page.goto('./');
  const manifest = await (await request.get('manifest.webmanifest')).json();
  const sizes = manifest.icons.filter((i) => i.type === 'image/png').map((i) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  expect((await request.get('icons/apple-touch-icon.png')).ok()).toBe(true);
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toMatch(/localhost:4173\/$/);
});
