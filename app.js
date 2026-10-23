// app.js — UI wiring. All state changes go through store.js, then save().
import * as store from './store.js';
import { SEED } from './seed.js';
import { initializeAccount } from './account.js';

let state;
let account;
let screen = 'list';

function save() {
  try { state = account.save(state); }
  catch (error) { alert(`לא ניתן לשמור: ${error.message}`); }
}

function boot() {
  account = initializeAccount(loaded => { state = loaded; render(); });
}

export function showScreen(name) {
  screen = name;
  for (const s of ['list', 'todos', 'settings']) {
    document.getElementById(`screen-${s}`).hidden = name !== s;
    const tab = document.getElementById(`tab-${s}`);
    tab.classList.toggle('active', name === s);
    tab.setAttribute('aria-current', name === s ? 'page' : 'false');
  }
  for (const pill of document.querySelectorAll('.pill')) pill.hidden = pill.dataset.screen !== name;
  hideToast();
  scrollTo(0, 0);
}

function render() {
  renderList();
  renderTodos();
  if (!document.getElementById('catalog').hidden) renderCatalog();
}

// ---------- shared helpers ----------

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}

function saveAndRender() { save(); render(); }

function section(title, extra) {
  const wrap = el('div', 'category');
  const h = el('h2');
  h.append(el('span', '', title));
  if (extra != null) h.append(el('span', '', String(extra)));
  wrap.append(h);
  return wrap;
}

function checkbox(label, checked, onChange) {
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = checked;
  check.setAttribute('aria-label', label);
  check.onchange = () => onChange(check.checked);
  return check;
}

// ---------- undo toast ----------

let toastTimer;
function showToast(text, undo) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-text').textContent = text;
  const button = document.getElementById('toast-undo');
  button.hidden = !undo;
  button.onclick = () => { hideToast(); undo(); saveAndRender(); };
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 5000);
}

function hideToast() {
  clearTimeout(toastTimer);
  document.getElementById('toast').hidden = true;
}

// ---------- swipe left-to-right to delete ----------

let openSwipe = null;

function closeOpenSwipe() {
  if (!openSwipe) return;
  const wrap = openSwipe;
  openSwipe = null;
  wrap.classList.add('settling');
  wrap.classList.remove('open');
  setTimeout(() => wrap.classList.remove('settling'), 200);
}

function swipeable(row, label, onDelete) {
  const wrap = el('div', 'swipe');
  const under = el('div', 'under');
  const button = el('button', 'delete-button');
  button.append(icon('trash'), label);
  button.onclick = () => { openSwipe = null; onDelete(); };
  under.append(button);
  wrap.append(under, row);

  const OPEN = 96;
  let startX = 0, startY = 0, dx = 0, base = 0, tracking = false, dragging = false;
  row.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (openSwipe && openSwipe !== wrap) closeOpenSwipe();
    startX = e.clientX; startY = e.clientY; dx = 0;
    base = wrap.classList.contains('open') ? OPEN : 0;
    tracking = true; dragging = false;
  });
  row.addEventListener('pointermove', e => {
    if (!tracking) return;
    const mx = e.clientX - startX, my = e.clientY - startY;
    if (!dragging) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { tracking = false; return; }
      if (Math.abs(mx) < 10) return;
      dragging = true;
      row.setPointerCapture(e.pointerId);
      wrap.classList.remove('open');
      wrap.classList.add('moving');
    }
    dx = Math.max(0, base + mx);
    row.style.transform = `translateX(${dx}px)`;
  });
  const end = () => {
    if (!tracking) return;
    tracking = false;
    if (!dragging) return;
    wrap.classList.remove('moving');
    wrap.classList.add('settling');
    setTimeout(() => wrap.classList.remove('settling'), 200);
    if (dx > row.offsetWidth * .55) {
      row.style.transform = `translateX(${row.offsetWidth}px)`;
      openSwipe = null;
      setTimeout(onDelete, 160);
    } else if (dx > OPEN * .6) {
      // Open: the card narrows instead of sliding, so its text stays readable.
      row.style.transform = '';
      wrap.classList.add('open');
      openSwipe = wrap;
    } else {
      row.style.transform = '';
      wrap.classList.remove('open');
      if (openSwipe === wrap) openSwipe = null;
    }
  };
  row.addEventListener('pointerup', end);
  row.addEventListener('pointercancel', end);
  // A drag must not also count as a tap on the row's buttons.
  row.addEventListener('click', e => {
    if (dragging) { e.stopPropagation(); e.preventDefault(); dragging = false; }
    else if (wrap.classList.contains('open')) { e.stopPropagation(); e.preventDefault(); closeOpenSwipe(); }
  }, true);
  return wrap;
}

