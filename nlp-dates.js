// nlp-dates.js — finds a date or time typed into a task title, like "מחר ב-5" or "next week".
// Pure, so it is tested with node (tests/nlp-dates.test.js).
import { DEFAULT_TIMES } from './reminders.js';
import { firstDate, nextDate } from './repeat.js';

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

// Minutes after an hour in words ("ועשרים", "ועשרים וחמש") and before one ("עשרה לשש").
const HE_MINUTES = [['עשרים\\s+וחמש(?:ה)?', 25], ['ארבעים\\s+וחמש(?:ה)?', 45], ['חמישים\\s+וחמש(?:ה)?', 55],
  ['עשרים', 20], ['שלושים', 30], ['ארבעים', 40], ['חמישים', 50], ['עשרה', 10], ['עשר', 10],
  ['חמישה', 5], ['חמש', 5], ['חצי', 30], ['רבע', 15]];
const HE_BEFORE = [['עשרים\\s+וחמש(?:ה)?', 25], ['עשרים', 20], ['עשרה', 10], ['עשר', 10], ['חמישה', 5], ['חמש', 5], ['רבע', 15]];
const wordValue = (list, text) => list.find(([w]) => new RegExp(`^(?:${w})$`, 'u').test(text))[1];
const alternatives = list => list.map(([w]) => w).join('|');

// Day numbers in words, masculine and feminine: "שלושה", "עשרים ושניים", "שלושים ואחת".
const UNITS = [null, ['אחד', 'אחת', 'ראשון'], ['שניים', 'שנים', 'שני', 'שתיים', 'שתים'], ['שלושה', 'שלוש'],
  ['ארבעה', 'ארבע'], ['חמישה', 'חמש'], ['שישה', 'שש'], ['שבעה', 'שבע'], ['שמונה'], ['תשעה', 'תשע']];
const HE_DAY_NUMBERS = (() => {
  const words = [];
  const add = (n, forms) => forms.forEach(f => words.push([f.replace(/ /g, '[-־\\s]'), n]));
  add(31, ['שלושים ואחד', 'שלושים ואחת']);
  for (let u = 9; u >= 1; u--) add(20 + u, UNITS[u].filter(f => f !== 'ראשון').map(f => `עשרים ו${f}`));
  for (let u = 9; u >= 1; u--) add(10 + u, UNITS[u].filter(f => f !== 'ראשון' && f !== 'שני').flatMap(f => [`${f} עשר`, `${f} עשרה`]));
  add(30, ['שלושים']);
  add(20, ['עשרים']);
  add(10, ['עשרה', 'עשר']);
  for (let u = 9; u >= 1; u--) add(u, UNITS[u]);
  return words;
})();

// A number followed by a plural noun is a quantity: "שלושה בקבוקים", "חמש ועשרים אנשים".
const NOT_QUANTITY = '(?!\\s+(?!פחות)\\p{L}+(?:ים|ות)(?!\\p{L}))';
// Right after an hour, "ועשרים" or "וארבעים" are minutes, not a noun.
const HOUR_NOT_QUANTITY = '(?!\\s+(?!פחות|ו)\\p{L}+(?:ים|ות)(?!\\p{L}))';
const EN_MONTH = `(${EN_MONTHS.flat().join('|')})`;

