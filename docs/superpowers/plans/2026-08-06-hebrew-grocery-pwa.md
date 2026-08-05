# Hebrew Grocery List PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Hebrew RTL single-page PWA grocery list — aisle-ordered categorized list with quantities, plus a compact chip catalog of past purchases — offline, serverless, localStorage-backed.

**Architecture:** Pure state logic in `store.js` (no DOM, unit-tested with `node --test`); `app.js` renders two screens (list/catalog) from state and persists after every mutation; a service worker caches the app shell for offline use.

**Tech Stack:** Vanilla HTML/CSS/JS (ES modules), no framework, no build step. Node 20+ for tests only.

## Global Constraints

- All UI text Hebrew; document root `<html lang="he" dir="rtl">`.
- No product images, no icons on items, no CSS animations/transitions.
- Quantity is a plain positive integer, minimum 1, no units.
- Data persists to localStorage key `groceries-v1` after every mutation; corrupt data is preserved under `groceries-corrupt-backup`, never discarded.
- Spec: `docs/superpowers/specs/2026-08-06-hebrew-grocery-pwa-design.md`.
- Working dir for all commands: `/Users/kaimichaelson/Desktop/cowork/cal/grocery-list`.
- Commit after every green test cycle; end commit messages with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

```
grocery-list/
  index.html        — markup: header tabs + two screen containers + dialogs
  style.css         — RTL-first styles, no animation
  app.js            — UI wiring: render + event handlers + persistence calls
  store.js          — pure state logic (all mutations), no DOM
  seed.js           — default categories + ~100 seed items (data only)
  sw.js             — service worker: cache-first app shell
  manifest.json     — PWA manifest (Hebrew name)
  icon.svg          — app icon (simple glyph, also source for PNG)
  tests/store.test.js — node --test suite for store.js
```

---

### Task 1: store.js — state creation + list operations + quantities

**Files:**
- Create: `store.js`
- Create: `tests/store.test.js`

**Interfaces:**
- Consumes: seed shape `{categories: [{name}], items: [{name, cat}]}` (cat = index into categories array).
- Produces (all exported from `store.js`, all mutate `state` in place):
  - `createState(seed) -> state` where state = `{version:1, categories:[{id,name,order}], items:[{id,name,categoryId,lastQty}], list:[{itemId,qty}]}`
  - `addToList(state, itemId)` — adds with `qty = item.lastQty` (default 1); no-op if already on list
  - `removeFromList(state, itemId)`
  - `checkOff(state, itemId)` — writes qty back to `item.lastQty`, removes from list
  - `setQty(state, itemId, qty)` — clamps to integer ≥ 1
  - `isOnList(state, itemId) -> boolean`
  - `newId() -> string` (crypto.randomUUID)

- [ ] **Step 1: Write the failing tests**

```js
// tests/store.test.js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/`
Expected: FAIL — cannot find module `../store.js`.

- [ ] **Step 3: Write minimal implementation**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add store.js tests/store.test.js
git commit -m "feat: store core — state creation, list ops, quantities"
```

---

### Task 2: store.js — item and category management

**Files:**
- Modify: `store.js` (append)
- Modify: `tests/store.test.js` (append)

**Interfaces:**
- Consumes: Task 1 state shape and `newId`.
- Produces (appended exports, mutate in place):
  - `createItem(state, name, categoryId) -> item` (trimmed name; returns existing item on duplicate name in same category instead of creating)
  - `renameItem(state, itemId, name)`
  - `moveItem(state, itemId, categoryId)`
  - `deleteItem(state, itemId)` — also removes from list
  - `addCategory(state, name) -> category` (order = max+1)
  - `renameCategory(state, categoryId, name)`
  - `deleteCategory(state, categoryId, targetCategoryId)` — moves its items to target
  - `moveCategory(state, categoryId, direction)` — direction −1/+1, swaps `order` with neighbor
  - `sortedCategories(state) -> categories sorted by order`

- [ ] **Step 1: Write the failing tests (append to tests/store.test.js)**

```js
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
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test tests/`
Expected: Task 1 tests PASS; new tests FAIL with "store.createItem is not a function".

- [ ] **Step 3: Write minimal implementation (append to store.js)**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/`
Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add store.js tests/store.test.js
git commit -m "feat: store item and category management"
```

---

### Task 3: store.js — persistence, validation, export/import

**Files:**
- Modify: `store.js` (append)
- Modify: `tests/store.test.js` (append)

**Interfaces:**
- Consumes: Task 1–2 state shape.
- Produces:
  - `serialize(state) -> string` (JSON)
  - `load(raw, seed) -> { state, corrupt }` — `raw` is the stored string or null. Valid JSON matching the shape → `{state, corrupt:false}`. null/empty → fresh seed state, `corrupt:false`. Anything else → fresh seed state, `corrupt:true` (caller preserves the raw string).
  - Validation rule: doc must be an object with `version === 1`, arrays `categories`/`items`/`list`; every item's `categoryId` must exist; every list entry's `itemId` must exist; list entries with unknown items are dropped (not treated as corrupt); items with unknown categories ARE corrupt.

- [ ] **Step 1: Write the failing tests (append)**

```js
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
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test tests/`
Expected: new tests FAIL with "store.serialize is not a function".

- [ ] **Step 3: Write minimal implementation (append)**

```js
export function serialize(state) { return JSON.stringify(state); }