document.addEventListener('pointerdown', e => {
  if (openSwipe && !openSwipe.contains(e.target)) closeOpenSwipe();
});

// ---------- shopping list ----------

function renderList() {
  const container = document.getElementById('list-container');
  container.textContent = '';
  const byId = new Map(state.items.map(i => [i.id, i]));
  const entries = state.list.map(e => ({ ...e, item: byId.get(e.itemId) }));
  document.getElementById('list-empty').hidden = entries.length > 0;

  for (const cat of store.sortedCategories(state)) {
    const inCat = entries.filter(e => e.item.categoryId === cat.id);
    if (!inCat.length) continue;
    const wrap = section(cat.name);
    for (const e of inCat) wrap.append(listRow(e));
    container.append(wrap);
  }
}

function listRow(entry) {
  const row = el('div', 'row');
  const check = checkbox(`קניתי: ${entry.item.name}`, false, () => {
    store.checkOff(state, entry.itemId); saveAndRender();
  });
  const name = el('button', 'name', entry.item.name);
  name.setAttribute('aria-label', `כמות: ${entry.item.name}`);
  name.onclick = () => openQtySheet(entry.item);
  const qty = el('span', 'qty-label', String(entry.qty));
  row.append(check, name, qty);
  return swipeable(row, 'הסרה', () => removeFromList(entry.item));
}

function removeFromList(item) {
  const index = state.list.findIndex(e => e.itemId === item.id);
  if (index === -1) return;
  const entry = { ...state.list[index] };
  store.removeFromList(state, item.id);
  saveAndRender();
  showToast(`${item.name} הוסר מהרשימה`, () => store.restoreListEntry(state, entry, index));
}

function openQtySheet(item) {
  openSheet(body => {
    const current = () => state.list.find(e => e.itemId === item.id)?.qty || 1;
    const value = el('span', 'qty', String(current()));
    const change = delta => {
      store.setQty(state, item.id, current() + delta);
      value.textContent = String(current());
      saveAndRender();
    };
    const minus = el('button', '', '−');
    minus.setAttribute('aria-label', 'פחות');
    minus.onclick = () => change(-1);
    const plus = el('button', '', '+');
    plus.setAttribute('aria-label', 'יותר');
    plus.onclick = () => change(+1);
    const stepper = el('div', 'stepper');
    stepper.append(minus, value, plus);
    const edit = el('button', 'btn-text', 'עריכת המוצר');
    edit.onclick = () => openItemEditor(item);
    const done = el('button', 'btn-pill', 'סיום');
    done.onclick = closeSheet;
    const footer = el('div', 'sheet-footer');
    footer.append(edit, done);
    body.append(el('div', 'sheet-title', item.name), stepper, footer);
  });
}

// ---------- tasks ----------

const today = () => store.dateKey(new Date());
const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

function dayLabel(key) {
  const t = today();
  if (key === t) return 'היום';
  if (key === store.addDays(t, 1)) return 'מחר';
  if (key === store.addDays(t, -1)) return 'אתמול';
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const sameYear = y === new Date().getFullYear();
  return `${WEEKDAYS[date.getDay()]} ${d}.${m}${sameYear ? '' : `.${String(y).slice(2)}`}`;
}

function whenLabel(when) {
  if (when === 'someday') return 'מתישהו';
  if (!store.DATE.test(when || '')) return 'בכל זמן';
  return when < today() ? `${dayLabel(when)} (עבר)` : dayLabel(when);
}

// Just-checked tasks stay in place for a moment before moving to "הושלמו".
const settling = new Set();

