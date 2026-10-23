import test from 'node:test';
import assert from 'node:assert/strict';
import { dueReminders } from '../supabase/functions/send-reminders/due.js';

const now = new Date('2026-10-23T09:00:30Z');
const doc = todos => [{ user_id: 'u1', document: { projects: [{ id: 'p1', name: 'בית' }], todos } }];

test('sends a reminder that is due, with only the task title', () => {
  const due = dueReminders(doc([
    { id: 't1', title: 'לקנות נורות', remindAt: '2026-10-23T09:00:00.000Z', projectId: 'p1' },
    { id: 't2', title: 'להתקשר', remindAt: '2026-10-23T08:59:00.000Z' },
  ]), now);
  assert.deepEqual(due.map(d => d.payload), [
    { id: 't1', title: 'לקנות נורות' },
    { id: 't2', title: 'להתקשר' },
  ]);
  assert.equal(due[0].user_id, 'u1');
  assert.equal(due[0].remind_at, '2026-10-23T09:00:00.000Z');
});

test('skips future, done, stale, missing and invalid reminders', () => {
  const due = dueReminders(doc([
    { id: 'future', title: 'a', remindAt: '2026-10-23T09:01:00.000Z' },
    { id: 'done', title: 'b', remindAt: '2026-10-23T08:00:00.000Z', done: true },
    { id: 'stale', title: 'c', remindAt: '2026-10-23T02:59:00.000Z' },
    { id: 'none', title: 'd', remindAt: null },
    { id: 'bad', title: 'e', remindAt: 'tomorrow' },
  ]), now);
  assert.deepEqual(due, []);
});

test('tolerates documents without todos or projects', () => {
  assert.deepEqual(dueReminders([{ user_id: 'u', document: { version: 1 } }, { user_id: 'v', document: null }], now), []);
});
