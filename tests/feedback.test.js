import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFeedback, githubIssueUrl, mailtoUrl } from '../js/feedback.js';

test('feedback becomes a titled GitHub issue link', () => {
  const fb = buildFeedback({ kind: 'problem', message: 'Audio stops on my phone\nIt stops after two verses.', details: 'Page: #/read/john/3' });
  assert.equal(fb.title, 'Something is wrong: Audio stops on my phone');
  assert.match(fb.body, /It stops after two verses\.\n\n---\nPage: #\/read\/john\/3$/);
  const url = new URL(githubIssueUrl(fb, 'owner/repo'));
  assert.equal(url.origin + url.pathname, 'https://github.com/owner/repo/issues/new');
  assert.equal(url.searchParams.get('title'), fb.title);
  assert.equal(url.searchParams.get('labels'), 'feedback');
  assert.ok(mailtoUrl(fb, 'a@b.c').startsWith('mailto:a@b.c?subject=Something%20is%20wrong'));
  assert.equal(buildFeedback({ kind: 'idea', message: 'x'.repeat(5000), details: '' }).body.length, 3000);
});
