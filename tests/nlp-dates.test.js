import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWhen, stripWhen } from '../nlp-dates.js';

// Saturday 24.10.2026, 16:50 local time.
const now = new Date(2026, 9, 24, 16, 50);
const local = (y, m, d, h, min) => new Date(y, m - 1, d, h, min).getTime();

function check(text, when, remindAt) {
  const found = parseWhen(text, now);
  assert.ok(found, `no match in "${text}"`);
  assert.equal(found.when, when, `when for "${text}"`);
  assert.equal(found.remindAt?.getTime() ?? null, remindAt, `remindAt for "${text}"`);
}

test('Hebrew days', () => {
  check('היום', '2026-10-24', null);
  check('מחר', '2026-10-25', null);
  check('מחרתיים', '2026-10-26', null);
  check('ביום ראשון', '2026-10-25', null);
  check('ביום ג׳', '2026-10-27', null);
  check("יום ד'", '2026-10-28', null);
  check('בשלישי', '2026-10-27', null);
  check('ביום שבת', '2026-10-24', null);
  check('בשבוע הבא', '2026-10-25', null);
  check('בעוד 3 ימים', '2026-10-27', null);
  check('בעוד שבוע', '2026-10-31', null);
});

test('Hebrew relative times round up to five minutes', () => {
  check('בעוד שעה', null, local(2026, 10, 24, 17, 50));
  check('בעוד שעתיים', null, local(2026, 10, 24, 18, 50));
  check('בעוד 3 שעות', null, local(2026, 10, 24, 19, 50));
  check('בעוד 12 דקות', null, local(2026, 10, 24, 17, 5));
});

test('dates, moving to next year once passed', () => {
  check('3.11', '2026-11-03', null);
  check('3/11', '2026-11-03', null);
  check('3.11.26', '2026-11-03', null);
  check('ב-1.1', '2027-01-01', null);
});

test('times alone take the next time they come round', () => {
  check('ב-17:30', null, local(2026, 10, 24, 17, 30));
  check('ב17:30', null, local(2026, 10, 24, 17, 30));
  check('ב-5', null, local(2026, 10, 24, 17, 0));
  check('ב-9', null, local(2026, 10, 24, 21, 0));
  check('בבוקר', null, local(2026, 10, 25, 9, 0));
  check('בערב', null, local(2026, 10, 24, 18, 0));
  check('בצהריים', null, local(2026, 10, 25, 12, 0));
  check('הערב', '2026-10-24', local(2026, 10, 24, 18, 0));
});

test('a day with a time', () => {
  check('מחר ב-5', '2026-10-25', local(2026, 10, 25, 17, 0));
  check('מחר ב-9', '2026-10-25', local(2026, 10, 25, 9, 0));
  check('ביום שלישי בערב', '2026-10-27', local(2026, 10, 27, 18, 0));
  check('3.11 ב-20:00', '2026-11-03', local(2026, 11, 3, 20, 0));
  check('ב-20:00 מחר', '2026-10-25', local(2026, 10, 25, 20, 0));
});

test('English', () => {
  check('today', '2026-10-24', null);
  check('tomorrow', '2026-10-25', null);
  check('on monday', '2026-10-26', null);
  check('Fri', '2026-10-30', null);
  check('next week', '2026-10-25', null);
  check('in 2 hours', null, local(2026, 10, 24, 18, 50));
  check('at 5pm', null, local(2026, 10, 24, 17, 0));
  check('17:30', null, local(2026, 10, 24, 17, 30));
  check('tonight', '2026-10-24', local(2026, 10, 24, 18, 0));
  check('tomorrow at 9am', '2026-10-25', local(2026, 10, 25, 9, 0));
});

test('morning and evening follow the saved times', () => {
  const found = parseWhen('מחר בבוקר', now, { morning: '07:30', evening: '20:00' });
  assert.equal(found.remindAt.getTime(), local(2026, 10, 25, 7, 30));
});

test('finds the phrase inside a title and strips it', () => {
  const text = 'להתקשר לדני מחר ב-5';
  const found = parseWhen(text, now);
  assert.equal(text.slice(found.start, found.end), 'מחר ב-5');
  assert.equal(stripWhen(text, found), 'להתקשר לדני');
  const meeting = 'ישיבה ביום שלישי בערב עם רון';
  assert.equal(stripWhen(meeting, parseWhen(meeting, now)), 'ישיבה עם רון');
});

test('ignores numbers and words that are not dates', () => {
  for (const text of ['לקנות 2 חלב', 'חדר 5', 'מחרוזת', 'לסדר את המחר', 'יום הולדת לנועה', 'monday.com']) {
    assert.equal(parseWhen(text, now), null, text);
  }
});
