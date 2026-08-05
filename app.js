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
