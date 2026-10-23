import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presets, at, hhmm, readTimes, writeTimes, DEFAULT_TIMES } from '../reminders.js';

const times = { morning: '09:00', evening: '18:00' };
const show = list => Object.fromEntries(list.map(p => [p.id, `${p.date.getDate()}.${p.date.getMonth() + 1} ${hhmm(p.date)}`]));

test('quick reminder choices on a Friday morning', () => {
  // 23.10.2026 is a Friday.
  assert.deepEqual(show(presets(new Date(2026, 9, 23, 9, 41), times)), {
    hour: '23.10 10:45', evening: '23.10 18:00', morning: '24.10 09:00', week: '25.10 09:00',
  });
});

test('after the evening time "this evening" moves to tomorrow, and on Sunday next week is a week away', () => {
  assert.deepEqual(show(presets(new Date(2026, 9, 25, 20, 0), times)), {
    hour: '25.10 21:00', evening: '26.10 18:00', morning: '26.10 09:00', week: '1.11 09:00',
  });
  assert.equal(hhmm(presets(new Date(2026, 9, 25, 23, 58), times)[0].date), '01:00');
});

test('reminder times are stored per device with defaults', () => {
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.deepEqual(readTimes(storage), DEFAULT_TIMES);
  writeTimes({ morning: '07:30', evening: '20:00' }, storage);
  assert.deepEqual(readTimes(storage), { morning: '07:30', evening: '20:00' });
  assert.equal(hhmm(at('2026-10-24', '07:30')), '07:30');
});
