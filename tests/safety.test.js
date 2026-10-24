import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupDue, userDataCount, installSuggested } from '../js/safety.js';
import { moreActionsFor, MORE_ACTIONS } from '../js/onboarding.js';

const now = new Date('2026-06-01T12:00:00Z');
const withData = (n) => ({ notes: Object.fromEntries(Array.from({ length: n }, (_, i) => [`0.1.${i + 1}`, {}])), highlights: {}, bookmarks: {}, memory: {}, prayers: [] });

test('backup reminder appears once there is data worth keeping', () => {
  assert.equal(userDataCount(withData(3)), 3);
  assert.equal(backupDue(withData(3), now), false);
  assert.equal(backupDue(withData(5), now), true);
  assert.equal(backupDue({ ...withData(5), lastBackup: '2026-05-20T00:00:00Z' }, now), false);
  assert.equal(backupDue({ ...withData(5), lastBackup: '2026-04-01T00:00:00Z' }, now), true);
  assert.equal(backupDue({ ...withData(5), dismissed: { backup: '2026-05-25T00:00:00Z' } }, now), false);
});

test('install suggestion waits for a second visit and respects "not now"', () => {
  const info = { standalone: false, ios: true, canPrompt: false };
  assert.equal(installSuggested({ visitDays: 1 }, info, now), false);
  assert.equal(installSuggested({ visitDays: 2 }, info, now), true);
  assert.equal(installSuggested({ visitDays: 5 }, { ...info, standalone: true }, now), false);
  assert.equal(installSuggested({ visitDays: 5, dismissed: { install: '2026-05-20T00:00:00Z' } }, info, now), false);
  assert.equal(installSuggested({ visitDays: 5 }, { standalone: false, ios: false, canPrompt: false }, now), false);
});

test('simple mode hides advanced actions from the More sheet', () => {
  assert.equal(moreActionsFor('full').length, MORE_ACTIONS.length);
  const simple = moreActionsFor('simple').map((a) => a.action);
  assert.ok(!simple.includes('commentary') && !simple.includes('xrefs'));
  assert.ok(simple.includes('memorize') && simple.includes('pray') && simple.includes('copy'));
});
