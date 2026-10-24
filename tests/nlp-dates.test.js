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

test('hours in Hebrew words', () => {
  check('בחמש', null, local(2026, 10, 24, 17, 0));
  check('בשעה שבע', null, local(2026, 10, 24, 19, 0));
  check('מחר בחמש', '2026-10-25', local(2026, 10, 25, 17, 0));
  check('מחר בעשר', '2026-10-25', local(2026, 10, 25, 10, 0));
  check('בשמונה וחצי', null, local(2026, 10, 24, 20, 30));
  check('מחר בשלוש ורבע', '2026-10-25', local(2026, 10, 25, 15, 15));
  check('מחר בשש פחות רבע', '2026-10-25', local(2026, 10, 25, 17, 45));
  check('באחת עשרה', null, local(2026, 10, 24, 23, 0));
  check('מחר באחת-עשרה', '2026-10-25', local(2026, 10, 25, 11, 0));
  check('מחר בשתים עשרה', '2026-10-25', local(2026, 10, 25, 12, 0));
  check('בשבע בערב', null, local(2026, 10, 24, 19, 0));
  check('בחמש בבוקר', null, local(2026, 10, 25, 5, 0));
  check('מחר בשמונה בערב', '2026-10-25', local(2026, 10, 25, 20, 0));
  check('בעשר בלילה', null, local(2026, 10, 24, 22, 0));
  check('בשתים עשרה בלילה', null, local(2026, 10, 25, 0, 0));
  check('ב-5 בערב', null, local(2026, 10, 24, 17, 0));
  check('בחצות', null, local(2026, 10, 25, 0, 0));
});

test('month names', () => {
  check('3 בנובמבר', '2026-11-03', null);
  check('ב-3 בנובמבר', '2026-11-03', null);
  check('3 נובמבר', '2026-11-03', null);
  check('3 נוב׳', '2026-11-03', null);
  check('1 בינואר', '2027-01-01', null);
  check('3 בנובמבר ב-20:00', '2026-11-03', local(2026, 11, 3, 20, 0));
  check('3 בנובמבר בערב', '2026-11-03', local(2026, 11, 3, 18, 0));
  check('Nov 3', '2026-11-03', null);
  check('3 November', '2026-11-03', null);
  check('November 3rd', '2026-11-03', null);
  check('31 בפברואר ב-5', null, local(2026, 10, 24, 17, 0));
});

test('day numbers in words before a month', () => {
  check('בשלושה בנובמבר', '2026-11-03', null);
  check('באחד בדצמבר', '2026-12-01', null);
  check('בעשרים ושניים במרץ', '2027-03-22', null);
  check('בשלושים בינואר', '2027-01-30', null);
  check('בשלושה עשר בנובמבר', '2026-11-13', null);
  check('בשלוש בנובמבר', '2026-11-03', null);
  check('ה-3 בנובמבר', '2026-11-03', null);
  check('בשלושה בנובמבר בערב', '2026-11-03', local(2026, 11, 3, 18, 0));
});

test('minutes in words', () => {
  check('בחמש ועשרים', null, local(2026, 10, 24, 17, 20));
  check('מחר בשמונה ועשר', '2026-10-25', local(2026, 10, 25, 8, 10));
  check('מחר בשבע וחמישה', '2026-10-25', local(2026, 10, 25, 19, 5));
  check('בתשע ועשרים וחמש', null, local(2026, 10, 24, 21, 25));
  check('מחר בשש וארבעים', '2026-10-25', local(2026, 10, 25, 18, 40));
  check('מחר בשלוש וחמישים וחמש', '2026-10-25', local(2026, 10, 25, 15, 55));
  check('בעשרה לשמונה', null, local(2026, 10, 24, 19, 50));
  check('מחר ברבע לשש', '2026-10-25', local(2026, 10, 25, 17, 45));
});

test('number words that are quantities stay in the title', () => {
  for (const text of ['לקנות שש ביצים', 'לקנות בשש ביצים', 'עשר דקות הליכה', 'בעשר דקות', 'באחת החנויות', 'חמש בנות',
    'לקנות שלושה בקבוקים', 'חמש ועשרים אנשים', 'בחמש ועשרים אנשים', 'בשלושה בקבוקים']) {
    assert.equal(parseWhen(text, now), null, text);
  }
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
