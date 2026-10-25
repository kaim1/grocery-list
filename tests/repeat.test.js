import test from 'node:test';
import assert from 'node:assert/strict';
import { nextDate, firstDate, shiftReminder, describe, shortLabel, presets, sameRule } from '../repeat.js';

const fixed = (unit, every = 1, extra = {}) => ({ mode: 'fixed', every, unit, ...extra });

test('daily, and a missed task jumps past today instead of piling up', () => {
  assert.equal(nextDate(fixed('day'), '2026-10-25', '2026-10-25'), '2026-10-26');
  assert.equal(nextDate(fixed('day'), '2026-10-20', '2026-10-25'), '2026-10-26');
  assert.equal(nextDate(fixed('day', 3), '2026-10-20', '2026-10-25'), '2026-10-26');
  // Done early: the next one still follows the schedule.
  assert.equal(nextDate(fixed('day', 2), '2026-10-27', '2026-10-25'), '2026-10-29');
});

test('weekly on one day and on several days', () => {
  // 25.10.2026 is a Sunday.
  assert.equal(nextDate(fixed('week', 1, { days: [0] }), '2026-10-25', '2026-10-25'), '2026-11-01');
  assert.equal(nextDate(fixed('week', 1, { days: [1, 4] }), '2026-10-26', '2026-10-26'), '2026-10-29');
  assert.equal(nextDate(fixed('week', 1, { days: [1, 4] }), '2026-10-29', '2026-10-29'), '2026-11-02');
});

test('every two weeks on Monday and Thursday', () => {
  const rule = fixed('week', 2, { days: [1, 4] });
  assert.equal(nextDate(rule, '2026-10-26', '2026-10-26'), '2026-10-29');
  assert.equal(nextDate(rule, '2026-10-29', '2026-10-29'), '2026-11-09');
});

test('work days skip Friday and Saturday', () => {
  const rule = fixed('week', 1, { days: [0, 1, 2, 3, 4] });
  assert.equal(nextDate(rule, '2026-10-29', '2026-10-29'), '2026-11-01');
});

test('monthly on the 31st falls back to the last day, then returns to the 31st', () => {
  const rule = fixed('month', 1, { monthDay: 31 });
  assert.equal(nextDate(rule, '2026-10-31', '2026-10-31'), '2026-11-30');
  assert.equal(nextDate(rule, '2026-11-30', '2026-11-30'), '2026-12-31');
  assert.equal(nextDate(rule, '2027-01-31', '2027-01-31'), '2027-02-28');
});

test('yearly on 29 February', () => {
  const rule = fixed('year', 1, { monthDay: 29, month: 1 });
  assert.equal(nextDate(rule, '2028-02-29', '2028-02-29'), '2029-02-28');
  assert.equal(nextDate(rule, '2031-02-28', '2031-02-28'), '2032-02-29');
});

test('after mode counts from the day it was done', () => {
  assert.equal(nextDate({ mode: 'after', every: 3, unit: 'day' }, '2026-10-01', '2026-10-25'), '2026-10-28');
  assert.equal(nextDate({ mode: 'after', every: 1, unit: 'week' }, '2026-10-01', '2026-10-25'), '2026-11-01');
  assert.equal(nextDate({ mode: 'after', every: 1, unit: 'month' }, '2026-10-01', '2026-10-31'), '2026-11-30');
});

test('dates stay right across the daylight saving change', () => {
  // Israel moves its clocks back on 25.10.2026 and forward on 27.3.2026.
  assert.equal(nextDate(fixed('day'), '2026-10-24', '2026-10-24'), '2026-10-25');
  assert.equal(nextDate(fixed('day'), '2026-03-26', '2026-03-26'), '2026-03-27');
  assert.equal(nextDate(fixed('week', 1, { days: [5] }), '2026-03-20', '2026-03-20'), '2026-03-27');
});

test('first date of a new rule', () => {
  assert.equal(firstDate(fixed('week', 1, { days: [0] }), '2026-10-25'), '2026-10-25');
  assert.equal(firstDate(fixed('week', 1, { days: [1, 4] }), '2026-10-27'), '2026-10-29');
  assert.equal(firstDate(fixed('month', 1, { monthDay: 1 }), '2026-10-25'), '2026-11-01');
  assert.equal(firstDate(fixed('day'), '2026-10-25'), '2026-10-25');
});