function renderTodos() {
  const container = document.getElementById('todos-container');
  const completed = document.getElementById('todos-completed-container');
  container.replaceChildren();
  completed.replaceChildren();
  const open = state.todos.filter(t => !t.done || settling.has(t.id));
  const done = state.todos.filter(t => t.done && !settling.has(t.id))
    .sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  const groups = store.groupTodos(open, today());
  for (const [key, title] of [['today', 'היום'], ['tomorrow', 'מחר'], ['upcoming', 'בהמשך'], ['anytime', 'בכל זמן']]) {
    if (!groups[key].length) continue;
    const wrap = section(title);
    for (const todo of groups[key]) wrap.append(todoRow(todo, key));
    container.append(wrap);
  }
  if (groups.someday.length) {
    const details = el('details', 'category');
    details.open = somedayOpen;
    details.ontoggle = () => { somedayOpen = details.open; };
    const summary = el('summary');
    const h = el('h2');
    h.append(el('span', '', 'מתישהו'), el('span', '', String(groups.someday.length)));
    summary.append(h);
    details.append(summary);
    for (const todo of groups.someday) details.append(todoRow(todo, 'someday'));
    container.append(details);
  }
  for (const todo of done) completed.append(todoRow(todo, 'done'));
  document.getElementById('todos-empty').hidden = open.length > 0;
  document.getElementById('todos-completed').hidden = done.length === 0;
  document.getElementById('todos-completed-count').textContent = done.length;
}
let somedayOpen = false;

function todoMeta(todo, group) {
  const meta = el('span', 'meta');
  if (group === 'today' && todo.when < today()) {
    meta.classList.add('late');
    meta.textContent = dayLabel(todo.when);
  } else if (group === 'upcoming') {
    meta.textContent = dayLabel(todo.when);
  }
  return meta.textContent ? meta : null;
}

function todoRow(todo, group) {
  const row = el('div', `row todo-row${todo.done ? ' done' : ''}`);
  const check = checkbox(`${todo.done ? 'פתיחה מחדש' : 'סיום'}: ${todo.title}`, todo.done, done => {
    store.setTodoDone(state, todo.id, done);
    if (done) {
      settling.add(todo.id);
      setTimeout(() => { settling.delete(todo.id); renderTodos(); }, 1200);
    }
    saveAndRender();
  });
  const title = el('button', 'name', todo.title);
  title.setAttribute('aria-label', `עריכת משימה: ${todo.title}`);
  title.onclick = () => openTodoEditor(todo);
  row.append(check, title);
  const meta = group === 'done' ? null : todoMeta(todo, group);
  if (meta) row.append(meta);
  return swipeable(row, 'מחיקה', () => deleteTodo(todo));
}

function deleteTodo(todo) {
  const index = state.todos.findIndex(t => t.id === todo.id);
  if (index === -1) return;
  const copy = structuredClone(state.todos[index]);
  store.deleteTodo(state, todo.id);
  saveAndRender();
  showToast('המשימה נמחקה', () => store.restoreTodo(state, copy, index));
}

// "When" choices shared by the composer and the editor.
function resolveWhen(choice) {
  if (choice === 'today') return today();
  if (choice === 'tomorrow') return store.addDays(today(), 1);
  return choice;
}

function whenChoice(when) {
  if (when === today()) return 'today';
  if (when === store.addDays(today(), 1)) return 'tomorrow';
  return store.DATE.test(when || '') ? 'date' : when;
}

function openTodoEditor(todo) {
  const draft = { title: todo.title, when: todo.when || 'anytime' };
  const main = () => openSheet(body => {
    const title = el('input', 'sheet-field');
    title.value = draft.title;
    title.maxLength = 500;
    title.setAttribute('aria-label', 'תוכן המשימה');
    title.oninput = () => { draft.title = title.value; };
    const rows = el('div', 'rows');
    const whenRow = el('button', 'setting');
    whenRow.append(icon('cal'), el('span', '', 'מתי'), el('span', 'value', whenLabel(draft.when)), el('span', 'chev', '‹'));
    whenRow.onclick = () => pickWhen(draft.when, when => { draft.when = when; main(); });
    rows.append(whenRow);
    const del = el('button', 'btn-danger-text', 'מחיקת המשימה');
    del.onclick = () => { closeSheet(); deleteTodo(todo); };
    const saveBtn = el('button', 'btn-pill', 'שמירה');
    saveBtn.onclick = () => {
      store.updateTodo(state, todo.id, { title: draft.title, when: draft.when });
      closeSheet(); saveAndRender();
    };
    const footer = el('div', 'sheet-footer');
    footer.append(del, saveBtn);
    body.append(title, rows, footer);
  });
  main();
}

