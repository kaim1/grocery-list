// store.js — pure state logic. No DOM access allowed in this file.
import { nextDate, shiftReminder } from './repeat.js';

export function newId() { return crypto.randomUUID(); }

export function createState(seed) {
  const categories = seed.categories.map((c, i) => ({ id: newId(), name: c.name, order: i }));
  const items = seed.items.map(it => ({
    id: newId(), name: it.name, categoryId: categories[it.cat].id, lastQty: 1,
  }));
  return { version: 1, categories, items, list: [], todos: [], projects: [] };
}

export function isOnList(state, itemId) {
  return state.list.some(e => e.itemId === itemId);
}

export function addToList(state, itemId) {
  if (isOnList(state, itemId)) return;
  const item = state.items.find(i => i.id === itemId);
  if (!item) return;
  state.list.push({ itemId, qty: item.lastQty || 1 });
}

export function removeFromList(state, itemId) {
  state.list = state.list.filter(e => e.itemId !== itemId);
}

export function setQty(state, itemId, qty) {
  const entry = state.list.find(e => e.itemId === itemId);
  if (!entry) return;
  entry.qty = Math.max(1, Math.floor(Number(qty) || 1));
}

export function checkOff(state, itemId) {
  const entry = state.list.find(e => e.itemId === itemId);
  if (!entry) return;
  const item = state.items.find(i => i.id === itemId);
  if (item) item.lastQty = entry.qty;
  removeFromList(state, itemId);
}

// A bought item stays on the list, marked, until the cart is cleared.
// Unmarking stores false rather than dropping the field, so the change survives a sync merge.
export function setBought(state, itemId, bought) {
  const entry = state.list.find(e => e.itemId === itemId);
  if (entry) entry.bought = Boolean(bought);
}

export function toggleBought(state, itemId) {
  const entry = state.list.find(e => e.itemId === itemId);
  if (entry) setBought(state, itemId, !entry.bought);
}

// Checks off every bought item for real and returns what undo needs to put them back.
export function clearBought(state) {
  const removed = [];
  state.list.forEach((entry, index) => {
    if (!entry.bought) return;
    const lastQty = state.items.find(i => i.id === entry.itemId)?.lastQty;
    removed.push({ entry: { ...entry }, index, lastQty });
  });
  for (const { entry } of removed) checkOff(state, entry.itemId);
  return removed;
}

export function restoreBought(state, removed) {
  for (const { entry, index, lastQty } of removed) {
    restoreListEntry(state, entry, index);
    const item = state.items.find(i => i.id === entry.itemId);
    if (item && lastQty != null) item.lastQty = lastQty;
  }
}

export function createItem(state, name, categoryId) {
  const trimmed = name.trim();
  const existing = state.items.find(i => i.categoryId === categoryId && i.name === trimmed);
  if (existing) return existing;
  const item = { id: newId(), name: trimmed, categoryId, lastQty: 1 };
  state.items.push(item);
  return item;
}

export function renameItem(state, itemId, name) {
  const item = state.items.find(i => i.id === itemId);
  if (item) item.name = name.trim();
}

export function moveItem(state, itemId, categoryId) {
  const item = state.items.find(i => i.id === itemId);
  if (item) item.categoryId = categoryId;
}

export function deleteItem(state, itemId) {
  removeFromList(state, itemId);
  state.items = state.items.filter(i => i.id !== itemId);
}

export function addCategory(state, name) {
  const order = state.categories.length
    ? Math.max(...state.categories.map(c => c.order)) + 1 : 0;
  const category = { id: newId(), name: name.trim(), order };
  state.categories.push(category);
  return category;
}

export function renameCategory(state, categoryId, name) {
  const c = state.categories.find(c => c.id === categoryId);
  if (c) c.name = name.trim();
}

export function deleteCategory(state, categoryId, targetCategoryId) {
  for (const item of state.items) {
    if (item.categoryId === categoryId) item.categoryId = targetCategoryId;
  }
  state.categories = state.categories.filter(c => c.id !== categoryId);
}

export function sortedCategories(state) {
  return [...state.categories].sort((a, b) => a.order - b.order);
}

