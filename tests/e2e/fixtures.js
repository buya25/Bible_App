import { test as base, expect } from '@playwright/test';

/** Skip the welcome tour and replace speech synthesis with a recorder (headless browsers have no voices). */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        const k = 'bible-app:v1';
        const s = JSON.parse(localStorage.getItem(k) || '{}');
        if (!('onboarded' in s)) {
          s.onboarded = true;
          localStorage.setItem(k, JSON.stringify(s));
        }
      } catch {}
      const voices = [
        { name: 'Samantha', lang: 'en-US', voiceURI: 'Samantha' },
        { name: 'Daniel', lang: 'en-GB', voiceURI: 'Daniel' },
        { name: 'Microsoft Guy Online (Natural) - English (United States)', lang: 'en-US', voiceURI: 'guy' },
      ];
      window.__spoken = [];
      const synth = {
        current: null,
        getVoices: () => voices,
        addEventListener() {},
        speak(u) {
          window.__spoken.push({ text: u.text, voice: u.voice?.name, pitch: u.pitch, rate: u.rate });
          this.current = u;
          u.__t = setTimeout(() => {
            if (this.current === u) {
              this.current = null;
              u.onend?.({});
            }
          }, 40);
        },
        cancel() {
          if (!this.current) return;
          clearTimeout(this.current.__t);
          const u = this.current;
          this.current = null;
          u.onerror?.({ error: 'canceled' });
        },
        pause() {},
        resume() {},
      };
      Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
      window.SpeechSynthesisUtterance = function (text) {
        this.text = text;
      };
    });
    await use(page);
  },
});

export { expect };

/** Fail if the page scrolls sideways (broken layout on small screens). */
export async function expectNoHorizontalScroll(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
