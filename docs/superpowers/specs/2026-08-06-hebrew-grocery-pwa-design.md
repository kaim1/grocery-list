# Hebrew Grocery List PWA — Design

**Date:** 2026-08-06
**Status:** Approved pending user review
**Owner:** Kai (solo user)

## Problem

Existing grocery apps either lack Hebrew/RTL support or clutter the experience
(big product tiles, animations, long lists mixing checked/unchecked history).
Kai wants a personal, Hebrew-first list that mirrors how they walk the store.

## Goals

1. Active shopping list grouped by category, in the user's own aisle order.
2. Adding an item is one tap; categorization happens once per item, ever.
3. Purchase history is a compact, browsable catalog — never clutter on the list.
4. Quantities are first-class.
5. Full Hebrew/RTL support throughout.
6. Works offline in the store; zero running cost; no accounts.

## Non-goals (explicitly cut)

- Sharing / multi-device sync (solo user)
- Product images, icons, or animations
- Units (quantity is a plain number)
- Meal planning, recipes, price tracking
- AI/auto-categorization (the pick-once catalog makes it unnecessary)

## Approach

A single-page PWA: plain HTML/CSS/JavaScript, no framework, no build step.
`dir="rtl"` and Hebrew UI text throughout. Data persisted to `localStorage`
as one JSON document, saved on every mutation. A service worker caches the
app shell so it opens instantly with no reception. Hosted as a static page
(GitHub Pages or Netlify) so it can be installed to the home screen; fully
offline afterwards.

## UI — two screens

### 1. הרשימה (active list)

- Plain rows with checkboxes, grouped under category headers.
- Categories appear in user-defined order (matching store aisles).
- Each row: checkbox, item name, and a compact `− n +` quantity stepper.
  Tapping the number opens direct numeric input.
- Tapping the checkbox removes the item from the list (it returns to the
  catalog). The list only ever shows what is still left to buy.
- Empty categories are hidden.

### 2. הקטלוג (catalog)

- Every item ever bought, rendered as compact text chips (name only),
  wrapped several per row, grouped by the same categories.
- Tap a chip → item goes on the list with its remembered quantity
  (default 1). Chip renders highlighted while on the list; tapping a
  highlighted chip removes it from the list.
- Search box on top filters chips live. No match → "הוסף פריט חדש" flow:
  type name, pick category once. Item is remembered forever.
- The catalog remembers each item's last-used quantity.

### Category management

- Rename, add, delete categories; drag to reorder (order drives the list
  and catalog grouping).
- Items can be moved to a different category via an explicit edit mode
  (עריכה toggle in the catalog): while active, tapping a chip opens
  rename / change-category / delete instead of adding to the list.
- Deleting a category prompts to move its items to another category.

## Seed data

Default Hebrew categories: ירקות, פירות, מוצרי חלב, בשר ודגים, מאפים,
קפואים, שימורים ויבשים, ממתקים וחטיפים, משקאות, ניקיון, טואלטיקה.
Pre-seeded with ~100 common items so the catalog is useful on day one.
Seed items are ordinary catalog items — editable and deletable.

## Data model (localStorage, single JSON doc)

```js
{
  version: 1,
  categories: [ { id, name, order } ],
  items: [ { id, name, categoryId, lastQty } ],   // the catalog
  list:  [ { itemId, qty } ]                      // active list entries
}
```

- An item is "on the list" iff an entry with its id exists in `list`.
- Checking off = remove entry from `list` and write `lastQty` back to the item.
- All ids are locally generated (crypto.randomUUID).

## Error handling & data safety

- Persist synchronously to localStorage after every mutation.
- On load: validate the stored doc; if corrupt, keep the raw string under a
  backup key and start from seed rather than crashing.
- Export button downloads the full JSON doc; import restores it (with a
  confirmation prompt before overwriting existing data).

## Testing

- Core state logic (add/remove/check/quantity/category ops, import/export
  round-trip) lives in a pure module with no DOM access, covered by a small
  test file runnable with `node --test`.
- UI verified manually on the phone (RTL rendering, offline behavior,
  home-screen install).

## Architecture / files

```
grocery-list/
  index.html      — markup + screens
  style.css       — RTL-first styles, no animation
  app.js          — UI wiring (render + event handlers)
  store.js        — pure state logic (the tested module)
  seed.js         — default categories + ~100 seed items
  sw.js           — service worker (cache app shell)
  manifest.json   — PWA manifest (Hebrew name, icons)
```