export function moveCategory(state, categoryId, direction) {
  const sorted = sortedCategories(state);
  const idx = sorted.findIndex(c => c.id === categoryId);
  const swapWith = sorted[idx + direction];
  if (idx === -1 || !swapWith) return;
  const c = sorted[idx];
  [c.order, swapWith.order] = [swapWith.order, c.order];
}

export function serialize(state) { return JSON.stringify(state); }

// A task's `when` is 'anytime', 'someday' or a local date 'YYYY-MM-DD'.
// Today and tomorrow are stored as real dates, so tomorrow's tasks move into today on their own.
export const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function dateKey(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + days));
}

export function addTodo(state, title, fields = {}) {
  if (!title.trim()) return null;
  const todo = { id: newId(), title: title.trim(), done: false, when: 'anytime', ...fields };
  state.todos.push(todo);
  return todo;
}

export function updateTodo(state, id, fields) {
  const todo = state.todos.find(t => t.id === id);
  if (!todo) return;
  if ('title' in fields && !fields.title.trim()) delete fields.title;
  // Empty notes leave no trace on the task.
  if ('notes' in fields && !fields.notes?.trim()) { delete fields.notes; delete todo.notes; }
  Object.assign(todo, fields, 'title' in fields ? { title: fields.title.trim() } : {});
}

// Sections of the tasks screen. Overdue dated tasks join today.
// The last day of the calendar week (Saturday) and of the month that `today` is in.
export function weekEnd(today) {
  const [y, m, d] = today.split('-').map(Number);
  return addDays(today, 6 - new Date(y, m - 1, d).getDay());
}
export function monthEnd(today) {
  const [y, m] = today.split('-').map(Number);
  return dateKey(new Date(y, m, 0));
}

// Undated tasks, whether set to בכל זמן or מתישהו, all go to someday.
export function groupTodos(todos, today) {
  const tomorrow = addDays(today, 1);
  const week = weekEnd(today);
  const month = monthEnd(today);
  const groups = { today: [], tomorrow: [], week: [], month: [], later: [], someday: [] };
  for (const todo of todos) {
    const when = todo.when || 'anytime';
    if (!DATE.test(when)) groups.someday.push(todo);
    else if (when <= today) groups.today.push(todo);
    else if (when === tomorrow) groups.tomorrow.push(todo);
    else if (when <= week) groups.week.push(todo);
    else if (when <= month) groups.month.push(todo);
    else groups.later.push(todo);
  }
  // By date, then by reminder time; on the same date, tasks without a time come last.
  const byDate = (a, b) => (DATE.test(a.when) && DATE.test(b.when) ? a.when.localeCompare(b.when) : 0)
    || (a.remindAt ? b.remindAt ? a.remindAt.localeCompare(b.remindAt) : -1 : b.remindAt ? 1 : 0);
  for (const key of Object.keys(groups)) groups[key].sort(byDate);
  return groups;
}

export function renameTodo(state, id, title) {
  const todo = state.todos.find(t => t.id === id);
  if (todo && title.trim()) todo.title = title.trim();
}

// Checking a repeating task adds its next time and returns it. Reopening it takes that one away again,
// so a series only ever has one open task.
export function setTodoDone(state, id, done, today = dateKey(new Date())) {
  const todo = state.todos.find(t => t.id === id);
  if (!todo) return null;
  todo.done = Boolean(done);
  todo.doneAt = todo.done ? new Date().toISOString() : null;
  if (!todo.done && todo.nextId) {
    const next = state.todos.find(t => t.id === todo.nextId);
    if (next && !next.done) deleteTodo(state, next.id);
    todo.nextId = null;
  }
  if (!todo.done || !todo.repeat || todo.nextId) return null;
  const base = DATE.test(todo.when || '') ? todo.when : today;
  const when = nextDate(todo.repeat, base, today);
  const next = { id: newId(), title: todo.title, done: false, when, repeat: todo.repeat };
  if (todo.projectId) next.projectId = todo.projectId;
  if (todo.notes) next.notes = todo.notes;
  if (todo.remindAt) next.remindAt = shiftReminder(todo.remindAt, base, when);
  state.todos.push(next);
  todo.nextId = next.id;
  return next;
}

