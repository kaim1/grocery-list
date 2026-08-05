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
