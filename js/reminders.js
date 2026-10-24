// Daily reading reminders: a notification when the app is opened after the chosen time (if not read yet),
// background reminders where the browser supports them, and a recurring calendar event (.ics) for any device.
import { toDateString } from './plans.js';
import { toast } from './util.js';

/** RFC 5545 calendar file with a daily event at `time` ("HH:MM") and a 0-minute alarm. */
export function buildIcs({ time, url, title = 'Bible reading', now = new Date() }) {
  const [h, m] = time.split(':').map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  const start = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}T${pad(h)}${pad(m)}00`;
  const end = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}T${pad(h)}${pad(Math.min(m + 15, 59))}00`;
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const escape = (s) => s.replace(/[\\;,]/g, (c) => `\\${c}`);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bible App//Daily reading//EN',
    'BEGIN:VEVENT',
    `UID:daily-reading-${stamp}@bible-app`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    'RRULE:FREQ=DAILY',
    `SUMMARY:${escape(title)}`,
    `DESCRIPTION:${escape(`Time for today's reading: ${url}`)}`,
    `URL:${url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escape(title)}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .map(fold)
    .join('\r\n')
    .concat('\r\n');
}

/** Lines longer than 75 characters continue on the next line after a space (RFC 5545 folding). */
const fold = (line) => (line.length <= 75 ? line : line.match(/.{1,74}/g).join('\r\n '));

/** Should a reminder show now? Only after the chosen time, once a day, and not if already read today. */
export function reminderDue(settings, state, now = new Date()) {
  if (!settings.reminder) return false;
  const today = toDateString(now);
  const [h, m] = settings.reminderTime.split(':').map(Number);
  const afterTime = now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
  return afterTime && !state.readDates.includes(today) && state.reminderShown !== today;
}

export async function enableReminders(store) {
  if (!('Notification' in window)) {
    toast('Notifications are not supported here. Use “Add to calendar” instead.');
    return false;
  }
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') {
    toast('Notifications are blocked. You can still add a calendar reminder.');
    return false;
  }
  store.update((s) => (s.settings.reminder = true));
  // Background check (installed app, Chromium browsers). Elsewhere the reminder shows when the app is opened.
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg && 'periodicSync' in reg) await reg.periodicSync.register('daily-reminder', { minInterval: 12 * 60 * 60 * 1000 });
  } catch {
    // Not supported or not allowed; the in-app reminder still works.
  }
  return true;
}

/** Called when the app starts: show today's reminder if one is due. */
export async function checkReminder(store, { title, body }) {
  const st = store.get();
  if (!reminderDue(st.settings, st)) return;
  store.update((s) => (s.reminderShown = toDateString(new Date())));
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const reg = await navigator.serviceWorker?.ready;
      if (reg) await reg.showNotification(title, { body, icon: 'icons/icon.svg', tag: 'daily-reminder' });
      else new Notification(title, { body, icon: 'icons/icon.svg' });
      return;
    } catch {
      // fall back to a toast
    }
  }
  toast(body);
}

export function downloadIcs(time) {
  const url = `${location.origin}${location.pathname}#/today`;
  const blob = new Blob([buildIcs({ time, url })], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'bible-reading-reminder.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
