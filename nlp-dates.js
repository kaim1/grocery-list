// nlp-dates.js — finds a date or time typed into a task title, like "מחר ב-5" or "next week".
// Pure, so it is tested with node (tests/nlp-dates.test.js).
import { DEFAULT_TIMES } from './reminders.js';

const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shift = (now, days) => keyOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
const atKey = (key, h, m) => { const [y, mo, d] = key.split('-').map(Number); return new Date(y, mo - 1, d, h, m); };
const hm = time => time.split(':').map(Number);

const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const HE_LETTERS = 'אבגדהוש';
const EN_DAYS = [['sunday', 'sun'], ['monday', 'mon'], ['tuesday', 'tues', 'tue'], ['wednesday', 'wed'],
  ['thursday', 'thurs', 'thur', 'thu'], ['friday', 'fri'], ['saturday', 'sat']];
const enDay = word => EN_DAYS.findIndex(names => names.includes(word.toLowerCase()));

// The same weekday as today means today.
const weekday = (now, day) => shift(now, (day - now.getDay() + 7) % 7);

function dateOf(now, d, m, y) {
  let year = y ? (y.length === 2 ? 2000 + Number(y) : Number(y)) : now.getFullYear();
  let date = new Date(year, m - 1, d);
  if (date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  if (!y && keyOf(date) < keyOf(now)) date = new Date(++year, m - 1, d);
  return keyOf(date);
}

function inMinutes(now, minutes) {
  const date = new Date(now.getTime() + minutes * 60000);
  date.setSeconds(0, 0);
  date.setMinutes(Math.ceil(date.getMinutes() / 5) * 5);
  return date;
}

const hour12 = (h, ampm) => (ampm.toLowerCase() === 'pm' ? h % 12 + 12 : h % 12);

// "בבוקר" after an hour makes it morning; evening, night and afternoon make it PM.
const DAYPART = '(?:\\s+(בבוקר|בערב|בלילה|אחה["״]צ|אחרי\\s+הצהריים|בצהריים))';
const dayPart = word => (!word ? null : word === 'בבוקר' ? 'am' : word === 'בלילה' ? 'night' : 'pm');
// At night, 12 is midnight, 1–5 are early morning and 6–11 are evening.
function hourOf(h, m, half) {
  if (!half || h > 12) return { h, m, sure: h === 0 || h > 12 };
  if (half === 'night') return { h: h === 12 ? 0 : h >= 6 ? h + 12 : h, m, sure: true };
  return { h: hour12(h, half), m, sure: true };
}

// Longest first, so "אחת עשרה" wins over "אחת".
const HE_HOURS = [['אחת[-־\\s]עשרה', 11], ['שתי?ים[-־\\s]עשרה', 12], ['אחת', 1], ['שתי?ים', 2], ['שלוש', 3],
  ['ארבע', 4], ['חמש', 5], ['שש', 6], ['שבע', 7], ['שמונה', 8], ['תשע', 9], ['עשר', 10]];
const HE_MONTHS = [['ינואר', 'ינו'], ['פברואר', 'פבר'], ['מרץ', 'מרס'], ['אפריל', 'אפר'], ['מאי'], ['יוני'],
  ['יולי'], ['אוגוסט', 'אוג'], ['ספטמבר', 'ספט'], ['אוקטובר', 'אוק'], ['נובמבר', 'נוב'], ['דצמבר', 'דצמ']];
const EN_MONTHS = [['january', 'jan'], ['february', 'feb'], ['march', 'mar'], ['april', 'apr'], ['may'],
  ['june', 'jun'], ['july', 'jul'], ['august', 'aug'], ['september', 'sept', 'sep'], ['october', 'oct'],
  ['november', 'nov'], ['december', 'dec']];
const monthOf = (list, word) => list.findIndex(names => names.includes(word.toLowerCase())) + 1;
const HE_MONTH = `(${HE_MONTHS.flat().join('|')})['׳]?`;
const EN_MONTH = `(${EN_MONTHS.flat().join('|')})`;

// Each rule gives a day (a date key), a time ({h, m, sure} or {preset}), an exact moment, or a day and a time.
const RULES = [
  [/היום|today/, () => ({ day: 0 })],
  [/מחרתיים/, () => ({ day: 2 })],
  [/מחר|tomorrow/, () => ({ day: 1 })],
  [new RegExp(`(?:ב)?יום\\s+(${HE_DAYS.join('|')})`), (m, now) => ({ key: weekday(now, HE_DAYS.indexOf(m[1])) })],
  [new RegExp(`ב(${HE_DAYS.join('|')})`), (m, now) => ({ key: weekday(now, HE_DAYS.indexOf(m[1])) })],
  [/(?:ב)?יום\s+([אבגדהוש])['׳]/, (m, now) => ({ key: weekday(now, HE_LETTERS.indexOf(m[1])) })],
  [new RegExp(`(?:on\\s+)?(${EN_DAYS.flat().join('|')})`), (m, now) => ({ key: weekday(now, enDay(m[1])) })],
  [/בשבוע\s+הבא|next\s+week/, (m, now) => ({ day: 7 - now.getDay() })],
  [/בעוד\s+(?:(\d+)\s+ימים|(יום)|(יומיים)|(שבוע)|(שבועיים))|in\s+(\d+)\s+days?|in\s+a\s+(week)/,
    m => ({ day: m[1] ? Number(m[1]) : m[2] ? 1 : m[3] ? 2 : m[4] || m[7] ? 7 : m[5] ? 14 : Number(m[6]) })],
  [new RegExp(`(?:ב[-־]?)?(\\d{1,2})\\s+ב?${HE_MONTH}(?:\\s+(\\d{4}))?`),
    (m, now) => { const key = dateOf(now, Number(m[1]), monthOf(HE_MONTHS, m[2]), m[3]); return key && { key }; }],
  [new RegExp(`(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${EN_MONTH}(?:,?\\s+(\\d{4}))?`),
    (m, now) => { const key = dateOf(now, Number(m[1]), monthOf(EN_MONTHS, m[2]), m[3]); return key && { key }; }],
  [new RegExp(`(?:on\\s+)?${EN_MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`),
    (m, now) => { const key = dateOf(now, Number(m[2]), monthOf(EN_MONTHS, m[1]), m[3]); return key && { key }; }],
  [/(?:ב[-־]?)?(\d{1,2})[./](\d{1,2})(?:[./](\d{4}|\d{2}))?(?![\d./:])/,
    (m, now) => { const key = dateOf(now, Number(m[1]), Number(m[2]), m[3]); return key && { key }; }],
  [new RegExp(`(?:ב[-־]?|בשעה\\s+|at\\s+)?(\\d{1,2}):(\\d{2})(?:\\s*(am|pm)|${DAYPART})?(?![\\d:])`), m => {
    const h = Number(m[1]), min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return { time: hourOf(h, min, m[3] || dayPart(m[4])) };
  }],
  [new RegExp(`(?:ב[-־]?|בשעה\\s+|at\\s+)(\\d{1,2})(?:\\s*(am|pm)|${DAYPART})?(?![\\d:./])`), m => {
    const h = Number(m[1]);
    if (h > 23) return null;
    return { time: hourOf(h, 0, m[2] || dayPart(m[3])) };
  }],
  // Hours in words: "בחמש", "בשמונה וחצי", "בשבע בערב". "בשש ביצים" is a quantity, not a time.
  [new RegExp(`(?:בשעה\\s+|ב)(${HE_HOURS.map(([w]) => w).join('|')})(?!\\s+(?!פחות)\\p{L}+(?:ים|ות)(?!\\p{L}))` +
    `(?:\\s+(וחצי|ורבע|פחות\\s+רבע))?${DAYPART}?`), m => {
    const h = HE_HOURS.find(([w]) => new RegExp(`^(?:${w})$`, 'u').test(m[1]))[1];
    const min = !m[2] ? 0 : m[2] === 'וחצי' ? 30 : m[2] === 'ורבע' ? 15 : -15;
    return { time: hourOf(min < 0 ? h - 1 || 12 : h, min < 0 ? 45 : min, dayPart(m[3])) };
  }],
  [/בחצות|at\s+midnight|midnight/, () => ({ time: { h: 24, m: 0, sure: true } })],
  [/(\d{1,2})\s*(am|pm)/, m => (Number(m[1]) > 12 ? null : { time: { h: hour12(Number(m[1]), m[2]), m: 0, sure: true } })],
  [/בבוקר|in\s+the\s+morning/, () => ({ time: { preset: 'morning' } })],
  [/בערב|in\s+the\s+evening/, () => ({ time: { preset: 'evening' } })],
  [/בצהריים|בצהרים|at\s+noon/, () => ({ time: { h: 12, m: 0, sure: true } })],
  [/הערב|tonight/, () => ({ day: 0, time: { preset: 'evening' } })],
  [/בעוד\s+(?:(\d+)\s+(שעות|דקות)|(שעה)|(שעתיים)|(חצי\s+שעה)|(רבע\s+שעה))|in\s+(?:(\d+)\s+(hours?|minutes?|mins?)|(an)\s+hour)/,
    (m, now) => {
      const minutes = m[1] ? Number(m[1]) * (m[2] === 'שעות' ? 60 : 1) : m[3] ? 60 : m[4] ? 120 : m[5] ? 30 : m[6] ? 15
        : m[7] ? Number(m[7]) * (m[8].startsWith('h') ? 60 : 1) : 60;
      return { at: inMinutes(now, minutes) };
    }],
];

const WORD = '[\\p{L}\\p{N}]';

function findAll(text, now) {
  const found = [];
  for (const [rule, read] of RULES) {
    // Whole words only; "monday.com" is not a day.
    const re = new RegExp(`(?<!${WORD}|${WORD}\\.)(?:${rule.source})(?!${WORD}|\\.${WORD})`, 'giu');
    for (const m of text.matchAll(re)) {
      const value = read(m, now);
      if (!value) continue;
      if ('day' in value) { value.key = shift(now, value.day); delete value.day; }
      found.push({ start: m.index, end: m.index + m[0].length, ...value });
    }
  }
  // A match inside a longer one is part of it, like "ב-17" inside "ב-17:30".
  return found.filter(a => !found.some(b => b !== a && b.start <= a.start && b.end >= a.end &&
    b.end - b.start > a.end - a.start));
}

function timeOn(key, time, times) {
  if (time.preset) return atKey(key, ...hm(times[time.preset]));
  return atKey(key, time.h, time.m);
}

// A bare hour after an explicit day: 1–7 is afternoon, 8–11 morning.
const withDay = time => (time.sure || time.preset || time.h >= 8 ? time : { ...time, h: time.h + 12 });

// A time with no day is the next time it comes round: a bare hour tries morning, then evening.
function nextTime(now, time, times) {
  const today = keyOf(now);
  const options = time.preset || time.sure ? [time] : [time, { ...time, h: time.h + 12 }];
  for (const option of options) {
    const date = timeOn(today, option, times);
    if (date > now) return date;
  }
  return timeOn(shift(now, 1), options[0], times);
}

// Returns null, or {start, end, when, remindAt} for the most complete match, the last one if several.
export function parseWhen(text, now = new Date(), times = DEFAULT_TIMES) {
  const found = findAll(text, now).sort((a, b) => a.start - b.start);
  const candidates = found.map(f => ({ ...f, parts: [f] }));
  for (const a of found) for (const b of found) {
    if (a.end > b.start || /\S/.test(text.slice(a.end, b.start))) continue;
    const day = [a, b].find(f => f.key && !f.time && !f.at);
    const time = [a, b].find(f => f.time && !f.key);
    if (day && time && day !== time) candidates.push({ start: a.start, end: b.end, key: day.key, time: time.time, parts: [a, b] });
  }
  if (!candidates.length) return null;
  const complete = c => (c.at || (c.key && c.time) ? 2 : 1);
  const best = candidates.reduce((x, y) => (complete(y) > complete(x) || (complete(y) === complete(x) && y.end >= x.end) ? y : x));
  const { start, end } = best;
  if (best.at) return { start, end, when: null, remindAt: best.at };
  if (best.key && best.time) return { start, end, when: best.key, remindAt: timeOn(best.key, withDay(best.time), times) };
  if (best.key) return { start, end, when: best.key, remindAt: null };
  return { start, end, when: null, remindAt: nextTime(now, best.time, times) };
}

// The title without the matched phrase, and without a "ב" or "at" left hanging.
export function stripWhen(text, match) {
  return `${text.slice(0, match.start)} ${text.slice(match.end)}`
    .replace(/\s+/g, ' ').trim().replace(/(?:^|\s)(?:ב|at|on)$/u, '').trim();
}