// Moves a repeating task to its next time without checking it.
export function skipTodo(state, id, today = dateKey(new Date())) {
  const todo = state.todos.find(t => t.id === id);
  if (!todo?.repeat) return;
  const base = DATE.test(todo.when || '') ? todo.when : today;
  const when = nextDate(todo.repeat, base, today);
  todo.remindAt = shiftReminder(todo.remindAt, base, when) || undefined;
  if (!todo.remindAt) delete todo.remindAt;
  todo.when = when;
}

export function deleteTodo(state, id) {
  state.todos = state.todos.filter(t => t.id !== id);
}

export function addProject(state, name) {
  if (!name.trim()) return null;
  const order = state.projects.length ? Math.max(...state.projects.map(p => p.order)) + 1 : 0;
  const project = { id: newId(), name: name.trim(), order, done: false };
  state.projects.push(project);
  return project;
}

export function updateProject(state, id, fields) {
  const project = state.projects.find(p => p.id === id);
  if (!project) return;
  if ('name' in fields) {
    if (fields.name.trim()) project.name = fields.name.trim();
    delete fields.name;
  }
  Object.assign(project, fields);
}

// Deleting a project either deletes its tasks or keeps them without a project.
export function deleteProject(state, id, { withTasks }) {
  state.projects = state.projects.filter(p => p.id !== id);
  if (withTasks) state.todos = state.todos.filter(t => t.projectId !== id);
  else for (const todo of state.todos) if (todo.projectId === id) todo.projectId = null;
}

export function sortedProjects(state) {
  return [...state.projects].sort((a, b) => a.order - b.order);
}

// Undo support: put a removed row back where it was, unless it already came back.
export function restoreTodo(state, todo, index) {
  if (state.todos.some(t => t.id === todo.id)) return;
  state.todos.splice(Math.min(index, state.todos.length), 0, todo);
}

export function restoreListEntry(state, entry, index) {
  if (isOnList(state, entry.itemId) || !state.items.some(i => i.id === entry.itemId)) return;
  state.list.splice(Math.min(index, state.list.length), 0, entry);
}

export function load(raw, seed) {
  if (raw == null || raw === '') return { state: createState(seed), corrupt: false };
  let doc;
  try { doc = JSON.parse(raw); } catch { return { state: createState(seed), corrupt: true }; }
  if (!isValidDoc(doc)) return { state: createState(seed), corrupt: true };
  doc.todos ??= [];
  doc.projects ??= [];
  for (const todo of doc.todos) todo.when ??= 'anytime';
  doc.list = doc.list.filter(e => doc.items.some(i => i.id === e.itemId));
  return { state: doc, corrupt: false };
}

function isValidDoc(doc) {
  if (typeof doc !== 'object' || doc === null || doc.version !== 1) return false;
  if (![doc.categories, doc.items, doc.list].every(Array.isArray)) return false;
  if (doc.todos !== undefined && (!Array.isArray(doc.todos) || !doc.todos.every(t =>
    t && typeof t.id === 'string' && typeof t.title === 'string' &&
    t.title.trim() && typeof t.done === 'boolean' &&
    (t.when === undefined || t.when === 'anytime' || t.when === 'someday' || DATE.test(t.when)) &&
    [t.remindAt, t.projectId, t.doneAt, t.notes].every(v => v == null || typeof v === 'string')))) return false;
  if (!Array.isArray(doc.projects ?? []) || !(doc.projects ?? []).every(p =>
    p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.order === 'number' &&
    typeof (p.done ?? false) === 'boolean')) return false;
  const catOk = doc.categories.every(c =>
    typeof c.id === 'string' && typeof c.name === 'string' && typeof c.order === 'number');
  const itemOk = doc.items.every(i =>
    typeof i.id === 'string' && typeof i.name === 'string' &&
    doc.categories.some(c => c.id === i.categoryId));
  const listOk = doc.list.every(e =>
    typeof e.itemId === 'string' && typeof e.qty === 'number' &&
    (e.bought === undefined || typeof e.bought === 'boolean'));
  return catOk && itemOk && listOk;
}
