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
  document.getElementById('tab-list-count').textContent = n || '';
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

    const chips = document.createElement('div');
    chips.className = 'chips';
    for (const item of items) chips.append(chip(item));
    if (noExact) {
      chips.append(addNewChip(term, cat.id));
    }
    section.append(chips);
    container.append(section);
  }

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
}

function chip(item) {
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = item.name;
  b.classList.toggle('on-list', store.isOnList(state, item.id));
  b.onclick = () => {
    if (editMode) return openItemEditor(item);
    if (store.isOnList(state, item.id)) store.removeFromList(state, item.id);
    else store.addToList(state, item.id);
    save(); render();
  };
  return b;
}

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

document.getElementById('btn-edit-mode').onclick = () => {
  editMode = !editMode;
  document.getElementById('btn-edit-mode').classList.toggle('active', editMode);
  renderCatalog();
};

document.getElementById('search').oninput = e => {
  searchTerm = e.target.value;
  renderCatalog();
};

document.getElementById('tab-list').onclick = () => showScreen('list');
document.getElementById('tab-catalog').onclick = () => showScreen('catalog');

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
  if (!raw.trim()) { alert('הקובץ אינו גיבוי תקין'); return; }
  const { state: imported, corrupt } = store.load(raw, SEED);
  if (corrupt) { alert('הקובץ אינו גיבוי תקין'); return; }
  if (!confirm('לשחזר מהגיבוי? הנתונים הנוכחיים יוחלפו.')) return;
  state = imported;
  save(); render();
  e.target.value = '';
};

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');

boot();
