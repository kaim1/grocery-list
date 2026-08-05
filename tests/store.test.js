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

test('createItem trims, assigns category, dedupes within category', () => {
  const s = fresh();
  const veg = s.categories[0].id;
  const a = store.createItem(s, '  עגבניות ', veg);
  assert.equal(a.name, 'עגבניות');
  assert.equal(a.categoryId, veg);
  const b = store.createItem(s, 'עגבניות', veg);
  assert.equal(b.id, a.id);
  assert.equal(s.items.filter(i => i.name === 'עגבניות').length, 1);
});

test('deleteItem removes from catalog and list', () => {
  const s = fresh();
  const id = idOf(s, 'חלב');
  store.addToList(s, id);
  store.deleteItem(s, id);
  assert.equal(s.items.some(i => i.id === id), false);
  assert.deepEqual(s.list, []);
});

test('rename and move item', () => {
  const s = fresh();
  const id = idOf(s, 'מלפפונים');
  store.renameItem(s, id, 'מלפפון בייבי');
  store.moveItem(s, id, s.categories[1].id);
  const it = s.items.find(i => i.id === id);
  assert.equal(it.name, 'מלפפון בייבי');
  assert.equal(it.categoryId, s.categories[1].id);
});

test('category add/rename/reorder/delete-with-move', () => {
  const s = fresh();
  const frozen = store.addCategory(s, 'קפואים');
  assert.equal(frozen.order, 2);
  store.renameCategory(s, frozen.id, 'מקפיא');
  assert.equal(s.categories.find(c => c.id === frozen.id).name, 'מקפיא');

  store.moveCategory(s, frozen.id, -1);
  assert.deepEqual(store.sortedCategories(s).map(c => c.name),
    ['ירקות', 'מקפיא', 'מוצרי חלב']);
  store.moveCategory(s, store.sortedCategories(s)[0].id, -1); // no-op at edge
  assert.equal(store.sortedCategories(s)[0].name, 'ירקות');

  const veg = s.categories.find(c => c.name === 'ירקות');
  const dairy = s.categories.find(c => c.name === 'מוצרי חלב');
  store.deleteCategory(s, veg.id, dairy.id);
  assert.equal(s.categories.some(c => c.id === veg.id), false);
  assert.equal(s.items.find(i => i.name === 'מלפפונים').categoryId, dairy.id);
});

test('serialize/load round-trip preserves state', () => {
  const s = fresh();
  store.addToList(s, idOf(s, 'חלב'));
  store.setQty(s, idOf(s, 'חלב'), 3);
  const { state: s2, corrupt } = store.load(store.serialize(s), seed);
  assert.equal(corrupt, false);
  assert.deepEqual(s2, s);
});

test('load(null) returns fresh seed state, not corrupt', () => {
  const { state: s, corrupt } = store.load(null, seed);
  assert.equal(corrupt, false);
  assert.equal(s.items.length, 2);
});

test('load of invalid JSON or wrong shape reports corrupt', () => {
  for (const raw of ['{not json', '"a string"', '{"version":2}',
                     JSON.stringify({ version: 1, categories: [], items: [], list: 5 })]) {
    const { state: s, corrupt } = store.load(raw, seed);
    assert.equal(corrupt, true, raw);
    assert.equal(s.items.length, 2); // fell back to seed
  }
});

test('load drops orphan list entries but flags orphan items as corrupt', () => {
  const s = fresh();
  const good = store.serialize({ ...s, list: [{ itemId: 'ghost', qty: 2 }] });
  const r1 = store.load(good, seed);
  assert.equal(r1.corrupt, false);
  assert.deepEqual(r1.state.list, []);

  const bad = JSON.parse(store.serialize(s));
  bad.items[0].categoryId = 'ghost';
  const r2 = store.load(JSON.stringify(bad), seed);
  assert.equal(r2.corrupt, true);
});