function pickWhen(current, onPick) {
  openSheet(body => {
    const chips = el('div', 'when-chips');
    const selected = whenChoice(current);
    for (const [choice, label] of [['today', 'היום'], ['tomorrow', 'מחר'], ['anytime', 'בכל זמן'], ['someday', 'מתישהו']]) {
      const b = el('button', `chip${selected === choice ? ' on' : ''}`, label);
      b.onclick = () => onPick(resolveWhen(choice));
      chips.append(b);
    }
    const date = el('label', `chip date-chip${selected === 'date' ? ' on' : ''}`);
    const input = el('input');
    input.type = 'date';
    input.setAttribute('aria-label', 'תאריך');
    if (selected === 'date') input.value = current;
    input.onchange = () => { if (input.value) onPick(input.value); };
    date.append(icon('cal'), el('span', '', selected === 'date' ? dayLabel(current) : 'תאריך'), input);
    chips.append(date);
    body.append(el('div', 'sheet-title', 'מתי?'), chips);
  });
}

// ---------- task composer ----------

const composer = {
  when: 'anytime',
  open() {
    this.when = 'anytime';
    this.render();
    document.getElementById('composer').hidden = false;
    document.getElementById('todo-title').focus();
  },
  close() {
    document.getElementById('composer').hidden = true;
    document.getElementById('todo-title').blur();
  },
  render() {
    const choice = whenChoice(this.when);
    for (const chip of document.querySelectorAll('#composer-when .chip')) {
      chip.classList.toggle('soft-on', chip.dataset.when === choice);
    }
    document.getElementById('composer-date-label').textContent = choice === 'date' ? dayLabel(this.when) : 'תאריך';
  },
  submit() {
    const input = document.getElementById('todo-title');
    if (!store.addTodo(state, input.value, { when: this.when })) return;
    input.value = '';
    this.when = 'anytime';
    this.render();
    saveAndRender();
  },
};

for (const chip of document.querySelectorAll('#composer-when button.chip')) {
  // Keep the keyboard open while choosing.
  chip.addEventListener('pointerdown', e => e.preventDefault());
  chip.onclick = () => {
    const when = resolveWhen(chip.dataset.when);
    composer.when = composer.when === when ? 'anytime' : when;
    composer.render();
  };
}
document.getElementById('composer-date').onchange = e => {
  if (e.target.value) composer.when = e.target.value;
  composer.render();
  document.getElementById('todo-title').focus();
};
document.querySelector('#composer-form .addbtn').addEventListener('pointerdown', e => e.preventDefault());
document.getElementById('composer-form').onsubmit = e => { e.preventDefault(); composer.submit(); };
document.getElementById('composer-dim').onclick = () => composer.close();
document.getElementById('btn-new-todo').onclick = () => composer.open();

// ---------- catalog: the add/search screen ----------

let searchTerm = '';
let editMode = false;

function openCatalog(edit = false) {
  editMode = edit;
  searchTerm = '';
  const search = document.getElementById('search');
  search.value = '';
  document.getElementById('catalog-title').hidden = !edit;
  document.querySelector('.search-field').hidden = edit;
  document.getElementById('catalog').hidden = false;
  document.body.style.overflow = 'hidden';
  renderCatalog();
  if (!edit) search.focus();
}

function closeCatalog() {
  document.getElementById('catalog').hidden = true;
  document.body.style.overflow = '';
  editMode = false;
  render();
}

function toggleOnList(item) {
  if (store.isOnList(state, item.id)) store.removeFromList(state, item.id);
  else store.addToList(state, item.id);
  saveAndRender();
}