test('a reminder keeps its time of day on the new date', () => {
  const at = new Date(2026, 9, 24, 8, 0).toISOString();
  assert.equal(new Date(shiftReminder(at, '2026-10-24', '2026-10-26')).getTime(), new Date(2026, 9, 26, 8, 0).getTime());
  assert.equal(shiftReminder(null, '2026-10-24', '2026-10-26'), null);
});

test('describes rules in Hebrew', () => {
  assert.equal(describe(null), 'ללא חזרה');
  assert.equal(describe(fixed('day'), '2026-10-25'), 'כל יום');
  assert.equal(describe(fixed('day', 3), '2026-10-25'), 'כל 3 ימים');
  assert.equal(describe(fixed('week', 1, { days: [0, 1, 2, 3, 4] }), '2026-10-25'), 'כל יום חול');
  assert.equal(describe(fixed('week', 1, { days: [0] }), '2026-10-25'), 'כל שבוע ביום א׳');
  assert.equal(describe(fixed('week', 2, { days: [1, 4] }), '2026-10-25'), 'כל שבועיים, בימים ב׳ וה׳');
  assert.equal(describe(fixed('month', 1, { monthDay: 25 }), '2026-10-25'), 'כל חודש ב-25');
  assert.equal(describe(fixed('year', 1, { monthDay: 25, month: 9 }), '2026-10-25'), 'כל שנה ב-25.10');
  assert.equal(describe({ mode: 'after', every: 3, unit: 'day' }, '2026-10-25'), '3 ימים אחרי שסיימתי');
  assert.equal(shortLabel(fixed('week', 1, { days: [0] })), 'שבועי');
  assert.equal(shortLabel(null), 'חוזר');
});

test('presets follow the task date', () => {
  const list = presets('2026-10-25');
  assert.deepEqual(list.find(p => p.id === 'week').rule.days, [0]);
  assert.equal(list.find(p => p.id === 'month').rule.monthDay, 25);
  assert.ok(sameRule(list[0].rule, fixed('day')));
  assert.ok(!sameRule(list[0].rule, null));
});

test('checking a repeating task adds the next one, and reopening removes it', async () => {
  const store = await import('../store.js');
  const state = { todos: [], projects: [] };
  const remindAt = new Date(2026, 9, 25, 8, 0).toISOString();
  const todo = store.addTodo(state, 'ויטמינים', { when: '2026-10-25', remindAt, projectId: 'p1', repeat: fixed('day') });
  const next = store.setTodoDone(state, todo.id, true, '2026-10-25');
  assert.equal(next.when, '2026-10-26');
  assert.equal(new Date(next.remindAt).getTime(), new Date(2026, 9, 26, 8, 0).getTime());
  assert.equal(next.projectId, 'p1');
  assert.deepEqual(next.repeat, fixed('day'));
  assert.equal(state.todos.filter(t => !t.done).length, 1);
  store.setTodoDone(state, todo.id, false, '2026-10-25');
  assert.equal(state.todos.length, 1);
  assert.equal(state.todos[0].done, false);
});

test('an overdue repeating task is followed by one after today', async () => {
  const store = await import('../store.js');
  const state = { todos: [], projects: [] };
  const todo = store.addTodo(state, 'השקיה', { when: '2026-10-20', repeat: fixed('day', 2) });
  assert.equal(store.setTodoDone(state, todo.id, true, '2026-10-25').when, '2026-10-26');
});

test('skipping moves the task without checking it', async () => {
  const store = await import('../store.js');
  const state = { todos: [], projects: [] };
  const todo = store.addTodo(state, 'אימון', { when: '2026-10-25', remindAt: new Date(2026, 9, 25, 18, 0).toISOString(),
    repeat: fixed('week', 1, { days: [0] }) });
  store.skipTodo(state, todo.id, '2026-10-25');
  assert.equal(todo.when, '2026-11-01');
  assert.equal(todo.done, false);
  assert.equal(new Date(todo.remindAt).getTime(), new Date(2026, 10, 1, 18, 0).getTime());
});
