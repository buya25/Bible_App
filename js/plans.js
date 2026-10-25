// Reading plans and streak logic. Pure functions only.
import { BOOKS, allChapters } from './bible.js';

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

export const PLANS = [
  { id: 'bible-year', name: 'Whole Bible in a Year', description: 'Read every chapter of the Bible in 365 days.', days: 365, books: range(0, 65) },
  { id: 'nt-90', name: 'New Testament in 90 Days', description: 'All 27 New Testament books in three months.', days: 90, books: range(39, 65) },
  { id: 'gospels-30', name: 'The Gospels in 30 Days', description: 'Walk through the life of Jesus in Matthew, Mark, Luke and John.', days: 30, books: range(39, 42) },
  { id: 'psalms-proverbs', name: 'Psalms & Proverbs in 2 Months', description: 'Daily wisdom and prayer, about four chapters a day.', days: 60, books: [18, 19] },
  { id: 'ot-year', name: 'Old Testament in a Year', description: 'The full Old Testament at a steady pace.', days: 365, books: range(0, 38) },
  { id: 'stories', name: 'Bible Stories, One a Day', description: 'The whole Bible story from Creation to the new creation, one story a day, with questions to talk about.', stories: true },
];

/**
 * Split chapters into `days` daily readings, balancing by verse count so long
 * chapters (Psalm 119) don't make one day much heavier than the others.
 */
export function buildSchedule(bible, plan, stories = []) {
  if (plan.stories) return stories.map((story) => [{ story, book: story.book, chapter: story.chapter }]);
  const chapters = allChapters(bible, plan.books);
  const total = chapters.reduce((s, c) => s + c.weight, 0);
  const days = Array.from({ length: plan.days }, () => []);
  let cumulative = 0;
  let day = 0;
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const remainingChapters = chapters.length - i;
    const remainingDays = plan.days - day;
    // Move to the next day once this day's share is met, but never leave a day empty
    // while chapters remain, and never run out of days.
    if (day < plan.days - 1 && days[day].length && (cumulative + ch.weight / 2 > (total * (day + 1)) / plan.days || remainingChapters <= remainingDays - 1)) {
      day++;
    }
    days[day].push({ book: ch.book, chapter: ch.chapter });
    cumulative += ch.weight;
  }
  return days;
}

/** Summarise a day's readings, e.g. "Genesis 1-3" or "Ruth 4; 1 Samuel 1-2". */
export function describeDay(readings) {
  if (readings[0]?.story) return readings.map((r) => `${r.story.title} (${r.story.ref})`).join('; ');
  const groups = [];
  for (const r of readings) {
    const last = groups[groups.length - 1];
    if (last && last.book === r.book && last.to === r.chapter - 1) last.to = r.chapter;
    else groups.push({ book: r.book, from: r.chapter, to: r.chapter });
  }
  return groups.map((g) => `${BOOKS[g.book].name} ${g.from === g.to ? g.from : `${g.from}-${g.to}`}`).join('; ');
}

export function toDateString(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const dayNumber = (dateString) => {
  const [y, m, d] = dateString.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};

/** Zero-based plan day for `today`, clamped to the plan length. */
export function currentPlanDay(startDate, today, length) {
  return Math.max(0, Math.min(length - 1, dayNumber(toDateString(today)) - dayNumber(startDate)));
}

/** Consecutive days read, ending today (or yesterday, so the streak isn't lost before you read today). */
export function computeStreak(readDates, today = new Date()) {
  const set = new Set(readDates.map(dayNumber));
  let day = dayNumber(toDateString(today));
  if (!set.has(day)) day--;
  let streak = 0;
  while (set.has(day)) {
    streak++;
    day--;
  }
  return streak;
}