function renderCatalog() {
  const container = document.getElementById('catalog-container');
  container.textContent = '';
  const term = searchTerm.trim();
  const categories = store.sortedCategories(state);
  const catName = new Map(categories.map(c => [c.id, c.name]));

  if (term && !editMode) {
    const results = el('div', 'results');
    const matches = state.items
      .filter(i => i.name.includes(term))
      .sort((a, b) => (b.name.startsWith(term) - a.name.startsWith(term)) || a.name.localeCompare(b.name, 'he'));
    for (const item of matches) {
      const entry = state.list.find(e => e.itemId === item.id);
      const b = el('button', `result${entry ? ' in' : ''}`);
      b.append(el('span', '', item.name),
        el('span', 'tag', entry ? `ברשימה · ${entry.qty}` : catName.get(item.categoryId) || ''));
      const act = el('span', 'act');
      act.append(icon(entry ? 'tick' : 'plus'));
      b.append(act);
      b.onclick = () => toggleOnList(item);
      results.append(b);
    }
    if (!state.items.some(i => i.name === term)) {
      const add = el('button', 'result create');
      add.append(icon('plus'), `הוספת ״${term}״ כמוצר חדש`);
      add.onclick = () => openAddItemSheet(term);
      results.append(add);
    }
    container.append(results);
    return;
  }

  for (const cat of categories) {
    const items = state.items
      .filter(i => i.categoryId === cat.id)
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
    if (!items.length && !editMode) continue;
    const wrap = section(cat.name);
    if (editMode) {
      const h = wrap.querySelector('h2');
      const controls = el('span', 'sheet-actions');
      for (const [label, aria, fn] of [
        ['↑', 'הזזה למעלה', () => { store.moveCategory(state, cat.id, -1); saveAndRender(); }],
        ['↓', 'הזזה למטה', () => { store.moveCategory(state, cat.id, +1); saveAndRender(); }],
        ['✎', 'עריכת הקטגוריה', () => openCategoryEditor(cat)],
      ]) {
        const btn = el('button', 'cat-ctl', label);
        btn.setAttribute('aria-label', aria);
        btn.onclick = fn;
        controls.append(btn);
      }
      h.append(controls);
    }
    const chips = el('div', 'chips');
    for (const item of items) {
      const b = el('button', 'chip', item.name);
      b.classList.toggle('on-list', !editMode && store.isOnList(state, item.id));
      b.onclick = () => (editMode ? openItemEditor(item) : toggleOnList(item));
      chips.append(b);
    }
    wrap.append(chips);
    container.append(wrap);
  }

  if (editMode) {
    const add = el('button', 'chip add-new', '+ קטגוריה חדשה');
    add.style.marginTop = '1.4rem';
    add.onclick = openAddCategory;
    container.append(add);
  }
}

// ---------- sheets ----------

function openSheet(build) {
  const body = document.getElementById('sheet-body');
  body.textContent = '';
  build(body);
  const sheet = document.getElementById('sheet');
  if (!sheet.open) {
    sheet.showModal();
    // Don't pop the keyboard just because a sheet opened.
    if (document.activeElement?.matches('input')) document.activeElement.blur();
  }
}

function closeSheet() { document.getElementById('sheet').close(); }

function catPicker(selectedId, onPick, excludeId) {
  const wrap = el('div', 'sheet-cats');
  for (const c of store.sortedCategories(state)) {
    if (c.id === excludeId) continue;
    const b = el('button', 'cat-pick', c.name);
    b.classList.toggle('selected', c.id === selectedId);
    b.onclick = () => {
      for (const x of wrap.children) x.classList.remove('selected');
      b.classList.add('selected');
      onPick(c.id);
    };
    wrap.append(b);
  }
  return wrap;
}

function openItemEditor(item) {
  openSheet(body => {
    let chosenCat = item.categoryId;
    const name = el('input', 'sheet-field');
    name.value = item.name;
    const saveBtn = el('button', 'btn-pill', 'שמירה');
    saveBtn.onclick = () => {
      if (name.value.trim()) store.renameItem(state, item.id, name.value);
      store.moveItem(state, item.id, chosenCat);
      closeSheet(); saveAndRender();
    };
    const del = el('button', 'btn-danger-text', 'מחיקה מהקטלוג');
    del.onclick = () => {
      if (!del.classList.contains('arm')) {
        del.classList.add('arm');
        del.textContent = 'נגיעה נוספת מוחקת לצמיתות';
        return;
      }
      store.deleteItem(state, item.id);
      closeSheet(); saveAndRender();
    };
    const footer = el('div', 'sheet-footer');
    footer.append(del, saveBtn);
    body.append(
      el('div', 'sheet-label', 'שם'),
      name,
      el('div', 'sheet-label', 'קטגוריה'),
      catPicker(chosenCat, id => { chosenCat = id; }),
      footer,
    );
  });
}

