// store.js — pure state logic. No DOM access allowed in this file.
export function newId() { return crypto.randomUUID(); }

export function createState(seed) {
  const categories = seed.categories.map((c, i) => ({ id: newId(), name: c.name, order: i }));
  const items = seed.items.map(it => ({
    id: newId(), name: it.name, categoryId: categories[it.cat].id, lastQty: 1,
  }));
  return { version: 1, categories, items, list: [] };
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