// Each rule gives a day (a date key), a time ({h, m, sure} or {preset}), an exact moment, or a day and a time.
const RULES = [
  // Repeats: "כל יום", "כל יום שני וחמישי", "כל שבועיים", "כל חודש ב-1", "every monday".
  [/כל\s+יום\s+חול|every\s+weekday/, () => ({ repeat: { mode: 'fixed', every: 1, unit: 'week', days: [0, 1, 2, 3, 4] } })],
  [new RegExp(`כל\\s+(?:יום\\s+)?(?:${HE_DAYS.join('|')})(?:(?:\\s*,\\s*|\\s+ו)(?:יום\\s+)?(?:${HE_DAYS.join('|')}))*`), m => ({
    repeat: { mode: 'fixed', every: 1, unit: 'week',
      days: [...new Set([...m[0].matchAll(new RegExp(HE_DAYS.join('|'), 'g'))].map(d => HE_DAYS.indexOf(d[0])))] },
  })],
  [new RegExp(`every\\s+(?:${EN_DAYS.flat().join('|')})(?:(?:\\s*,\\s*|\\s+and\\s+)(?:${EN_DAYS.flat().join('|')}))*`, 'i'), m => ({
    repeat: { mode: 'fixed', every: 1, unit: 'week',
      days: [...new Set([...m[0].replace(/^every\s+/i, '').matchAll(/[a-z]+/gi)].map(d => enDay(d[0])).filter(d => d >= 0))] },
  })],
  [/כל\s+יום|every\s+day|daily/, () => ({ repeat: { mode: 'fixed', every: 1, unit: 'day' } })],
  [/כל\s+יומיים/, () => ({ repeat: { mode: 'fixed', every: 2, unit: 'day' } })],
  [/כל\s+שבוע|every\s+week|weekly/, () => ({ repeat: { mode: 'fixed', every: 1, unit: 'week' } })],
  [/כל\s+שבועיים|every\s+other\s+week/, () => ({ repeat: { mode: 'fixed', every: 2, unit: 'week' } })],
  [/כל\s+חודשיים/, () => ({ repeat: { mode: 'fixed', every: 2, unit: 'month' } })],
  [/כל\s+(\d+)\s+(ימים|שבועות|חודשים|שנים)|every\s+(\d+)\s+(days?|weeks?|months?|years?)/, m => {
    const every = Number(m[1] || m[3]);
    const word = m[2] || m[4];
    const unit = /^(ימים|day)/.test(word) ? 'day' : /^(שבועות|week)/.test(word) ? 'week' : /^(חודשים|month)/.test(word) ? 'month' : 'year';
    return every > 0 && every < 1000 ? { repeat: { mode: 'fixed', every, unit } } : null;
  }],
  [/כל\s+חודש(?:\s+ב[-־]?(\d{1,2})(?![\d:.]))?|every\s+month(?:\s+on\s+the\s+(\d{1,2})(?:st|nd|rd|th)?)?|monthly/, m => {
    const day = Number(m[1] || m[2]) || null;
    return day > 31 ? null : { repeat: { mode: 'fixed', every: 1, unit: 'month', ...(day && { monthDay: day }) } };
  }],
  [/כל\s+שנה|every\s+year|yearly|annually/, () => ({ repeat: { mode: 'fixed', every: 1, unit: 'year' } })],
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
  [new RegExp(`(?:ב|ה)?(${alternatives(HE_DAY_NUMBERS)})\\s+[בל]${HE_MONTH}(?:\\s+(\\d{4}))?`),
    (m, now) => { const key = dateOf(now, wordValue(HE_DAY_NUMBERS, m[1]), monthOf(HE_MONTHS, m[2]), m[3]); return key && { key }; }],
  [new RegExp(`(?:ב[-־]?|ה[-־]?)?(\\d{1,2})\\s+[בל]?${HE_MONTH}(?:\\s+(\\d{4}))?`),
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
  // Hours in words: "בחמש", "בשמונה ועשרים", "בשבע בערב". "בשש ביצים" is a quantity, not a time.
  [new RegExp(`(?:בשעה\\s+|ב)(${alternatives(HE_HOURS)})${HOUR_NOT_QUANTITY}` +
    `(?:\\s+(?:ו(${alternatives(HE_MINUTES)})(?:\\s+דקות)?|פחות\\s+(${alternatives(HE_BEFORE)})))?${NOT_QUANTITY}${DAYPART}?`), m => {
    const h = wordValue(HE_HOURS, m[1]);
    if (m[3]) return { time: hourOf(h - 1 || 12, 60 - wordValue(HE_BEFORE, m[3]), dayPart(m[4])) };
    return { time: hourOf(h, m[2] ? wordValue(HE_MINUTES, m[2]) : 0, dayPart(m[4])) };
  }],
  // "בעשרה לשמונה" is 7:50.
  [new RegExp(`(?:בשעה\\s+|ב)(${alternatives(HE_BEFORE)})\\s+ל(${alternatives(HE_HOURS)})${NOT_QUANTITY}${DAYPART}?`), m => {
    const h = wordValue(HE_HOURS, m[2]);
    return { time: hourOf(h - 1 || 12, 60 - wordValue(HE_BEFORE, m[1]), dayPart(m[3])) };
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

// A repeat found in the text starts today or on its first matching day, and is anchored to that date.
function anchorRepeat(rule, now) {
  const today = keyOf(now);
  if (rule.unit === 'week' && !rule.days) rule.days = [now.getDay()];
  const key = firstDate(rule, today);
  const [, m, d] = key.split('-').map(Number);
  if (rule.unit === 'month' && !rule.monthDay) rule.monthDay = d;
  if (rule.unit === 'year') { rule.monthDay = d; rule.month = m - 1; }
  return key;
}

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
      if (value.repeat) value.key = anchorRepeat(value.repeat, now);
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
    if (day && time && day !== time) {
      candidates.push({ start: a.start, end: b.end, key: day.key, repeat: day.repeat, time: time.time, parts: [a, b] });
    }
  }
  if (!candidates.length) return null;
  // A repeat with its time counts as most complete, then a day with a time.
  const complete = c => (c.at || (c.key && c.time) ? 2 : 1) + (c.repeat ? 1 : 0);
  const best = candidates.reduce((x, y) => (complete(y) > complete(x) || (complete(y) === complete(x) && y.end >= x.end) ? y : x));
  const { start, end } = best;
  if (best.at) return { start, end, when: null, remindAt: best.at, repeat: null };
  const repeat = best.repeat || null;
  if (best.key && best.time) {
    let when = best.key;
    let remindAt = timeOn(when, withDay(best.time), times);
    // "כל יום ב-8" typed after 8: the first one is the next day it repeats.
    if (repeat && remindAt <= now) {
      when = nextDate(repeat, when, keyOf(now));
      remindAt = timeOn(when, withDay(best.time), times);
    }
    return { start, end, when, remindAt, repeat };
  }
  if (best.key) return { start, end, when: best.key, remindAt: null, repeat };
  return { start, end, when: null, remindAt: nextTime(now, best.time, times), repeat: null };
}

// The title without the matched phrase, and without a "ב" or "at" left hanging.
export function stripWhen(text, match) {
  return `${text.slice(0, match.start)} ${text.slice(match.end)}`
    .replace(/\s+/g, ' ').trim().replace(/(?:^|\s)(?:ב|at|on)$/u, '').trim();
}
