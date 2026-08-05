import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../store.js';

const seed = {
  categories: [{ name: 'ירקות' }, { name: 'מוצרי חלב' }],
  items: [{ name: 'מלפפונים', cat: 0 }, { name: 'חלב', cat: 1 }],
};

function fresh() { return store.createState(seed); }
function idOf(state, name) { return state.items.find(i => i.name === name).id; }

test('createState builds categories with order and items with lastQty 1', () => {
  const s = fresh();
  assert.equal(s.version, 1);
  assert.deepEqual(s.categories.map(c => c.name), ['ירקות', 'מוצרי חלב']);
  assert.deepEqual(s.categories.map(c => c.order), [0, 1]);
  const cuc = s.items.find(i => i.name === 'מלפפונים');
  assert.equal(cuc.categoryId, s.categories[0].id);
  assert.equal(cuc.lastQty, 1);
  assert.deepEqual(s.list, []);
});

test('addToList uses lastQty and is idempotent', () => {
  const s = fresh();
  const id = idOf(s, 'מלפפונים');
  s.items.find(i => i.id === id).lastQty = 5;
  store.addToList(s, id);
  store.addToList(s, id);
  assert.deepEqual(s.list, [{ itemId: id, qty: 5 }]);
  assert.equal(store.isOnList(s, id), true);
});

test('setQty clamps to integer >= 1', () => {
  const s = fresh();
  const id = idOf(s, 'חלב');
  store.addToList(s, id);
  store.setQty(s, id, 4);
  assert.equal(s.list[0].qty, 4);
  store.setQty(s, id, 0);
  assert.equal(s.list[0].qty, 1);
  store.setQty(s, id, 2.7);
  assert.equal(s.list[0].qty, 2);
});

test('checkOff writes lastQty back and removes from list', () => {
  const s = fresh();
  const id = idOf(s, 'מלפפונים');
  store.addToList(s, id);
  store.setQty(s, id, 6);
  store.checkOff(s, id);
  assert.equal(store.isOnList(s, id), false);
  assert.equal(s.items.find(i => i.id === id).lastQty, 6);
  store.addToList(s, id);
  assert.equal(s.list[0].qty, 6);
});

test('removeFromList removes without touching lastQty', () => {
  const s = fresh();
  const id = idOf(s, 'חלב');
  store.addToList(s, id);
  store.setQty(s, id, 9);
  store.removeFromList(s, id);
  assert.equal(store.isOnList(s, id), false);
  assert.equal(s.items.find(i => i.id === id).lastQty, 1);
});