export function load(raw, seed) {
  if (raw == null || raw === '') return { state: createState(seed), corrupt: false };
  let doc;
  try { doc = JSON.parse(raw); } catch { return { state: createState(seed), corrupt: true }; }
  if (!isValidDoc(doc)) return { state: createState(seed), corrupt: true };
  doc.list = doc.list.filter(e => doc.items.some(i => i.id === e.itemId));
  return { state: doc, corrupt: false };
}

function isValidDoc(doc) {
  if (typeof doc !== 'object' || doc === null || doc.version !== 1) return false;
  if (![doc.categories, doc.items, doc.list].every(Array.isArray)) return false;
  const catOk = doc.categories.every(c =>
    typeof c.id === 'string' && typeof c.name === 'string' && typeof c.order === 'number');
  const itemOk = doc.items.every(i =>
    typeof i.id === 'string' && typeof i.name === 'string' &&
    doc.categories.some(c => c.id === i.categoryId));
  const listOk = doc.list.every(e =>
    typeof e.itemId === 'string' && typeof e.qty === 'number');
  return catOk && itemOk && listOk;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/`
Expected: all 13 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add store.js tests/store.test.js
git commit -m "feat: store persistence, validation, round-trip"
```

---

### Task 4: seed.js — default Hebrew categories and items

**Files:**
- Create: `seed.js`

**Interfaces:**
- Produces: `export const SEED = { categories: [{name}], items: [{name, cat}] }` — the exact shape `createState` consumes. Category order in the array is the default aisle order.

- [ ] **Step 1: Write seed.js**

The 11 spec categories in this order, ~100 items total. Full content:

```js
// seed.js — default catalog. cat = index into categories.
export const SEED = {
  categories: [
    { name: 'ירקות' }, { name: 'פירות' }, { name: 'מוצרי חלב' },
    { name: 'בשר ודגים' }, { name: 'מאפים' }, { name: 'קפואים' },
    { name: 'שימורים ויבשים' }, { name: 'ממתקים וחטיפים' },
    { name: 'משקאות' }, { name: 'ניקיון' }, { name: 'טואלטיקה' },
  ],
  items: [
    // ירקות (0)
    { name: 'מלפפונים', cat: 0 }, { name: 'עגבניות', cat: 0 },
    { name: 'בצל', cat: 0 }, { name: 'שום', cat: 0 },
    { name: 'גזר', cat: 0 }, { name: 'פלפל אדום', cat: 0 },
    { name: 'חסה', cat: 0 }, { name: 'תפוחי אדמה', cat: 0 },
    { name: 'בטטה', cat: 0 }, { name: 'קישוא', cat: 0 },
    { name: 'חציל', cat: 0 }, { name: 'ברוקולי', cat: 0 },
    { name: 'כרובית', cat: 0 }, { name: 'פטרוזיליה', cat: 0 },
    { name: 'כוסברה', cat: 0 }, { name: 'שמיר', cat: 0 },
    { name: 'לימון', cat: 0 }, { name: 'פטריות', cat: 0 },
    // פירות (1)
    { name: 'תפוחים', cat: 1 }, { name: 'בננות', cat: 1 },
    { name: 'תפוזים', cat: 1 }, { name: 'ענבים', cat: 1 },
    { name: 'אבטיח', cat: 1 }, { name: 'מלון', cat: 1 },
    { name: 'אגסים', cat: 1 }, { name: 'אפרסקים', cat: 1 },
    { name: 'תותים', cat: 1 }, { name: 'אבוקדו', cat: 1 },
    // מוצרי חלב (2)
    { name: 'חלב', cat: 2 }, { name: 'גבינה לבנה', cat: 2 },
    { name: 'גבינה צהובה', cat: 2 }, { name: 'קוטג׳', cat: 2 },
    { name: 'יוגורט', cat: 2 }, { name: 'שמנת חמוצה', cat: 2 },
    { name: 'שמנת מתוקה', cat: 2 }, { name: 'חמאה', cat: 2 },
    { name: 'ביצים', cat: 2 }, { name: 'גבינת פטה', cat: 2 },
    { name: 'מוצרלה', cat: 2 }, { name: 'לאבנה', cat: 2 },
    // בשר ודגים (3)
    { name: 'חזה עוף', cat: 3 }, { name: 'שוקיים עוף', cat: 3 },
    { name: 'בשר טחון', cat: 3 }, { name: 'סלמון', cat: 3 },
    { name: 'טונה טרייה', cat: 3 }, { name: 'נקניקיות', cat: 3 },
    { name: 'פסטרמה', cat: 3 },
    // מאפים (4)
    { name: 'לחם', cat: 4 }, { name: 'חלה', cat: 4 },
    { name: 'פיתות', cat: 4 }, { name: 'לחמניות', cat: 4 },
    { name: 'טורטיות', cat: 4 }, { name: 'קרואסונים', cat: 4 },
    // קפואים (5)
    { name: 'אפונה קפואה', cat: 5 }, { name: 'שעועית ירוקה קפואה', cat: 5 },
    { name: 'תירס קפוא', cat: 5 }, { name: 'פיצה קפואה', cat: 5 },
    { name: 'גלידה', cat: 5 }, { name: 'בורקס קפוא', cat: 5 },
    { name: 'מלאווח', cat: 5 },
    // שימורים ויבשים (6)
    { name: 'אורז', cat: 6 }, { name: 'פסטה', cat: 6 },
    { name: 'קוסקוס', cat: 6 }, { name: 'עדשים', cat: 6 },
    { name: 'חומוס גרגירים', cat: 6 }, { name: 'טונה בשימורים', cat: 6 },
    { name: 'תירס בשימורים', cat: 6 }, { name: 'רסק עגבניות', cat: 6 },
    { name: 'קמח', cat: 6 }, { name: 'סוכר', cat: 6 },
    { name: 'מלח', cat: 6 }, { name: 'שמן זית', cat: 6 },
    { name: 'שמן קנולה', cat: 6 }, { name: 'חומץ', cat: 6 },
    { name: 'טחינה גולמית', cat: 6 }, { name: 'דבש', cat: 6 },
    { name: 'קורנפלקס', cat: 6 }, { name: 'שיבולת שועל', cat: 6 },
    // ממתקים וחטיפים (7)
    { name: 'שוקולד', cat: 7 }, { name: 'במבה', cat: 7 },
    { name: 'ביסלי', cat: 7 }, { name: 'עוגיות', cat: 7 },
    { name: 'קרקרים', cat: 7 }, { name: 'חטיפי אנרגיה', cat: 7 },
    // משקאות (8)
    { name: 'מים מינרלים', cat: 8 }, { name: 'סודה', cat: 8 },
    { name: 'מיץ תפוזים', cat: 8 }, { name: 'קפה', cat: 8 },
    { name: 'תה', cat: 8 }, { name: 'בירה', cat: 8 }, { name: 'יין', cat: 8 },
    // ניקיון (9)
    { name: 'נוזל כלים', cat: 9 }, { name: 'אבקת כביסה', cat: 9 },
    { name: 'מרכך כביסה', cat: 9 }, { name: 'שקיות אשפה', cat: 9 },
    { name: 'נייר סופג', cat: 9 }, { name: 'ספוגים', cat: 9 },
    { name: 'אקונומיקה', cat: 9 },
    // טואלטיקה (10)
    { name: 'נייר טואלט', cat: 10 }, { name: 'משחת שיניים', cat: 10 },
    { name: 'שמפו', cat: 10 }, { name: 'מרכך שיער', cat: 10 },
    { name: 'סבון גוף', cat: 10 }, { name: 'דאודורנט', cat: 10 },
  ],
};
```

- [ ] **Step 2: Verify it loads and passes validation**

Run: `node -e "import('./seed.js').then(async m => { const s = await import('./store.js'); const st = s.createState(m.SEED); console.log(st.categories.length, 'categories,', st.items.length, 'items'); })"`
Expected: `11 categories, 100 items` (±5 items is fine; must be ≥ 90).

- [ ] **Step 3: Commit**

```bash
git add seed.js
git commit -m "feat: seed data — 11 Hebrew categories, ~100 items"
```

---

### Task 5: index.html + style.css — RTL shell with tab navigation

**Files:**
- Create: `index.html`
- Create: `style.css`
- Create: `app.js` (skeleton only — tab switching; screens filled in Tasks 6–8)

**Interfaces:**
- Produces DOM ids consumed by Tasks 6–9: `#screen-list`, `#screen-catalog`, `#tab-list`, `#tab-catalog`, `#list-container`, `#catalog-container`, `#search`, `#btn-edit-mode`, `#btn-export`, `#btn-import`, `#import-file`, `#tab-list-count`.
- Produces `app.js` skeleton with `showScreen(name)` and module-level `let state` + `save()`/`boot()` using `store.load`/`store.serialize` and localStorage keys `groceries-v1`, `groceries-corrupt-backup`.

- [ ] **Step 1: Write index.html**

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#2e7d32">
  <title>מצרכים</title>
  <link rel="stylesheet" href="style.css">
  <link rel="manifest" href="manifest.json">
  <link rel="apple-touch-icon" href="icon-180.png">
</head>
<body>
  <header>
    <h1>מצרכים</h1>
    <nav>
      <button id="tab-list" class="tab active">הרשימה <span id="tab-list-count"></span></button>
      <button id="tab-catalog" class="tab">הקטלוג</button>
    </nav>
  </header>

  <main>
    <section id="screen-list">
      <div id="list-container"></div>
      <p id="list-empty" class="empty" hidden>הרשימה ריקה — הוסיפו פריטים מהקטלוג</p>
    </section>

    <section id="screen-catalog" hidden>
      <div class="catalog-bar">
        <input id="search" type="search" placeholder="חיפוש או פריט חדש…" autocomplete="off">
        <button id="btn-edit-mode" title="עריכה">עריכה</button>
      </div>
      <div id="catalog-container"></div>
      <div class="settings">
        <button id="btn-export">גיבוי (ייצוא)</button>
        <button id="btn-import">שחזור (ייבוא)</button>
        <input id="import-file" type="file" accept="application/json" hidden>
      </div>
    </section>
  </main>

  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write style.css**

```css
* { box-sizing: border-box; margin: 0; -webkit-tap-highlight-color: transparent; }
html { font-size: 17px; }
body {
  font-family: -apple-system, "Segoe UI", Roboto, "Noto Sans Hebrew", Arial, sans-serif;
  background: #fafaf7; color: #1c1c1c; min-height: 100dvh;
}
header {
  position: sticky; top: 0; background: #2e7d32; color: #fff;
  padding: env(safe-area-inset-top) 1rem 0; z-index: 2;
}
h1 { font-size: 1.15rem; padding: .6rem 0 .3rem; }
nav { display: flex; gap: .25rem; }
.tab {
  flex: 1; border: 0; background: transparent; color: #c8e6c9;
  font: inherit; padding: .5rem; border-bottom: 3px solid transparent;
}
.tab.active { color: #fff; border-bottom-color: #fff; font-weight: 600; }
main { padding: .75rem .75rem calc(1rem + env(safe-area-inset-bottom)); }
.empty { color: #888; text-align: center; padding: 2rem 0; }

/* list screen */
.category h2 {
  font-size: .85rem; color: #2e7d32; text-transform: none;
  margin: .9rem 0 .25rem; border-bottom: 1px solid #dcdcd4; padding-bottom: .15rem;
}
.row {
  display: flex; align-items: center; gap: .6rem;
  background: #fff; border: 1px solid #e4e4dc; border-radius: 8px;
  padding: .5rem .6rem; margin-bottom: .35rem;
}
.row input[type=checkbox] { width: 1.35rem; height: 1.35rem; }
.row .name { flex: 1; }
.stepper { display: flex; align-items: center; gap: .15rem; }
.stepper button {
  width: 1.9rem; height: 1.9rem; border: 1px solid #ccc; background: #f4f4ef;
  border-radius: 6px; font-size: 1.1rem; line-height: 1;
}
.stepper .qty {
  min-width: 2rem; text-align: center; border: 0; background: transparent;
  font: inherit; padding: 0;
}

/* catalog screen */
.catalog-bar { display: flex; gap: .5rem; margin-bottom: .5rem; }
#search {
  flex: 1; font: inherit; padding: .5rem .7rem;
  border: 1px solid #ccc; border-radius: 8px; background: #fff;
}
#btn-edit-mode { border: 1px solid #ccc; background: #fff; border-radius: 8px; padding: 0 .8rem; font: inherit; }
#btn-edit-mode.active { background: #2e7d32; color: #fff; border-color: #2e7d32; }
.chips { display: flex; flex-wrap: wrap; gap: .35rem; }
.chip {
  border: 1px solid #cfcfc6; background: #fff; border-radius: 999px;
  padding: .35rem .8rem; font: inherit; font-size: .95rem;
}
.chip.on-list { background: #2e7d32; color: #fff; border-color: #2e7d32; }
.add-new { border-style: dashed; color: #2e7d32; }
.settings { display: flex; gap: .5rem; margin-top: 1.5rem; }
.settings button { font: inherit; padding: .45rem .8rem; border: 1px solid #ccc; border-radius: 8px; background: #fff; }
```

- [ ] **Step 3: Write app.js skeleton**

```js
// app.js — UI wiring. All state changes go through store.js, then save().
import * as store from './store.js';
import { SEED } from './seed.js';

const KEY = 'groceries-v1';
const BACKUP_KEY = 'groceries-corrupt-backup';
let state;

function save() { localStorage.setItem(KEY, store.serialize(state)); }

function boot() {
  const raw = localStorage.getItem(KEY);
  const { state: loaded, corrupt } = store.load(raw, SEED);
  if (corrupt) localStorage.setItem(BACKUP_KEY, raw);
  state = loaded;
  save();
  render();
}

export function showScreen(name) {
  document.getElementById('screen-list').hidden = name !== 'list';
  document.getElementById('screen-catalog').hidden = name !== 'catalog';
  document.getElementById('tab-list').classList.toggle('active', name === 'list');
  document.getElementById('tab-catalog').classList.toggle('active', name === 'catalog');
}

function render() {
  renderList();
  renderCatalog();
  const n = state.list.length;
  document.getElementById('tab-list-count').textContent = n ? `(${n})` : '';
}

function renderList() { /* Task 6 */ }
function renderCatalog() { /* Task 7 */ }

document.getElementById('tab-list').onclick = () => showScreen('list');
document.getElementById('tab-catalog').onclick = () => showScreen('catalog');
boot();
```

- [ ] **Step 4: Verify in browser**

Run: `python3 -m http.server 8765 --directory .` (background) and open `http://localhost:8765`.
Expected: green RTL header "מצרכים", two tabs that switch screens, search box and edit/export/import buttons visible on the catalog tab, no console errors (404 for manifest.json/icon is acceptable until Task 9).

- [ ] **Step 5: Commit**

```bash
git add index.html style.css app.js
git commit -m "feat: RTL app shell with tab navigation"
```

---

### Task 6: List screen — grouped rows, checkboxes, quantity steppers

**Files:**
- Modify: `app.js` (replace `renderList` stub)

**Interfaces:**
- Consumes: `store.sortedCategories`, `store.checkOff`, `store.setQty`, state; DOM ids `#list-container`, `#list-empty`.
- Produces: working list screen; no exports.

- [ ] **Step 1: Implement renderList**

```js
function renderList() {
  const container = document.getElementById('list-container');
  container.textContent = '';
  const byId = new Map(state.items.map(i => [i.id, i]));
  const entries = state.list.map(e => ({ ...e, item: byId.get(e.itemId) }));
  document.getElementById('list-empty').hidden = entries.length > 0;

  for (const cat of store.sortedCategories(state)) {
    const inCat = entries.filter(e => e.item.categoryId === cat.id);
    if (!inCat.length) continue;
    const section = document.createElement('div');
    section.className = 'category';
    const h = document.createElement('h2');
    h.textContent = cat.name;
    section.append(h);
    for (const e of inCat) section.append(listRow(e));
    container.append(section);
  }
}

function listRow(entry) {
  const row = document.createElement('div');
  row.className = 'row';

  const check = document.createElement('input');
  check.type = 'checkbox';
  check.onchange = () => { store.checkOff(state, entry.itemId); save(); render(); };

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = entry.item.name;

  const stepper = document.createElement('div');
  stepper.className = 'stepper';
  const minus = document.createElement('button');
  minus.textContent = '−';
  const qty = document.createElement('input');
  qty.className = 'qty';
  qty.type = 'number';
  qty.min = '1';
  qty.value = entry.qty;
  const plus = document.createElement('button');
  plus.textContent = '+';
  minus.onclick = () => { store.setQty(state, entry.itemId, entry.qty - 1); save(); render(); };
  plus.onclick = () => { store.setQty(state, entry.itemId, entry.qty + 1); save(); render(); };
  qty.onchange = () => { store.setQty(state, entry.itemId, qty.value); save(); render(); };
  stepper.append(minus, qty, plus);

  row.append(check, name, stepper);
  return row;
}
```

- [ ] **Step 2: Verify in browser**

Temporarily seed a list via DevTools console:
`localStorage.clear(); location.reload()` then on the catalog tab nothing is clickable yet (Task 7), so instead run in console:
```js
// dev-only smoke: put two items on the list
const raw = JSON.parse(localStorage.getItem('groceries-v1'));
raw.list = [{ itemId: raw.items[0].id, qty: 2 }, { itemId: raw.items[30].id, qty: 1 }];
localStorage.setItem('groceries-v1', JSON.stringify(raw)); location.reload();
```
Expected: list shows two category groups in aisle order; − / + change the number (never below 1); typing in the number field works; checking a row removes it and the tab counter drops; reload preserves everything.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: list screen — grouped rows with quantity steppers"
```

---

### Task 7: Catalog screen — chips, search, new-item flow

**Files:**
- Modify: `app.js` (replace `renderCatalog` stub, add search handling)

**Interfaces:**
- Consumes: `store.addToList`, `store.removeFromList`, `store.isOnList`, `store.createItem`, `store.sortedCategories`; DOM ids `#catalog-container`, `#search`.
- Produces: module-level `let searchTerm = ''` and `let editMode = false` (editMode consumed by Task 8; chip click must branch on it: `if (editMode) return openItemEditor(item);` — `openItemEditor` is defined in Task 8; until then guard with `if (editMode) return;`).

- [ ] **Step 1: Implement renderCatalog + search**

```js
let searchTerm = '';
let editMode = false;

function renderCatalog() {
  const container = document.getElementById('catalog-container');
  container.textContent = '';
  const term = searchTerm.trim();

  for (const cat of store.sortedCategories(state)) {
    const items = state.items
      .filter(i => i.categoryId === cat.id)
      .filter(i => !term || i.name.includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
    if (!items.length && !editMode) continue;

    const section = document.createElement('div');
    section.className = 'category';
    const h = document.createElement('h2');
    h.textContent = cat.name;
    section.append(h);

    const chips = document.createElement('div');
    chips.className = 'chips';
    for (const item of items) chips.append(chip(item));
    if (term && !state.items.some(i => i.name === term)) {
      chips.append(addNewChip(term, cat.id));
    }
    section.append(chips);
    container.append(section);
  }
}

function chip(item) {
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = item.name;
  b.classList.toggle('on-list', store.isOnList(state, item.id));
  b.onclick = () => {
    if (editMode) return; // Task 8 replaces this line with openItemEditor(item)
    if (store.isOnList(state, item.id)) store.removeFromList(state, item.id);
    else store.addToList(state, item.id);
    save(); render();
  };
  return b;
}

function addNewChip(name, categoryId) {
  const b = document.createElement('button');
  b.className = 'chip add-new';
  b.textContent = `+ ${name}`;
  b.onclick = () => {
    const item = store.createItem(state, name, categoryId);
    store.addToList(state, item.id);
    searchTerm = '';
    document.getElementById('search').value = '';
    save(); render();
  };
  return b;
}

document.getElementById('search').oninput = e => {
  searchTerm = e.target.value;
  renderCatalog();
};
```

- [ ] **Step 2: Verify in browser**

Expected: catalog shows all 11 categories as chip groups; tapping a chip turns it green and the item appears on the list with quantity = last used; tapping again removes it; typing "מלפ" filters live; typing a brand-new name shows a dashed `+ שם` chip under every visible category — tapping the one under the right category creates the item there and adds it to the list; search box clears afterwards.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: catalog screen — chips, live search, new-item flow"
```

---

### Task 8: Edit mode — item editing and category management

**Files:**
- Modify: `app.js` (edit-mode toggle, `openItemEditor`, category management UI)

**Interfaces:**
- Consumes: `store.renameItem`, `store.moveItem`, `store.deleteItem`, `store.addCategory`, `store.renameCategory`, `store.deleteCategory`, `store.moveCategory`; Task 7's `editMode` and `chip()`.
- Produces: while `editMode` is true, tapping a chip opens an editor instead of toggling the list; category headers grow controls; an "+ קטגוריה" button appears.

- [ ] **Step 1: Implement edit mode**

In `chip()`, replace `if (editMode) return;` with `if (editMode) return openItemEditor(item);`. Then add:

```js
document.getElementById('btn-edit-mode').onclick = () => {
  editMode = !editMode;
  document.getElementById('btn-edit-mode').classList.toggle('active', editMode);
  renderCatalog();
};

function openItemEditor(item) {
  const action = prompt(
    `${item.name}\n1 = שינוי שם\n2 = העברת קטגוריה\n3 = מחיקה`, '');
  if (action === '1') {
    const name = prompt('שם חדש:', item.name);
    if (name && name.trim()) store.renameItem(state, item.id, name);
  } else if (action === '2') {
    const target = pickCategory(`להעביר את "${item.name}" אל:`, item.categoryId);
    if (target) store.moveItem(state, item.id, target);
  } else if (action === '3') {
    if (confirm(`למחוק את "${item.name}" לצמיתות?`)) store.deleteItem(state, item.id);
  } else return;
  save(); render();
}

function pickCategory(title, excludeId) {
  const cats = store.sortedCategories(state).filter(c => c.id !== excludeId);
  const menu = cats.map((c, i) => `${i + 1} = ${c.name}`).join('\n');
  const n = parseInt(prompt(`${title}\n${menu}`, ''), 10);
  return cats[n - 1]?.id ?? null;
}
```

- [ ] **Step 2: Add category controls (inside renderCatalog, edit mode only)**

In `renderCatalog`, after building each `h` header, add:

```js
    if (editMode) {
      for (const [label, fn] of [
        ['↑', () => store.moveCategory(state, cat.id, -1)],
        ['↓', () => store.moveCategory(state, cat.id, +1)],
        ['✎', () => {
          const name = prompt('שם קטגוריה:', cat.name);
          if (name && name.trim()) store.renameCategory(state, cat.id, name);
        }],
        ['🗑', () => {
          const target = pickCategory(`למחוק את "${cat.name}". להעביר את הפריטים אל:`, cat.id);
          if (target) store.deleteCategory(state, cat.id, target);
        }],
      ]) {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.className = 'cat-ctl';
        btn.onclick = () => { fn(); save(); render(); };
        h.append(btn);
      }
    }
```

At the end of `renderCatalog` (edit mode only), append an add-category button:

```js
  if (editMode) {
    const add = document.createElement('button');
    add.className = 'chip add-new';
    add.textContent = '+ קטגוריה חדשה';
    add.onclick = () => {
      const name = prompt('שם הקטגוריה החדשה:', '');
      if (name && name.trim()) { store.addCategory(state, name); save(); render(); }
    };
    container.append(add);
  }
```

And add to `style.css`:

```css
.cat-ctl {
  border: 1px solid #cfcfc6; background: #fff; border-radius: 6px;
  font-size: .8rem; margin-inline-start: .35rem; padding: .1rem .4rem;
}
```

- [ ] **Step 3: Verify in browser**

Expected: עריכה toggles green; in edit mode tapping a chip offers rename/move/delete and each works; ↑↓ reorder categories (and the list screen follows the new order); rename and delete-with-move work; "+ קטגוריה חדשה" creates an empty category visible in edit mode; leaving edit mode returns chips to add/remove behavior. Reload preserves all changes.

- [ ] **Step 4: Commit**

```bash
git add app.js style.css
git commit -m "feat: edit mode — item editing and category management"
```

---

### Task 9: Export/import, PWA (manifest, icons, service worker)

**Files:**
- Modify: `app.js` (export/import handlers, SW registration)
- Create: `manifest.json`, `icon.svg`, `icon-180.png`, `icon-512.png`, `sw.js`

**Interfaces:**
- Consumes: `store.load`, `store.serialize`, DOM ids `#btn-export`, `#btn-import`, `#import-file`.
- Produces: installable offline PWA.

- [ ] **Step 1: Export/import handlers (append to app.js)**

```js
document.getElementById('btn-export').onclick = () => {
  const blob = new Blob([store.serialize(state)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'groceries-backup.json';
  a.click();
  URL.revokeObjectURL(a.href);
};

document.getElementById('btn-import').onclick = () =>
  document.getElementById('import-file').click();

document.getElementById('import-file').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  const raw = await file.text();
  const { state: imported, corrupt } = store.load(raw, SEED);
  if (corrupt) { alert('הקובץ אינו גיבוי תקין'); return; }
  if (!confirm('לשחזר מהגיבוי? הנתונים הנוכחיים יוחלפו.')) return;
  state = imported;
  save(); render();
  e.target.value = '';
};
```

- [ ] **Step 2: Create icon.svg and PNGs**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="20" fill="#2e7d32"/>
  <text x="50" y="66" font-size="48" text-anchor="middle" fill="#fff"
    font-family="-apple-system, Arial">✓</text>
</svg>
```

Generate PNGs on macOS:
```bash
qlmanage -t -s 512 -o . icon.svg && mv icon.svg.png icon-512.png
qlmanage -t -s 180 -o . icon.svg && mv icon.svg.png icon-180.png
```
If `qlmanage` produces nothing, fall back to: `sips -s format png -z 512 512 icon.svg --out icon-512.png` (and 180 likewise). Verify both PNGs are non-empty (`ls -la icon-*.png`).

- [ ] **Step 3: Create manifest.json**

```json
{
  "name": "מצרכים",
  "short_name": "מצרכים",
  "dir": "rtl",
  "lang": "he",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#fafaf7",
  "theme_color": "#2e7d32",
  "icons": [
    { "src": "icon-180.png", "sizes": "180x180", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 4: Create sw.js and register it**

```js
// sw.js — cache-first app shell. Bump VERSION on every deploy.
const VERSION = 'v1';
const ASSETS = ['.', 'index.html', 'style.css', 'app.js', 'store.js', 'seed.js',
  'manifest.json', 'icon-180.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request, { ignoreSearch: true })
    .then(hit => hit || fetch(e.request)));
});
```

Append to `app.js`:

```js
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
```

- [ ] **Step 5: Verify**

Run `node --test tests/` — all 13 store tests still PASS.
In the browser: export downloads `groceries-backup.json`; importing it back restores state after the confirm; importing a garbage `.json` shows the error alert and changes nothing. In DevTools → Application: manifest parses, SW active; with DevTools offline checked, reload still works.

- [ ] **Step 6: Commit**

```bash
git add app.js manifest.json icon.svg icon-180.png icon-512.png sw.js
git commit -m "feat: export/import backup and offline PWA support"
```

---

### Task 10: Deploy + phone install (user-assisted)

**Files:** none (operations)

- [ ] **Step 1:** Push the repo to GitHub (user account needed) and enable GitHub Pages on the main branch root — or drag the folder into Netlify Drop. Either yields an HTTPS URL (required for the service worker).
- [ ] **Step 2:** On the phone: open the URL, verify Hebrew RTL rendering and all flows from Tasks 6–9, then Share → Add to Home Screen. Launch from the icon, enable airplane mode, verify the app still opens and works.
- [ ] **Step 3:** Do one real add-items → shop → check-off cycle and note any friction for a follow-up iteration.
