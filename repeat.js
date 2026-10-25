// repeat.js — when a repeating task comes round again. Pure, so it is tested with node (tests/repeat.test.js).
// A rule is {mode: 'fixed' | 'after', every, unit: 'day' | 'week' | 'month' | 'year', days?, monthDay?, month?}.
// 'fixed' follows a calendar; 'after' counts from the day the task was done. Dates are 'YYYY-MM-DD' keys.

const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (key, n) => { const d = parse(key); d.setDate(d.getDate() + n); return keyOf(d); };
const weekday = key => parse(key).getDay();
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

// The given day of a month, or its last day when the month is shorter ("every month on the 31st").
function monthDate(year, month, day) {
  const last = new Date(year, month + 1, 0).getDate();
  return keyOf(new Date(year, month, Math.min(day, last)));
}

function addMonths(key, months, anchorDay) {
  const d = parse(key);
  return monthDate(d.getFullYear(), d.getMonth() + months, anchorDay ?? d.getDate());
}

const weekStart = key => addDays(key, -weekday(key));

// Next date on a weekly rule with chosen days: right weekday, in a week that is a multiple of `every` away.
function nextWeekly(rule, from) {
  const days = rule.days?.length ? rule.days : [weekday(from)];
  const start = weekStart(from);
  for (let i = 1; i <= 7 * rule.every * 2 + 7; i++) {
    const key = addDays(from, i);
    const weeks = daysBetween(start, weekStart(key)) / 7;
    if (weeks % rule.every === 0 && days.includes(weekday(key))) return key;
  }
  return addDays(from, 7 * rule.every);
}

function step(rule, from) {
  if (rule.unit === 'day') return addDays(from, rule.every);
  if (rule.unit === 'week') return nextWeekly(rule, from);
  if (rule.unit === 'month') return addMonths(from, rule.every, rule.monthDay);
  const d = parse(from);
  return monthDate(d.getFullYear() + rule.every, rule.month ?? d.getMonth(), rule.monthDay ?? d.getDate());
}

// The next date after `from` that is also after today, so a missed task does not pile up copies.
export function nextDate(rule, from, today) {
  if (rule.mode === 'after') {
    if (rule.unit === 'week') return addDays(today, 7 * rule.every);
    return step({ ...rule, days: null, monthDay: null, month: null }, today);
  }
  let key = step(rule, from);
  for (let i = 0; key <= today && i < 5000; i++) key = step(rule, key);
  return key;
}

// The first date of a new rule, on or after today: today, or the first matching weekday or day of the month.
export function firstDate(rule, today) {
  if (rule.mode === 'after' || rule.unit === 'day') return today;
  if (rule.unit === 'week') {
    const days = rule.days?.length ? rule.days : [weekday(today)];
    for (let i = 0; i < 7; i++) if (days.includes(weekday(addDays(today, i)))) return addDays(today, i);
  }
  if (rule.unit === 'month' && rule.monthDay) {
    const d = parse(today);
    const thisMonth = monthDate(d.getFullYear(), d.getMonth(), rule.monthDay);
    return thisMonth >= today ? thisMonth : monthDate(d.getFullYear(), d.getMonth() + 1, rule.monthDay);
  }
  return today;
}

// Moves a reminder by the same number of days the task moved, keeping its time of day.
export function shiftReminder(remindAt, fromKey, toKey) {
  if (!remindAt) return null;
  const date = new Date(remindAt);
  date.setDate(date.getDate() + daysBetween(fromKey, toKey));
  return date.toISOString();
}

const LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const WORK_DAYS = [0, 1, 2, 3, 4];
const joinDays = days => {
  const names = [...days].sort().map(d => LETTERS[d]);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} ו${names.at(-1)}` : names[0];
};
const sameDays = (a, b) => a.length === b.length && a.every(d => b.includes(d));

const COUNT = {
  day: n => (n === 1 ? 'יום' : n === 2 ? 'יומיים' : `${n} ימים`),
  week: n => (n === 1 ? 'שבוע' : n === 2 ? 'שבועיים' : `${n} שבועות`),
  month: n => (n === 1 ? 'חודש' : n === 2 ? 'חודשיים' : `${n} חודשים`),
  year: n => (n === 1 ? 'שנה' : n === 2 ? 'שנתיים' : `${n} שנים`),
};
export const unitLabel = (unit, n) => COUNT[unit](n).replace(/^\d+ /, '');

// "כל יום", "כל יום חול", "כל שבוע ביום א׳", "כל שבועיים, בימים ב׳ וה׳", "3 ימים אחרי שסיימתי".
export function describe(rule, baseKey) {
  if (!rule) return 'ללא חזרה';
  const { every, unit } = rule;
  if (rule.mode === 'after') return `${COUNT[unit](every)} אחרי שסיימתי`;
  const each = `כל ${COUNT[unit](every)}`;
  if (unit === 'week') {
    const days = rule.days?.length ? rule.days : [weekday(baseKey)];
    if (every === 1 && sameDays(days, WORK_DAYS)) return 'כל יום חול';
    return days.length === 1 ? `${each} ביום ${LETTERS[days[0]]}` : `${each}, בימים ${joinDays(days)}`;
  }
  const base = parse(baseKey);
  if (unit === 'month') return `${each} ב-${rule.monthDay ?? base.getDate()}`;
  if (unit === 'year') return `${each} ב-${rule.monthDay ?? base.getDate()}.${(rule.month ?? base.getMonth()) + 1}`;
  return each;
}

// One word for the composer chip.
export function shortLabel(rule) {
  if (!rule) return 'חוזר';
  if (rule.mode === 'after' || rule.every !== 1) return 'מותאם';
  return { day: 'יומי', week: sameDays(rule.days || [], WORK_DAYS) ? 'ימי חול' : 'שבועי', month: 'חודשי', year: 'שנתי' }[rule.unit];
}

// The one-tap choices, anchored to the task's date.
export function presets(baseKey) {
  const base = parse(baseKey);
  return [
    { id: 'day', rule: { mode: 'fixed', every: 1, unit: 'day' } },
    { id: 'workdays', rule: { mode: 'fixed', every: 1, unit: 'week', days: WORK_DAYS } },
    { id: 'week', rule: { mode: 'fixed', every: 1, unit: 'week', days: [base.getDay()] } },
    { id: 'month', rule: { mode: 'fixed', every: 1, unit: 'month', monthDay: base.getDate() } },
    { id: 'year', rule: { mode: 'fixed', every: 1, unit: 'year', monthDay: base.getDate(), month: base.getMonth() } },
  ];
}

export function sameRule(a, b) {
  if (!a || !b) return !a && !b;
  return a.mode === b.mode && a.every === b.every && a.unit === b.unit &&
    sameDays(a.days || [], b.days || []) && (a.monthDay ?? null) === (b.monthDay ?? null) && (a.month ?? null) === (b.month ?? null);
}
