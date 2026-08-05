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

let searchTerm = '';
let editMode = false;

function renderCatalog() {
  const container = document.getElementById('catalog-container');
  container.textContent = '';
  const term = searchTerm.trim();
  const noExact = term && !state.items.some(i => i.name === term);

  for (const cat of store.sortedCategories(state)) {
    const items = state.items
      .filter(i => i.categoryId === cat.id)
      .filter(i => !term || i.name.includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
    if (!items.length && !editMode && !noExact) continue;

    const section = document.createElement('div');
    section.className = 'category';
    const h = document.createElement('h2');
    h.textContent = cat.name;
    section.append(h);

    const chips = document.createElement('div');
    chips.className = 'chips';
    for (const item of items) chips.append(chip(item));
    if (noExact) {
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
    if (editMode) return;
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

document.getElementById('tab-list').onclick = () => showScreen('list');
document.getElementById('tab-catalog').onclick = () => showScreen('catalog');
boot();