function openCategoryEditor(cat) {
  openSheet(body => {
    const name = el('input', 'sheet-field');
    name.value = cat.name;
    const saveBtn = el('button', 'btn-pill', 'שמירה');
    saveBtn.onclick = () => {
      if (name.value.trim()) store.renameCategory(state, cat.id, name.value);
      closeSheet(); saveAndRender();
    };
    const del = el('button', 'btn-danger-text', 'מחיקת הקטגוריה');
    const delArea = el('div');
    del.onclick = () => {
      if (state.categories.length < 2) return;
      delArea.textContent = '';
      delArea.append(el('div', 'sheet-label', 'להעביר את המוצרים אל:'));
      delArea.append(catPicker(null, targetId => {
        store.deleteCategory(state, cat.id, targetId);
        closeSheet(); saveAndRender();
      }, cat.id));
    };
    const footer = el('div', 'sheet-footer');
    footer.append(del, saveBtn);
    body.append(el('div', 'sheet-label', 'שם הקטגוריה'), name, footer, delArea);
  });
}

function openAddCategory() {
  openSheet(body => {
    const name = el('input', 'sheet-field');
    name.placeholder = 'שם הקטגוריה';
    const saveBtn = el('button', 'btn-pill', 'הוספה');
    saveBtn.onclick = () => {
      if (name.value.trim()) { store.addCategory(state, name.value); saveAndRender(); }
      closeSheet();
    };
    const footer = el('div', 'sheet-footer');
    footer.append(el('span'), saveBtn);
    body.append(el('div', 'sheet-title', 'קטגוריה חדשה'), name, footer);
  });
}

function openAddItemSheet(initialName) {
  openSheet(body => {
    let chosenCat = null;
    const name = el('input', 'sheet-field');
    name.value = initialName;
    const saveBtn = el('button', 'btn-pill', 'הוספה לרשימה');
    saveBtn.disabled = true;
    saveBtn.onclick = () => {
      if (!name.value.trim() || !chosenCat) return;
      const item = store.createItem(state, name.value, chosenCat);
      store.addToList(state, item.id);
      searchTerm = '';
      document.getElementById('search').value = '';
      closeSheet(); saveAndRender();
    };
    const footer = el('div', 'sheet-footer');
    footer.append(el('span'), saveBtn);
    body.append(
      el('div', 'sheet-title', 'מוצר חדש'),
      name,
      el('div', 'sheet-label', 'לאיזו קטגוריה?'),
      catPicker(null, id => { chosenCat = id; saveBtn.disabled = false; }),
      footer,
    );
  });
}

// Close a sheet by tapping outside it or dragging it down.
const sheet = document.getElementById('sheet');
sheet.onclick = e => { if (e.target === sheet) closeSheet(); };
{
  let startY = null;
  sheet.addEventListener('touchstart', e => {
    startY = sheet.scrollTop <= 0 && !e.target.closest('input, textarea, .wheel') ? e.touches[0].clientY : null;
  }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (startY == null) return;
    const dy = Math.max(0, e.touches[0].clientY - startY);
    sheet.style.transform = dy ? `translateY(${dy}px)` : '';
  }, { passive: true });
  sheet.addEventListener('touchend', e => {
    if (startY == null) return;
    const dy = e.changedTouches[0].clientY - startY;
    sheet.style.transform = '';
    startY = null;
    if (dy > 90) closeSheet();
  });
}

// ---------- keyboard: keep the floating field above it ----------

if (window.visualViewport) {
  const vv = window.visualViewport;
  const update = () => {
    const keyboard = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--keyboard', `${keyboard > 80 ? keyboard : 0}px`);
    document.body.classList.toggle('keyboard', keyboard > 80);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
}

// ---------- wiring ----------

document.getElementById('search').oninput = e => {
  searchTerm = e.target.value;
  renderCatalog();
};
document.getElementById('btn-catalog-done').onclick = closeCatalog;
document.getElementById('btn-add').onclick = () => openCatalog(false);
document.getElementById('btn-edit-catalog').onclick = () => openCatalog(true);

document.getElementById('tab-list').onclick = () => showScreen('list');
document.getElementById('tab-todos').onclick = () => showScreen('todos');
document.getElementById('tab-settings').onclick = () => showScreen('settings');


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
  e.target.value = '';
  if (!raw.trim()) { alert('הקובץ אינו גיבוי תקין'); return; }
  const { state: imported, corrupt } = store.load(raw, SEED);
  if (corrupt) { alert('הקובץ אינו גיבוי תקין'); return; }
  if (!confirm('לשחזר מהגיבוי? הנתונים הנוכחיים יוחלפו.')) return;
  state = imported;
  save(); render();
};

// Dates move on overnight: refresh the sections when the app comes back.
document.addEventListener('visibilitychange', () => { if (!document.hidden && state) render(); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');

showScreen('list');
boot();
