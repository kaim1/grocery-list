// store.js — pure state logic. No DOM access allowed in this file.
export function newId() { return crypto.randomUUID(); }

export function createState(seed) {
  const categories = seed.categories.map((c, i) => ({ id: newId(), name: c.name, order: i }));
  const items = seed.items.map(it => ({
    id: newId(), name: it.name, categoryId: categories[it.cat].id, lastQty: 1,
  }));
  return { version: 1, categories, items, list: [], todos: [] };
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
  Object.assign(todo, fields, 'title' in fields ? { title: fields.title.trim() } : {});
}

// Sections of the tasks screen. Overdue dated tasks join today.
export function groupTodos(todos, today) {
  const tomorrow = addDays(today, 1);
  const groups = { today: [], tomorrow: [], upcoming: [], anytime: [], someday: [] };
  for (const todo of todos) {
    const when = todo.when || 'anytime';
    if (when === 'someday') groups.someday.push(todo);
    else if (!DATE.test(when)) groups.anytime.push(todo);
    else if (when <= today) groups.today.push(todo);
    else if (when === tomorrow) groups.tomorrow.push(todo);
    else groups.upcoming.push(todo);
  }
  const byDate = (a, b) => a.when.localeCompare(b.when);
  groups.today.sort(byDate);
  groups.upcoming.sort(byDate);
  return groups;
}

export function renameTodo(state, id, title) {
  const todo = state.todos.find(t => t.id === id);
  if (todo && title.trim()) todo.title = title.trim();
}

export function setTodoDone(state, id, done) {
  const todo = state.todos.find(t => t.id === id);
  if (!todo) return;
  todo.done = Boolean(done);
  todo.doneAt = todo.done ? new Date().toISOString() : null;
}

export function deleteTodo(state, id) {
  state.todos = state.todos.filter(t => t.id !== id);
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
    [t.remindAt, t.projectId, t.doneAt].every(v => v == null || typeof v === 'string')))) return false;
  const catOk = doc.categories.every(c =>
    typeof c.id === 'string' && typeof c.name === 'string' && typeof c.order === 'number');
  const itemOk = doc.items.every(i =>
    typeof i.id === 'string' && typeof i.name === 'string' &&
    doc.categories.some(c => c.id === i.categoryId));
  const listOk = doc.list.every(e =>
    typeof e.itemId === 'string' && typeof e.qty === 'number');
  return catOk && itemOk && listOk;
}
