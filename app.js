// app.js — UI wiring. All state changes go through store.js, then save().
import * as store from './store.js';
import { SEED } from './seed.js';
import { initializeAccount } from './account.js';
import * as reminders from './reminders.js';
import { parseWhen, stripWhen } from './nlp-dates.js';
import * as repeat from './repeat.js';

let state;
let account;
let screen = 'todos';
// From this width the tabs become a sidebar, tasks split into views and edits open beside the list.
const wide = matchMedia('(min-width: 760px)');
const isDesk = () => wide.matches;
let taskView = 'today';
let selectedId = null;

function save() {
  try { state = account.save(state); }
  catch (error) { alert(`לא ניתן לשמור: ${error.message}`); }
}

function boot() {
  account = initializeAccount(loaded => { state = loaded; render(); });
  renderSettings();
  reminders.syncSubscription(account).catch(() => {}).finally(renderSettings);
  const fromNotification = new URLSearchParams(location.search).get('todo');
  if (fromNotification) {
    history.replaceState(null, '', location.pathname);
    openTodoById(fromNotification);
  }
}

export function showScreen(name) {
  screen = name;
  for (const s of ['todos', 'list', 'projects', 'settings']) {
    document.getElementById(`screen-${s}`).hidden = name !== s;
    const tab = document.getElementById(`tab-${s}`);
    tab.classList.toggle('active', name === s);
    tab.setAttribute('aria-current', name === s ? 'page' : 'false');
  }
  for (const pill of document.querySelectorAll('.pill')) pill.hidden = pill.dataset.screen !== name;
  if (isDesk()) {
    if (name !== 'list' && !document.getElementById('catalog').hidden) closeCatalog();
    closePane();
  }
  document.body.classList.toggle('board-on', isDesk() && name === 'todos' && taskView === 'board');
  picked.clear();
  syncPicked();
  renderSidebar();
  hideToast();
  scrollTo(0, 0);
  updateMiniHead();
}

function render() {
  renderList();
  renderTodos();
  renderProjects();
  if (!document.getElementById('catalog').hidden) renderCatalog();
  renderSidebar();
  refreshPane();
  syncPicked();
  updateMiniHead();
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
function showToast(text, undo, sub = '') {
  const toast = document.getElementById('toast');
  document.getElementById('toast-text').textContent = text;
  document.getElementById('toast-sub').textContent = sub;
  document.getElementById('toast-sub').hidden = !sub;
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
    if (e.pointerType === 'mouse' && (e.button !== 0 || isDesk())) return;
    if (selecting()) return;
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
  const left = entries.filter(e => !e.bought).length;
  document.getElementById('list-empty').hidden = entries.length > 0;
  document.getElementById('list-sub').textContent = left ? count(left, 'מוצר אחד לקנות', 'מוצרים לקנות') : '';

  for (const cat of store.sortedCategories(state)) {
    const inCat = entries.filter(e => e.item.categoryId === cat.id);
    if (!inCat.length) continue;
    const wrap = section(cat.name);
    const chips = el('div', 'chips');
    for (const e of inCat) chips.append(listChip(e));
    wrap.append(chips);
    container.append(wrap);
  }

  const bought = entries.length - left;
  if (bought) {
    const line = el('div', 'cart-line');
    const clear = el('button', 'link-button', 'ניקוי מהרשימה');
    clear.onclick = clearBought;
    line.append(el('span', '', count(bought, 'מוצר אחד בעגלה', 'מוצרים בעגלה')), clear);
    container.append(line);
  }
}

// Tap marks the item as bought (it stays in place); a long press or right-click opens its quantity.
function listChip(entry) {
  const chip = el('button', 'chip list-chip');
  chip.classList.toggle('bought', !!entry.bought);
  chip.setAttribute('aria-pressed', String(!!entry.bought));
  chip.setAttribute('aria-label', `${entry.item.name}${entry.qty > 1 ? `, ${entry.qty}` : ''}`);
  if (entry.bought) chip.append(icon('tick'));
  if (entry.qty > 1) chip.append(el('span', 'qty-badge', String(entry.qty)));
  chip.append(el('span', 'chip-name', entry.item.name));
  chip.onclick = () => { store.toggleBought(state, entry.itemId); saveAndRender(); };
  onLongPress(chip, () => openQtySheet(entry.item));
  return chip;
}

function onLongPress(node, fn) {
  let timer, fired = false, x0 = 0, y0 = 0;
  const cancel = () => clearTimeout(timer);
  node.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    fired = false; x0 = e.clientX; y0 = e.clientY;
    timer = setTimeout(() => { fired = true; navigator.vibrate?.(10); fn(); }, 450);
  });
  node.addEventListener('pointermove', e => { if (Math.hypot(e.clientX - x0, e.clientY - y0) > 10) cancel(); });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) node.addEventListener(type, cancel);
  // The click that ends a long press must not also toggle the chip.
  node.addEventListener('click', e => {
    if (fired) { e.stopImmediatePropagation(); e.preventDefault(); fired = false; }
  }, true);
  node.addEventListener('contextmenu', e => {
    e.preventDefault();
    cancel();
    if (!fired) { fired = true; fn(); }
  });
}

function clearBought() {
  const removed = store.clearBought(state);
  if (!removed.length) return;
  saveAndRender();
  showToast(count(removed.length, 'מוצר אחד הוסר', 'מוצרים הוסרו'), () => store.restoreBought(state, removed));
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
    const remove = el('button', 'btn-danger-text', 'הסרה מהרשימה');
    remove.onclick = () => { closeSheet(); removeFromList(item); };
    const footer = el('div', 'sheet-footer');
    footer.append(edit, done);
    body.append(el('div', 'sheet-title', item.name), stepper, footer, remove);
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
  if (!store.DATE.test(when || '')) return 'מתישהו';
  return when < today() ? `${dayLabel(when)} (עבר)` : dayLabel(when);
}

// Just-checked tasks stay in place for a moment before moving to "הושלמו".
const settling = new Set();

const count = (n, one, many) => n === 1 ? one : `${n} ${many}`;

// The compact title bar that fades in once the screen's large title scrolls under it.
function updateMiniHead() {
  const title = document.querySelector('.screen:not([hidden]) :is(.page-title, .project-title)');
  const mini = document.getElementById('mini-head');
  const head = title?.closest('[hidden]') ? null : title;
  mini.textContent = head ? head.textContent : '';
  mini.classList.toggle('show', !!head && head.getBoundingClientRect().bottom < mini.offsetHeight);
}
addEventListener('scroll', updateMiniHead, { passive: true });

const VIEWS = { today: 'היום', tomorrow: 'מחר', week: 'השבוע', month: 'החודש', later: 'בהמשך', someday: 'מתישהו' };
// The tasks screen lists only tasks outside projects; a project's tasks live on its own page.
const looseTodos = () => state.todos.filter(t => !t.projectId);
const VIEW_EMPTY = { today: 'אין משימות להיום', tomorrow: 'אין משימות למחר', week: 'אין עוד משימות השבוע',
  month: 'אין עוד משימות החודש', later: 'אין משימות אחרי החודש', someday: 'אין משימות בלי תאריך' };
const longToday = () => new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });

function renderTodos() {
  const view = isDesk() ? taskView : null;
  document.body.classList.toggle('board-on', view === 'board');
  document.querySelector('#screen-todos .page-title').textContent = view === 'board' ? 'לוח' : view ? VIEWS[view] : 'משימות';
  if (view === 'board') return renderBoard();
  document.querySelector('#todos-completed summary span').textContent = view ? 'הושלמו היום' : 'הושלמו';
  if (view) return renderTaskView(view);
  document.getElementById('todos-empty').textContent = 'אין משימות פתוחות';
  document.getElementById('todos-sub').textContent = longToday();
  const done = renderTaskGroups(
    document.getElementById('todos-container'),
    document.getElementById('todos-completed-container'),
    looseTodos(), { showProject: true });
  document.getElementById('todos-empty').hidden = looseTodos().some(t => !t.done || settling.has(t.id));
  document.getElementById('todos-completed').hidden = done === 0;
  document.getElementById('todos-completed-count').textContent = done;
}

// On the desktop each view lists one kind of "when"; השבוע has a section per day.
function renderTaskView(view) {
  const container = document.getElementById('todos-container');
  const completedContainer = document.getElementById('todos-completed-container');
  container.replaceChildren();
  completedContainer.replaceChildren();
  const shown = renderViewTodos(container, looseTodos(), view, { showProject: true });
  document.getElementById('todos-sub').textContent = view === 'today' ? longToday()
    : shown ? count(shown, 'משימה אחת', 'משימות') : '';
  const empty = document.getElementById('todos-empty');
  empty.textContent = VIEW_EMPTY[view];
  empty.hidden = shown > 0;
  // Only היום lists finished tasks, and only those finished today.
  const done = view === 'today' ? looseTodos().filter(t => t.done && !settling.has(t.id) && t.doneAt && store.dateKey(new Date(t.doneAt)) === today())
    .sort((a, b) => b.doneAt.localeCompare(a.doneAt)) : [];
  for (const todo of done) completedContainer.append(todoRow(todo, 'done', { showProject: true }));
  document.getElementById('todos-completed').hidden = done.length === 0;
  document.getElementById('todos-completed-count').textContent = done.length;
}

// The board: every view side by side, one column each. Dropping a task on a column moves it there.
function renderBoard() {
  const container = document.getElementById('todos-container');
  document.getElementById('todos-completed-container').replaceChildren();
  document.getElementById('todos-completed').hidden = true;
  document.getElementById('todos-empty').hidden = true;
  const board = el('div', 'board');
  let total = 0;
  for (const [view, label] of Object.entries(VIEWS)) {
    // Near a week's or month's end a range can hold no days (no החודש on 31.10), so it gets no column.
    if (!store.groupTodos([{ when: viewFirstDay(view) }], today())[view].length) continue;
    const col = el('div', `board-col board-${view}`);
    const body = el('div', 'board-body');
    const shown = renderViewTodos(body, looseTodos(), view, { showProject: true });
    total += shown;
    const head = el('div', 'board-head');
    head.append(el('span', '', label), el('span', 'n', shown ? String(shown) : ''));
    const add = el('button', 'board-add', '+ משימה');
    add.onclick = () => composer.open(null, viewFirstDay(view));
    body.append(add);
    col.append(head, body);
    dropTarget(col, todo => ({ when: viewWhenFor(view, todo) }), todo => store.groupTodos([todo], today())[view].length > 0);
    board.append(col);
  }
  container.replaceChildren(board);
  document.getElementById('todos-sub').textContent = total ? count(total, 'משימה אחת', 'משימות') : 'אין משימות פתוחות';
}

// Appends the open tasks of one desktop view to `container` and returns how many there were.
function renderViewTodos(container, todos, view, options) {
  const groups = store.groupTodos(todos.filter(t => !t.done || settling.has(t.id)), today());
  let shown = 0;
  const add = (title, todos, group) => {
    if (!todos.length) return;
    const wrap = title ? section(title) : el('div', 'category');
    for (const todo of todos) wrap.append(todoRow(todo, group, options));
    container.append(wrap);
    shown += todos.length;
  };
  if (view === 'week') {
    const byDay = new Map();
    for (const todo of groups.week) byDay.set(todo.when, [...byDay.get(todo.when) || [], todo]);
    for (const [key, todos] of [...byDay].sort(([a], [b]) => a.localeCompare(b))) add(fullDayLabel(key), todos, 'day');
  } else {
    add(null, groups[view], view);
  }
  return shown;
}

// "מחר", or "יום שלישי · 27.10".
function fullDayLabel(key) {
  if (key === store.addDays(today(), 1)) return 'מחר';
  const [y, m, d] = key.split('-').map(Number);
  return `יום ${FULL_DAYS[new Date(y, m - 1, d).getDay()]} · ${d}.${m}`;
}

// Renders open tasks by section into `container` and completed ones into `completedContainer`.
function renderTaskGroups(container, completedContainer, todos, options) {
  container.replaceChildren();
  completedContainer.replaceChildren();
  const open = todos.filter(t => !t.done || settling.has(t.id));
  const done = todos.filter(t => t.done && !settling.has(t.id))
    .sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  const groups = store.groupTodos(open, today());
  for (const [key, title] of Object.entries(VIEWS)) {
    if (!groups[key].length) continue;
    let wrap;
    if (key in groupOpen) {
      wrap = el('details', 'category');
      wrap.open = groupOpen[key];
      wrap.ontoggle = () => { groupOpen[key] = wrap.open; };
      const summary = el('summary');
      const h = el('h2');
      h.append(el('span', '', title), el('span', '', String(groups[key].length)));
      summary.append(h);
      wrap.append(summary);
    } else {
      wrap = section(title);
    }
    for (const todo of groups[key]) wrap.append(todoRow(todo, key, options));
    container.append(wrap);
  }
  for (const todo of done) completedContainer.append(todoRow(todo, 'done', options));
  return done.length;
}
// Which collapsible sections are open. היום and מחר always show.
const groupOpen = { week: true, month: true, later: true, someday: true };

const upcomingReminder = todo => !todo.done && todo.remindAt && new Date(todo.remindAt) > new Date();

// Grey details on the left of a row. With a project shown, a reminder is just a bell so the row fits.
function todoMeta(todo, group, withProject) {
  const meta = el('span', 'meta');
  if (group === 'today' && todo.when < today()) {
    meta.classList.add('late');
    meta.textContent = dayLabel(todo.when);
  } else if (['week', 'month', 'later'].includes(group)) {
    meta.textContent = dayLabel(todo.when);
  }
  if (upcomingReminder(todo)) {
    const remind = new Date(todo.remindAt);
    if (!withProject && !meta.textContent) {
      const day = store.dateKey(remind);
      const sameDay = day === todo.when || (day === today() && group === 'today');
      meta.textContent = sameDay ? reminders.hhmm(remind) : `${dayLabel(day)} ${reminders.hhmm(remind)}`;
    }
    meta.append(icon('bell'));
    meta.setAttribute('aria-label', `תזכורת ${dayLabel(store.dateKey(remind))} ב-${reminders.hhmm(remind)}`);
  }
  if (todo.notes) {
    const note = icon('note');
    note.classList.add('rep');
    meta.prepend(note);
  }
  if (todo.repeat && !todo.done) {
    const rep = icon('rep');
    rep.classList.add('rep');
    meta.prepend(rep);
  }
  return meta.childNodes.length ? meta : null;
}

function projectName(id) {
  return state.projects.find(p => p.id === id)?.name || null;
}

function todoRow(todo, group, options = {}) {
  const row = el('div', `row todo-row${todo.done ? ' done' : ''}${isDesk() && todo.id === selectedId ? ' sel' : ''}${picked.has(todo.id) ? ' picked' : ''}`);
  row.dataset.id = todo.id;
  if (isDesk()) {
    row.draggable = true;
    row.ondragstart = e => { e.dataTransfer.setData('text/x-todo', todo.id); e.dataTransfer.effectAllowed = 'move'; };
    row.oncontextmenu = e => { e.preventDefault(); openContextMenu(todo, row, e.clientX, e.clientY); };
  } else if (!todo.done) {
    onLongPress(row, () => togglePick(todo.id));
  }
  // While picking, a tap on the phone (or ⌘/Shift-click on the desktop) picks the row instead of opening or checking it.
  row.addEventListener('click', e => {
    const desk = isDesk();
    const multi = desk && (e.metaKey || e.ctrlKey || e.shiftKey);
    if (todo.done || !(multi || (!desk && selecting()))) {
      if (desk && selecting()) clearPicked();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (desk && e.shiftKey) pickRange(todo.id);
    else togglePick(todo.id);
  }, true);
  const check = checkbox(`${todo.done ? 'פתיחה מחדש' : 'סיום'}: ${todo.title}`, todo.done, done => {
    const next = store.setTodoDone(state, todo.id, done);
    if (done) {
      settling.add(todo.id);
      setTimeout(() => { settling.delete(todo.id); render(); }, 1200);
    }
    saveAndRender();
    if (next) {
      const time = next.remindAt ? `, ${reminders.hhmm(new Date(next.remindAt))}` : '';
      showToast(`הבאה נוספה ${toDay(next.when)}`, () => store.setTodoDone(state, todo.id, false), `${next.title}${time}`);
    }
  });
  const title = el('button', 'name', todo.title);
  title.setAttribute('aria-label', `עריכת משימה: ${todo.title}`);
  title.onclick = () => openTodoEditor(todo);
  row.append(check, title);
  const project = options.showProject && projectName(todo.projectId);
  if (project) row.append(el('span', 'proj', project));
  const meta = group === 'done' ? null : todoMeta(todo, group, Boolean(project));
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

function openTodoEditor(todo, refresh = false) {
  const desk = isDesk();
  const draft = { title: todo.title, notes: todo.notes || '', when: todo.when || 'anytime', projectId: todo.projectId || null,
    remindAt: todo.remindAt || null, repeat: todo.repeat || null };
  // Every change is saved as it happens; there is no save button.
  const update = fields => {
    Object.assign(draft, fields);
    store.updateTodo(state, todo.id, { ...fields });
    saveAndRender();
  };
  let titleTimer, notesTimer;
  const commitTitle = () => {
    clearTimeout(titleTimer);
    const current = state.todos.find(t => t.id === todo.id);
    if (!current || !draft.title.trim() || draft.title.trim() === current.title) return;
    store.updateTodo(state, todo.id, { title: draft.title });
    saveAndRender();
  };
  const commitNotes = () => {
    clearTimeout(notesTimer);
    const current = state.todos.find(t => t.id === todo.id);
    if (!current || draft.notes.trim() === (current.notes || '').trim()) return;
    store.updateTodo(state, todo.id, { notes: draft.notes });
    saveAndRender();
  };
  const commit = () => { commitTitle(); commitNotes(); };
  const main = () => {
    const build = body => {
      if (desk) {
        const top = el('div', 'pane-top');
        const close = el('button', 'pane-close', '✕');
        close.setAttribute('aria-label', 'סגירת הפרטים');
        close.onclick = closePane;
        top.append(el('span', '', 'נשמר אוטומטית'), close);
        body.append(top);
      }
      const title = el(desk ? 'textarea' : 'input', desk ? 'pane-title' : 'sheet-field');
      title.value = draft.title;
      title.maxLength = 500;
      title.setAttribute('aria-label', 'תוכן המשימה');
      if (desk) {
        title.rows = 1;
        title.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } };
      }
      title.oninput = () => {
        draft.title = title.value;
        if (desk) grow(title);
        clearTimeout(titleTimer);
        titleTimer = setTimeout(commitTitle, 600);
      };
      title.onchange = commitTitle;
      const notes = el('textarea', 'notes-field');
      notes.value = draft.notes;
      notes.placeholder = 'הערות';
      notes.rows = 2;
      notes.maxLength = 5000;
      notes.setAttribute('aria-label', 'הערות');
      notes.oninput = () => {
        draft.notes = notes.value;
        grow(notes);
        clearTimeout(notesTimer);
        notesTimer = setTimeout(commitNotes, 600);
      };
      notes.onchange = commitNotes;
      const rows = el('div', 'rows');
      const whenRow = el('button', 'setting');
      whenRow.append(icon('cal'), el('span', '', 'מתי'), el('span', 'value', whenLabel(draft.when)), el('span', 'chev', '‹'));
      whenRow.onclick = () => pickWhen(draft.when, when => { update({ when }); main(); });
      const projectRow = el('button', 'setting');
      projectRow.append(icon('folder'), el('span', '', 'פרויקט'),
        el('span', 'value', projectName(draft.projectId) || 'ללא'), el('span', 'chev', '‹'));
      projectRow.onclick = () => pickProject(draft.projectId, projectId => { update({ projectId }); main(); });
      const timeRow = el('button', 'setting');
      const time = reminderLabel(draft.remindAt);
      timeRow.append(icon('clock'), el('span', '', 'שעה'),
        el('span', `value${time ? ' accent' : ''}`, time ? `${time} · תזכורת` : 'ללא'), el('span', 'chev', '‹'));
      timeRow.onclick = () => pickReminder(draft.remindAt, remindAt => {
        update(remindAt ? { remindAt, when: store.dateKey(new Date(remindAt)) } : { remindAt });
        afterReminderChosen(remindAt, main);
      });
      const repeatRow = el('button', 'setting');
      repeatRow.append(icon('rep'), el('span', '', 'חוזר'),
        el('span', `value${draft.repeat ? ' accent' : ''}`, draft.repeat ? repeat.describe(draft.repeat, repeatBase(draft.when)) : 'ללא'),
        el('span', 'chev', '‹'));
      repeatRow.onclick = () => pickRepeat(draft.repeat, repeatBase(draft.when), rule => {
        // A repeating task needs a date; without one it starts today or on its first day.
        update(rule && !store.DATE.test(draft.when) ? { repeat: rule, when: repeat.firstDate(rule, today()) } : { repeat: rule });
        main();
      });
      rows.append(whenRow, timeRow, repeatRow, projectRow);
      const del = el('button', 'btn-danger-text', 'מחיקת המשימה');
      del.onclick = () => { commit(); desk ? closePane() : closeSheet(); deleteTodo(todo); };
      const footer = el('div', 'sheet-footer');
      if (draft.repeat) {
        const skip = el('button', 'btn-text', 'דילוג לפעם הבאה');
        skip.onclick = () => {
          commit();
          store.skipTodo(state, todo.id);
          if (!desk) closeSheet();
          saveAndRender();
          const moved = state.todos.find(t => t.id === todo.id);
          if (moved) showToast(`הועברה ${toDay(moved.when)}`);
        };
        footer.append(skip);
      }
      footer.append(del);
      body.append(title, notes, rows, footer);
      requestAnimationFrame(() => { grow(notes); if (desk) grow(title); });
    };
    if (!desk) return openSheet(build);
    if (!refresh && document.getElementById('sheet').open) closeSheet();
    showPane(todo.id, build, { flush: commit, cancel: () => { clearTimeout(titleTimer); clearTimeout(notesTimer); } });
    refresh = false;
  };
  main();
  if (!desk) beforeSheetCloses = commit;
}

// A textarea as tall as its text.
function grow(area) {
  area.style.height = 'auto';
  area.style.height = `${area.scrollHeight}px`;
}

// ---------- desktop: details pane ----------

let paneTodoId = null;
let paneHooks = null;

function showPane(todoId, build, hooks) {
  const pane = document.getElementById('pane');
  paneHooks?.cancel();
  paneHooks = hooks;
  paneTodoId = selectedId = todoId;
  if (!document.getElementById('catalog').hidden) closeCatalog();
  pane.replaceChildren();
  build(pane);
  pane.hidden = false;
  document.body.classList.add('pane-open');
  markSelected();
}

function closePane() {
  const pane = document.getElementById('pane');
  if (pane.hidden) return;
  const hooks = paneHooks;
  paneHooks = null;
  paneTodoId = null;
  pane.hidden = true;
  document.body.classList.remove('pane-open');
  hooks?.flush();
}

// After a change made elsewhere, show the task's current state, unless the user is typing in the pane.
function refreshPane() {
  const pane = document.getElementById('pane');
  if (pane.hidden) return;
  if (!isDesk()) return closePane();
  const todo = state.todos.find(t => t.id === paneTodoId);
  if (!todo) {
    paneHooks?.cancel();
    paneHooks = null;
    pane.hidden = true;
    document.body.classList.remove('pane-open');
    return;
  }
  if (pane.contains(document.activeElement) && document.activeElement.matches('input, textarea')) return;
  openTodoEditor(todo, true);
}

function markSelected() {
  for (const row of document.querySelectorAll('.todo-row')) row.classList.toggle('sel', row.dataset.id === selectedId);
}

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

// "למחר", "להיום", or "ליום ג׳ 27.10".
function toDay(key) {
  const label = dayLabel(key);
  return key === today() || key === store.addDays(today(), 1) ? `ל${label}` : `ליום ${label}`;
}

// The date a repeat is anchored to: the task's date, or today.
const repeatBase = when => (store.DATE.test(when || '') ? when : today());

function pickWhen(current, onPick) {
  openSheet(body => {
    const quick = el('div', 'quick');
    // Undated tasks all show under מתישהו, so there is no separate בכל זמן.
    const selected = whenChoice(current) === 'anytime' ? 'someday' : whenChoice(current);
    for (const [choice, label, symbol] of [['today', 'היום', 'sun'], ['tomorrow', 'מחר', 'cal'], ['someday', 'מתישהו', 'box']]) {
      const b = el('button', selected === choice ? 'on' : '');
      b.append(icon(symbol), label);
      b.onclick = () => onPick(resolveWhen(choice));
      quick.append(b);
    }
    body.append(el('div', 'sheet-title', 'מתי?'), quick, calendar(store.DATE.test(current || '') ? current : null, onPick));
  });
}

// A month at a time, weeks starting on Sunday. Today is marked and the chosen day is filled.
function calendar(selected, onPick) {
  const wrap = el('div', 'cal');
  const t = today();
  let [y, m] = (selected && selected >= t ? selected : t).split('-').map(Number);
  m -= 1;
  const draw = () => {
    const head = el('div', 'cal-head');
    const prev = el('button', '', '›');
    prev.setAttribute('aria-label', 'חודש קודם');
    prev.onclick = () => { if (--m < 0) { m = 11; y--; } draw(); };
    const next = el('button', '', '‹');
    next.setAttribute('aria-label', 'חודש הבא');
    next.onclick = () => { if (++m > 11) { m = 0; y++; } draw(); };
    head.append(prev, el('span', '', `${MONTHS[m]} ${y}`), next);
    const grid = el('div', 'cal-grid');
    for (const d of ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']) grid.append(el('span', 'dow', d));
    for (let i = new Date(y, m, 1).getDay(); i > 0; i--) grid.append(el('span'));
    for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) {
      const key = store.dateKey(new Date(y, m, d));
      const b = el('button', key === selected ? 'on' : key === t ? 'today' : key < t ? 'past' : '', String(d));
      b.setAttribute('aria-label', dayLabel(key));
      b.onclick = () => onPick(key);
      grid.append(b);
    }
    wrap.replaceChildren(head, grid);
  };
  draw();
  return wrap;
}

function pickRepeat(current, baseKey, onPick) {
  openSheet(body => {
    const list = el('div', 'opts');
    const option = (label, detail, rule) => {
      const on = repeat.sameRule(current, rule);
      const b = el('button', `opt${on ? ' on' : ''}`);
      b.append(el('span', '', label));
      if (detail) b.append(el('span', 'detail', detail));
      if (on) b.append(icon('tick'));
      b.onclick = () => onPick(rule);
      list.append(b);
    };
    const presets = repeat.presets(baseKey);
    const rule = id => presets.find(p => p.id === id).rule;
    const [, month, day] = baseKey.split('-').map(Number);
    option('ללא חזרה', '', null);
    option('כל יום', '', rule('day'));
    option('כל יום חול', 'א׳–ה׳', rule('workdays'));
    option('כל שבוע', `ביום ${WEEKDAYS[rule('week').days[0]]}`, rule('week'));
    option('כל חודש', `ב-${day}`, rule('month'));
    option('כל שנה', `ב-${day}.${month}`, rule('year'));
    const custom = Boolean(current) && !presets.some(p => repeat.sameRule(p.rule, current));
    const more = el('button', `opt${custom ? ' on' : ''}`);
    more.append(el('span', '', 'מותאם…'), custom ? el('span', 'detail', repeat.describe(current, baseKey)) : el('span', 'chev', '‹'));
    more.onclick = () => pickCustomRepeat(current, baseKey, onPick, () => pickRepeat(current, baseKey, onPick));
    list.append(more);
    body.append(el('div', 'sheet-title', 'חוזר'), list);
  });
}

const UNIT_NAMES = { day: 'ימים', week: 'שבועות', month: 'חודשים', year: 'שנים' };

function pickCustomRepeat(current, baseKey, onPick, back) {
  const [y, mo, d] = baseKey.split('-').map(Number);
  const dow = new Date(y, mo - 1, d).getDay();
  const draft = { mode: current?.mode || 'fixed', every: current?.every || 1, unit: current?.unit || 'day',
    days: current?.days?.length ? [...current.days] : [dow] };
  const build = () => {
    const rule = { mode: draft.mode, every: draft.every, unit: draft.unit };
    if (draft.mode === 'fixed' && draft.unit === 'week') rule.days = draft.days.length ? [...draft.days].sort() : [dow];
    if (draft.mode === 'fixed' && draft.unit === 'month') rule.monthDay = d;
    if (draft.mode === 'fixed' && draft.unit === 'year') { rule.monthDay = d; rule.month = mo - 1; }
    return rule;
  };
  const draw = () => openSheet(body => {
    const title = el('div', 'sheet-title');
    const backBtn = el('button', 'btn-text', 'חזרה');
    backBtn.onclick = back;
    title.append(el('span', '', 'חזרה מותאמת'), backBtn);
    const seg = el('div', 'seg');
    for (const [mode, label] of [['fixed', 'לפי לוח קבוע'], ['after', 'אחרי שסיימתי']]) {
      const b = el('button', draft.mode === mode ? 'on' : '', label);
      b.onclick = () => { draft.mode = mode; draw(); };
      seg.append(b);
    }
    const stepper = el('div', 'repeat-step');
    const minus = el('button', 'b', '−');
    minus.setAttribute('aria-label', 'פחות');
    minus.onclick = () => { draft.every = Math.max(1, draft.every - 1); draw(); };
    const plus = el('button', 'b', '+');
    plus.setAttribute('aria-label', 'יותר');
    plus.onclick = () => { draft.every = Math.min(99, draft.every + 1); draw(); };
    if (draft.mode === 'fixed') stepper.append(el('span', '', 'כל'));
    stepper.append(minus, el('span', 'n', String(draft.every)), plus);
    if (draft.mode === 'after') stepper.append(el('span', '', `${UNIT_NAMES[draft.unit]} אחרי שסימנתי`));
    const units = el('div', 'when-chips');
    for (const unit of ['day', 'week', 'month', 'year']) {
      const b = el('button', `chip${draft.unit === unit ? ' on' : ''}`, UNIT_NAMES[unit]);
      b.onclick = () => { draft.unit = unit; draw(); };
      units.append(b);
    }
    body.append(title, seg, stepper, units);
    if (draft.mode === 'fixed' && draft.unit === 'week') {
      const days = el('div', 'wd');
      ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].forEach((label, i) => {
        const b = el('button', draft.days.includes(i) ? 'on' : '', label);
        b.setAttribute('aria-label', `יום ${WEEKDAYS[i]}`);
        b.onclick = () => {
          draft.days = draft.days.includes(i) ? draft.days.filter(x => x !== i) : [...draft.days, i];
          draw();
        };
        days.append(b);
      });
      body.append(days);
    }
    const rule = build();
    if (draft.mode === 'fixed') body.append(el('div', 'repeat-summary', repeat.describe(rule, baseKey)));
    else {
      body.append(el('div', 'repeat-summary', `הבאה תופיע ${repeat.describe(rule, baseKey).replace(' אחרי שסיימתי', '')} אחרי שתסמן את זו`),
        el('p', 'repeat-hint', 'טוב לדברים כמו השקיה או החלפת מצעים, שלא משנה באיזה יום בדיוק'));
    }
    const save = el('button', 'btn-primary', 'שמירה');
    save.onclick = () => onPick(build());
    body.append(save);
  });
  draw();
}

// ---------- task composer ----------

const composer = {
  when: 'anytime',
  projectId: null,
  defaultProject: null,
  defaultWhen: 'anytime',
  remindAt: null,
  // What the chips were set to by hand; a date typed in the title fills in the rest.
  repeat: null,
  baseWhen: 'anytime',
  baseRemindAt: null,
  baseRepeat: null,
  manualWhen: false,
  manualTime: false,
  manualRepeat: false,
  parsed: null,
  ignored: null,
  open(projectId = null, when = 'anytime') {
    this.defaultWhen = when;
    this.reset();
    this.defaultProject = this.projectId = projectId;
    this.render();
    document.getElementById('composer').hidden = false;
    document.getElementById('todo-title').focus();
  },
  close() {
    document.getElementById('composer').hidden = true;
    document.getElementById('todo-title').blur();
  },
  reset() {
    this.baseWhen = this.defaultWhen;
    this.baseRemindAt = null;
    this.baseRepeat = null;
    this.manualWhen = this.manualTime = this.manualRepeat = false;
    this.parsed = this.ignored = null;
    this.apply();
  },
  parse() {
    const text = document.getElementById('todo-title').value;
    let found = parseWhen(text, new Date(), reminders.readTimes());
    const phrase = found && text.slice(found.start, found.end);
    // A match the user dismissed stays dismissed until the phrase itself changes.
    if (found && phrase === this.ignored) found = null;
    else this.ignored = null;
    this.parsed = found;
    this.apply();
    this.render();
  },
  ignoreParsed() {
    const text = document.getElementById('todo-title').value;
    if (this.parsed) this.ignored = text.slice(this.parsed.start, this.parsed.end);
    this.parsed = null;
    this.apply();
    this.render();
  },
  apply() {
    const p = this.parsed;
    this.remindAt = this.manualTime || !p?.remindAt ? this.baseRemindAt : p.remindAt.toISOString();
    const parsedWhen = p && (p.when || (p.remindAt ? store.dateKey(p.remindAt) : null));
    this.when = this.manualWhen || !parsedWhen ? this.baseWhen : parsedWhen;
    this.repeat = this.manualRepeat || !p?.repeat ? this.baseRepeat : p.repeat;
    // A repeating task needs a date; without one it starts today or on its first day.
    if (this.repeat && !store.DATE.test(this.when)) this.when = repeat.firstDate(this.repeat, today());
  },
  setRepeat(rule) {
    this.baseRepeat = rule;
    this.manualRepeat = true;
    this.apply();
    this.render();
  },
  setWhen(when) {
    this.baseWhen = when;
    this.manualWhen = true;
    this.apply();
    this.render();
  },
  setReminder(remindAt) {
    this.baseRemindAt = remindAt;
    this.manualTime = true;
    if (remindAt) { this.baseWhen = store.dateKey(new Date(remindAt)); this.manualWhen = true; }
    this.apply();
    this.render();
  },
  render() {
    const choice = whenChoice(this.when);
    const dateLabel = choice === 'anytime' ? 'תאריך' : choice === 'someday' ? 'מתישהו' : dayLabel(this.when);
    document.getElementById('composer-date-label').textContent = dateLabel;
    document.getElementById('composer-date').classList.toggle('soft-on', choice !== 'anytime');
    const time = this.remindAt && reminders.hhmm(new Date(this.remindAt));
    document.getElementById('composer-time-label').textContent = time || 'שעה';
    document.getElementById('composer-time').classList.toggle('soft-on', Boolean(time));
    document.getElementById('composer-repeat-label').textContent = repeat.shortLabel(this.repeat);
    document.getElementById('composer-repeat').classList.toggle('soft-on', Boolean(this.repeat));
    const project = projectName(this.projectId);
    document.getElementById('composer-project-label').textContent = project || 'פרויקט';
    document.getElementById('composer-project').classList.toggle('soft-on', Boolean(project));
    const p = this.parsed;
    document.getElementById('composer-parsed').hidden = !p;
    if (p) {
      const at = p.remindAt && reminders.hhmm(p.remindAt);
      document.getElementById('composer-parsed-label').textContent = p.repeat
        ? [repeat.describe(p.repeat, p.when), at].filter(Boolean).join(', ')
        : p.remindAt ? reminderLabel(p.remindAt.toISOString()) : whenLabel(p.when);
    }
  },
  submit() {
    const input = document.getElementById('todo-title');
    const p = this.parsed;
    // The typed date becomes the task's date, so it leaves the title unless both chips overrode it.
    const used = p && !(this.manualWhen && this.manualTime && this.manualRepeat);
    const title = (used && stripWhen(input.value, p)) || input.value;
    const fields = { when: this.when, projectId: this.projectId };
    if (this.remindAt) fields.remindAt = this.remindAt;
    if (this.repeat) fields.repeat = this.repeat;
    if (!store.addTodo(state, title, fields)) return;
    const parsedReminder = used && !this.manualTime ? this.remindAt : null;
    input.value = '';
    this.reset();
    this.projectId = this.defaultProject;
    this.render();
    saveAndRender();
    if (parsedReminder) afterReminderChosen(parsedReminder, closeSheet);
  },
};

// Keep the keyboard open while choosing.
for (const chip of document.querySelectorAll('#composer-extra .chip')) chip.addEventListener('pointerdown', e => e.preventDefault());
const backToTitle = () => { closeSheet(); document.getElementById('todo-title').focus(); };
document.getElementById('composer-date').onclick = () => {
  pickWhen(composer.when, when => { composer.setWhen(when); backToTitle(); });
};
document.getElementById('composer-repeat').onclick = () => {
  pickRepeat(composer.repeat, repeatBase(composer.when), rule => { composer.setRepeat(rule); backToTitle(); });
};
document.getElementById('todo-title').addEventListener('input', () => composer.parse());
const parsedClear = document.getElementById('composer-parsed-clear');
parsedClear.addEventListener('pointerdown', e => e.preventDefault());
parsedClear.onclick = () => composer.ignoreParsed();
document.querySelector('#composer-form .addbtn').addEventListener('pointerdown', e => e.preventDefault());
document.getElementById('composer-form').onsubmit = e => { e.preventDefault(); composer.submit(); };
document.getElementById('composer-dim').onclick = () => composer.close();
// On the desktop a new task starts in the view it was added from.
const viewWhen = () => taskView === 'board' ? today() : viewFirstDay(taskView);
document.getElementById('btn-new-todo').onclick = () => composer.open(null, isDesk() ? viewWhen() : 'anytime');
document.getElementById('todo-title').addEventListener('keydown', e => { if (e.key === 'Escape') composer.close(); });
document.getElementById('composer-time').onclick = () => {
  pickReminder(composer.remindAt, remindAt => {
    composer.setReminder(remindAt);
    afterReminderChosen(remindAt, () => {
      closeSheet();
      document.getElementById('todo-title').focus();
    });
  });
};
document.getElementById('composer-project').onclick = () => {
  pickProject(composer.projectId, id => {
    composer.projectId = id;
    closeSheet();
    composer.render();
    document.getElementById('todo-title').focus();
  });
};

// ---------- reminders ----------

const FULL_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function reminderLabel(remindAt) {
  if (!remindAt) return null;
  const date = new Date(remindAt);
  const key = store.dateKey(date);
  const day = key === today() ? 'היום' : key === store.addDays(today(), 1) ? 'מחר' : dayLabel(key);
  return `${day}, ${reminders.hhmm(date)}`;
}

function presetDay(date) {
  const key = store.dateKey(date);
  if (key === today()) return null;
  if (key === store.addDays(today(), 1) || store.addDays(today(), 6) >= key) return FULL_DAYS[date.getDay()];
  return dayLabel(key);
}

function pickReminder(current, onPick) {
  openSheet(body => {
    const title = el('div', 'sheet-title');
    title.append(el('span', '', 'מתי להזכיר?'));
    const grid = el('div', 'presets');
    for (const preset of reminders.presets(new Date(), reminders.readTimes())) {
      const b = el('button', 'preset');
      const day = presetDay(preset.date);
      const iso = preset.date.toISOString();
      b.classList.toggle('on', current === iso);
      b.append(icon(preset.icon), el('b', '', preset.label),
        el('span', '', day ? `${day}, ${reminders.hhmm(preset.date)}` : reminders.hhmm(preset.date)));
      b.onclick = () => onPick(iso);
      grid.append(b);
    }
    const rows = el('div', 'rows');
    const custom = el('button', 'setting');
    custom.append(icon('cal'), el('span', '', 'תאריך ושעה אחרים'), el('span', 'chev', '‹'));
    custom.onclick = () => pickExactTime(current, onPick, () => pickReminder(current, onPick));
    rows.append(custom);
    body.append(title, grid, rows);
    if (current) {
      const remove = el('button', 'btn-danger-text', 'הסרת התזכורת');
      remove.onclick = () => onPick(null);
      body.append(remove);
    }
  });
}

function wheelColumn(values, selected, onChange) {
  const col = el('div', 'wheel-col');
  const cells = values.map(v => el('div', '', String(v).padStart(2, '0')));
  col.append(...cells);
  let index = Math.max(0, values.indexOf(selected));
  const mark = () => cells.forEach((c, i) => c.classList.toggle('c', i === index));
  mark();
  let timer;
  col.onscroll = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const next = Math.min(values.length - 1, Math.max(0, Math.round(col.scrollTop / cells[0].offsetHeight)));
      if (next !== index) { index = next; mark(); onChange(values[index]); }
    }, 60);
  };
  for (const [i, cell] of cells.entries()) {
    cell.onclick = () => col.scrollTo({ top: i * cell.offsetHeight, behavior: 'smooth' });
  }
  requestAnimationFrame(() => { col.scrollTop = index * cells[0].offsetHeight; });
  return col;
}

function pickExactTime(current, onPick, back) {
  const start = current ? new Date(current) : (() => {
    const d = new Date(Date.now() + 60 * 60000);
    d.setMinutes(0, 0, 0);
    return d;
  })();
  let day = store.dateKey(start);
  let hour = start.getHours();
  let minute = Math.round(start.getMinutes() / 5) * 5 % 60;
  openSheet(body => {
    const title = el('div', 'sheet-title');
    const backBtn = el('button', 'btn-text', 'חזרה');
    backBtn.onclick = back;
    title.append(el('span', '', 'תאריך ושעה'), backBtn);
    const days = el('div', 'when-chips');
    const go = el('button', 'btn-primary');
    const update = () => {
      for (const chip of days.children) chip.classList.toggle('on', chip.dataset.day === day ||
        (chip.dataset.day === 'date' && day !== today() && day !== store.addDays(today(), 1)));
      days.querySelector('[data-day=date] span').textContent =
        day !== today() && day !== store.addDays(today(), 1) ? dayLabel(day) : 'תאריך';
      const when = reminders.at(day, `${hour}:${minute}`);
      const time = reminders.hhmm(when);
      go.disabled = when <= new Date();
      go.textContent = go.disabled ? 'השעה הזו כבר עברה' : `להזכיר ${dayLabel(day)} ב-${time}`;
    };
    for (const [key, label] of [[today(), 'היום'], [store.addDays(today(), 1), 'מחר']]) {
      const chip = el('button', 'chip', label);
      chip.dataset.day = key;
      chip.onclick = () => { day = key; update(); };
      days.append(chip);
    }
    const dateChip = el('label', 'chip date-chip');
    dateChip.dataset.day = 'date';
    const input = el('input');
    input.type = 'date';
    input.min = today();
    input.setAttribute('aria-label', 'תאריך');
    input.onchange = () => { if (input.value) { day = input.value; update(); } };
    dateChip.append(icon('cal'), el('span', '', 'תאריך'), input);
    days.append(dateChip);
    const wheel = el('div', 'wheel');
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const minutes = Array.from({ length: 12 }, (_, i) => i * 5);
    wheel.append(
      wheelColumn(hours, hour, v => { hour = v; update(); }),
      el('span', 'wheel-colon', ':'),
      wheelColumn(minutes, minute, v => { minute = v; update(); }),
    );
    go.onclick = () => onPick(reminders.at(day, `${hour}:${minute}`).toISOString());
    body.append(title, days, wheel, go);
    update();
  });
}

// The first reminder on a device explains notifications before the iPhone asks.
function afterReminderChosen(remindAt, next) {
  const status = reminders.pushStatus();
  if (!remindAt || reminders.askedBefore() || !['default', 'install'].includes(status)) return next();
  reminders.markAsked();
  openPermissionSheet(status, next);
}

function openPermissionSheet(status, next, fromSettings = false) {
  openSheet(body => {
    const wrap = el('div', 'perm');
    const bell = el('div', 'bigbell');
    bell.append(icon('bell'));
    const message = el('p', '', '');
    message.setAttribute('role', 'status');
    if (status === 'install') {
      wrap.append(bell, el('h3', '', 'כדי לקבל תזכורות'),
        el('p', '', 'באייפון התראות מגיעות רק מאפליקציה שהוספה למסך הבית: בספארי לוחצים על כפתור השיתוף ואז על ״הוספה למסך הבית״.' +
          (fromSettings ? '' : ' התזכורת נשמרה ותופיע במשימה.')));
      const ok = el('button', 'btn-primary', 'הבנתי');
      ok.onclick = next;
      wrap.append(ok);
    } else {
      const enable = el('button', 'btn-primary', 'הפעלת תזכורות');
      enable.onclick = async () => {
        enable.disabled = true;
        try { await reminders.enablePush(account); renderSettings(); next(); }
        catch (error) { message.textContent = error.message; enable.disabled = false; }
      };
      const later = el('button', 'btn-text', 'לא עכשיו');
      later.onclick = next;
      wrap.append(bell, el('h3', '', 'שנזכיר לך בזמן?'),
        el('p', '', 'כדי שהתזכורת תגיע גם כשהאפליקציה סגורה, צריך לאשר התראות פעם אחת במכשיר הזה.'),
        enable, message, later);
    }
    body.append(wrap);
  });
}

function renderSettings() {
  const status = reminders.pushStatus();
  const label = document.getElementById('notifications-status');
  const text = {
    install: 'דורש הוספה למסך הבית',
    unsupported: 'לא נתמך בדפדפן הזה',
    denied: 'חסומות בהגדרות',
    default: 'הפעלה',
    granted: reminders.subscriptionSaved() ? 'פעילות' : 'לא הושלם',
  }[status];
  label.textContent = text;
  label.classList.toggle('on', status === 'granted' && reminders.subscriptionSaved());
  const times = reminders.readTimes();
  document.getElementById('time-morning').value = times.morning;
  document.getElementById('time-evening').value = times.evening;
}

document.getElementById('btn-notifications').onclick = async () => {
  const status = reminders.pushStatus();
  if (status === 'default' || status === 'install') return openPermissionSheet(status, closeSheet, true);
  if (status === 'granted') {
    try { await reminders.syncSubscription(account); }
    catch (error) { showToast(error.message); }
    renderSettings();
    return;
  }
  openSheet(body => {
    body.append(el('div', 'sheet-title', 'התראות'), el('p', '', status === 'denied'
      ? 'ההתראות חסומות. אפשר להפעיל אותן בהגדרות האייפון, תחת התראות ואז Tasks.'
      : 'הדפדפן הזה לא תומך בהתראות. התזכורות יופיעו במשימות עצמן.'));
  });
};
for (const [id, key] of [['time-morning', 'morning'], ['time-evening', 'evening']]) {
  document.getElementById(id).onchange = e => {
    if (!e.target.value) return;
    reminders.writeTimes({ ...reminders.readTimes(), [key]: e.target.value });
  };
}

// A tapped notification opens its task.
function openTodoById(id) {
  const todo = state?.todos.find(t => t.id === id);
  if (!todo) return;
  showScreen('todos');
  openTodoEditor(todo);
}
navigator.serviceWorker?.addEventListener('message', e => {
  if (e.data?.type === 'open-todo') openTodoById(e.data.id);
});

// ---------- projects ----------

let currentProject = null;
// The view chip picked inside a project on the desktop.
let projectView = 'all';
let projectsDoneOpen = false;

function renderProjects() {
  const container = document.getElementById('projects-container');
  container.replaceChildren();
  const pill = document.getElementById('btn-new-project');
  const project = state.projects.find(p => p.id === currentProject);
  document.getElementById('projects-head').hidden = !!project;
  if (!project) {
    currentProject = null;
    pill.textContent = 'פרויקט חדש';
    pill.onclick = openNewProject;
    const active = store.sortedProjects(state).filter(p => !p.done);
    const finished = store.sortedProjects(state).filter(p => p.done);
    document.getElementById('projects-sub').textContent =
      active.length ? count(active.length, 'פרויקט פעיל אחד', 'פעילים') : '';
    if (!active.length && !finished.length) {
      container.append(el('p', 'empty', 'עדיין אין פרויקטים. פרויקט מקבץ משימות עם מטרה אחת, כמו שיפוץ או יום הולדת.'));
      return;
    }
    if (active.length) {
      const wrap = el('div', 'category');
      for (const p of active) wrap.append(projectRow(p));
      container.append(wrap);
    }
    if (finished.length) {
      const details = el('details', 'category');
      details.open = projectsDoneOpen;
      details.ontoggle = () => { projectsDoneOpen = details.open; };
      const summary = el('summary');
      const h = el('h2');
      h.append(el('span', '', 'הושלמו'), el('span', '', String(finished.length)));
      summary.append(h);
      details.append(summary);
      for (const p of finished) details.append(projectRow(p));
      container.append(details);
    }
    return;
  }

  pill.textContent = `משימה חדשה ב${project.name}`;
  pill.onclick = () => composer.open(project.id);
  const back = el('button', 'back-button', '› פרויקטים');
  back.onclick = () => { currentProject = null; renderProjects(); scrollTo(0, 0); };
  const title = el('button', 'project-title', project.name);
  title.setAttribute('aria-label', `עריכת הפרויקט ${project.name}`);
  title.onclick = () => openProjectSheet(project);
  const todos = state.todos.filter(t => t.projectId === project.id);
  const openCount = todos.filter(t => !t.done).length;
  const sub = el('div', 'project-sub', `${openCount} פתוחות · ${todos.length - openCount} הושלמו`);
  const groups = el('div');
  const completedList = el('div');
  let doneCount = renderTaskGroups(groups, completedList, todos, { showProject: false });
  container.append(back, title, sub);
  // On the desktop a project can be narrowed to the same views as the tasks screen.
  const view = isDesk() ? projectView : 'all';
  if (isDesk() && todos.length) {
    const chips = el('div', 'chips project-views');
    for (const [key, label] of [['all', 'הכל'], ...Object.entries(VIEWS)]) {
      const chip = el('button', `chip${key === view ? ' on' : ''}`, label);
      chip.onclick = () => { projectView = key; renderProjects(); };
      chips.append(chip);
    }
    container.append(chips);
  }
  if (view !== 'all') {
    groups.replaceChildren();
    doneCount = 0;
    if (!renderViewTodos(groups, todos, view, { showProject: false })) {
      groups.append(el('p', 'empty', VIEW_EMPTY[view]));
    }
  }
  container.append(groups);
  if (!todos.length) container.append(el('p', 'empty', 'אין עדיין משימות בפרויקט'));
  if (doneCount) {
    const details = el('details', 'completed');
    const summary = el('summary');
    summary.append(el('span', '', 'הושלמו'), el('span', '', String(doneCount)));
    details.append(summary, completedList);
    container.append(details);
  }
  syncPicked();
}

function projectRow(project) {
  const todos = state.todos.filter(t => t.projectId === project.id);
  const open = todos.filter(t => !t.done).length;
  const row = el('button', 'row project-row');
  row.style.width = '100%';
  row.style.border = '0';
  const pie = el('span', 'pie');
  pie.style.setProperty('--p', todos.length ? Math.round(100 * (todos.length - open) / todos.length) : 0);
  row.append(pie, el('span', 'name', project.name), el('span', 'count', open ? String(open) : ''));
  row.onclick = () => { currentProject = project.id; projectView = 'all'; renderProjects(); scrollTo(0, 0); };
  return row;
}

function openNewProject() {
  openSheet(body => {
    const name = el('input', 'sheet-field');
    name.placeholder = 'שם הפרויקט';
    name.maxLength = 120;
    const create = el('button', 'btn-pill', 'יצירה');
    create.onclick = () => {
      const project = store.addProject(state, name.value);
      if (!project) return;
      closeSheet(); saveAndRender();
      currentProject = project.id;
      renderProjects();
      if (screen !== 'projects') showScreen('projects');
    };
    const footer = el('div', 'sheet-footer');
    footer.append(el('span'), create);
    body.append(el('div', 'sheet-title', 'פרויקט חדש'), name, footer);
  });
  document.querySelector('#sheet-body input').focus();
}

function openProjectSheet(project) {
  openSheet(body => {
    const name = el('input', 'sheet-field');
    name.value = project.name;
    name.maxLength = 120;
    const toggle = el('button', 'btn-quiet', project.done ? 'החזרה לפרויקטים פעילים' : 'סימון הפרויקט כהושלם');
    toggle.onclick = () => {
      store.updateProject(state, project.id, { done: !project.done });
      closeSheet(); saveAndRender();
    };
    const del = el('button', 'btn-danger-text', 'מחיקת הפרויקט');
    const delArea = el('div', 'sheet-actions');
    del.onclick = () => {
      const count = state.todos.filter(t => t.projectId === project.id).length;
      const remove = withTasks => {
        const copy = structuredClone(state);
        store.deleteProject(state, project.id, { withTasks });
        currentProject = null;
        closeSheet(); saveAndRender();
        showToast('הפרויקט נמחק', () => { state.projects = copy.projects; state.todos = copy.todos; });
      };
      if (!count) return remove(false);
      delArea.replaceChildren();
      const keep = el('button', 'btn-quiet', 'להשאיר את המשימות');
      keep.onclick = () => remove(false);
      const all = el('button', 'btn-danger', `למחוק גם ${count} משימות`);
      all.onclick = () => remove(true);
      delArea.append(keep, all);
    };
    const saveBtn = el('button', 'btn-pill', 'שמירה');
    saveBtn.onclick = () => {
      store.updateProject(state, project.id, { name: name.value });
      closeSheet(); saveAndRender();
    };
    const footer = el('div', 'sheet-footer');
    footer.append(del, saveBtn);
    body.append(el('div', 'sheet-label', 'שם הפרויקט'), name, toggle, footer, delArea);
  });
}

function pickProject(current, onPick) {
  openSheet(body => {
    const chips = el('div', 'when-chips');
    const none = el('button', `chip${current ? '' : ' on'}`, 'ללא פרויקט');
    none.onclick = () => onPick(null);
    chips.append(none);
    for (const p of store.sortedProjects(state).filter(p => !p.done || p.id === current)) {
      const b = el('button', `chip${p.id === current ? ' on' : ''}`);
      b.append(icon('folder'), p.name);
      b.onclick = () => onPick(p.id);
      chips.append(b);
    }
    const name = el('input', 'sheet-field');
    name.placeholder = 'או פרויקט חדש';
    name.maxLength = 120;
    name.enterKeyHint = 'done';
    const create = el('button', 'btn-pill', 'יצירה');
    create.onclick = () => {
      const project = store.addProject(state, name.value);
      if (!project) return;
      save();
      onPick(project.id);
    };
    name.onkeydown = e => { if (e.key === 'Enter') create.click(); };
    const row = el('div', 'sheet-actions');
    row.append(name, create);
    body.append(el('div', 'sheet-title', 'איזה פרויקט?'), chips, row);
  });
}

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
  if (isDesk()) closePane();
  document.getElementById('catalog').hidden = false;
  document.body.classList.toggle('catalog-open', true);
  if (!isDesk()) document.body.style.overflow = 'hidden';
  renderCatalog();
  if (!edit) search.focus();
}

function closeCatalog() {
  document.getElementById('catalog').hidden = true;
  document.body.classList.remove('catalog-open');
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

// Runs once when the sheet closes by any path (tap outside, drag down, a button).
let beforeSheetCloses = null;

function openSheet(build) {
  const sheet = document.getElementById('sheet');
  const wasOpen = sheet.open;
  if (!wasOpen) beforeSheetCloses = null;
  const body = document.getElementById('sheet-body');
  body.textContent = '';
  build(body);
  if (!wasOpen) {
    sheet.showModal();
    // Don't pop the keyboard just because a sheet opened.
    if (!isDesk() && document.activeElement?.matches('input')) document.activeElement.blur();
  }
  placeSheet(wasOpen);
}

// On the desktop a sheet is a small popover beside the control that opened it.
let anchor = null;
document.addEventListener('pointerdown', e => {
  if (!e.target.closest?.('#sheet')) anchor = e.target.closest?.('button, label, .row, .chip') || null;
}, true);

function placeSheet(keep) {
  const sheet = document.getElementById('sheet');
  if (!isDesk()) { sheet.style.top = sheet.style.left = ''; return; }
  const w = sheet.offsetWidth, h = sheet.offsetHeight, vw = innerWidth, vh = innerHeight, gap = 8;
  if (keep) {
    const top = parseFloat(sheet.style.top) || 0;
    if (top + h > vh - 12) sheet.style.top = `${Math.max(12, vh - 12 - h)}px`;
    return;
  }
  const r = anchor?.isConnected && !anchor.closest('[hidden]') ? anchor.getBoundingClientRect() : null;
  let top = (vh - h) / 3, left = (vw - w) / 2;
  if (r && r.width) {
    left = Math.min(Math.max(12, r.right - w), vw - w - 12);
    top = r.bottom + gap + h <= vh - 12 ? r.bottom + gap : r.top - gap - h;
  }
  sheet.style.left = `${left}px`;
  sheet.style.top = `${Math.max(12, Math.min(top, vh - 12 - h))}px`;
}

function closeSheet() {
  const hook = beforeSheetCloses;
  beforeSheetCloses = null;
  hook?.();
  document.getElementById('sheet').close();
}

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

// ---------- desktop: sidebar ----------

const VIEW_ICONS = { today: 'sun', tomorrow: 'moon', week: 'cal', month: 'list', later: 'clock', someday: 'box', board: 'board' };

function showTaskView(view) {
  taskView = view;
  renderTodos();
  showScreen('todos');
}

function showProject(id) {
  if (id !== currentProject) projectView = 'all';
  currentProject = id;
  renderProjects();
  showScreen('projects');
}

function renderSidebar() {
  const nav = document.getElementById('sidebar');
  if (!isDesk() || !state) return nav.replaceChildren();
  const groups = store.groupTodos(looseTodos().filter(t => !t.done), today());
  const item = (label, symbol, n, on, onClick, drop) => {
    const b = el('button', `side-item${on ? ' on' : ''}`);
    b.append(icon(symbol), el('span', 'label', label), el('span', 'n', n ? String(n) : ''));
    if (on) b.setAttribute('aria-current', 'page');
    b.onclick = onClick;
    if (drop) dropTarget(b, drop);
    return b;
  };
  const items = [];
  for (const [view, label] of Object.entries(VIEWS)) {
    items.push(item(label, VIEW_ICONS[view], groups[view].length, screen === 'todos' && taskView === view, () => showTaskView(view),
      todo => ({ when: viewWhenFor(view, todo) })));
  }
  items.push(item('לוח', VIEW_ICONS.board, 0, screen === 'todos' && taskView === 'board', () => showTaskView('board')));
  items.push(el('div', 'side-sep'));
  items.push(item('קניות', 'cart', state.list.filter(e => !e.bought).length, screen === 'list', () => showScreen('list')));
  const head = el('div', 'side-label');
  const all = el('button', '', 'פרויקטים');
  all.onclick = () => showProject(null);
  const add = el('button', 'side-add', '+ חדש');
  add.onclick = openNewProject;
  head.append(all, add);
  items.push(head);
  for (const p of store.sortedProjects(state).filter(p => !p.done)) {
    const open = state.todos.filter(t => t.projectId === p.id && !t.done).length;
    items.push(item(p.name, 'folder', open, screen === 'projects' && currentProject === p.id, () => showProject(p.id),
      () => ({ projectId: p.id })));
  }
  items.push(el('div', 'side-grow'));
  items.push(item('הגדרות', 'gear', 0, screen === 'settings', () => { renderSettings(); showScreen('settings'); }));
  nav.replaceChildren(...items);
}

// The "when" a new task gets in each view.
function viewFirstDay(view) {
  return ({ today: today(), tomorrow: store.addDays(today(), 1), week: store.addDays(today(), 2),
    month: store.addDays(store.weekEnd(today()), 1), later: store.addDays(store.monthEnd(today()), 1), someday: 'anytime' })[view];
}

// Dropping a task on היום or מחר moves it there; on the other views it keeps its own date if that already fits.
function viewWhenFor(view, todo) {
  if (view !== 'today' && view !== 'tomorrow' && store.groupTodos([todo], today())[view].length) return todo.when;
  return viewFirstDay(view);
}

// `already` says a task is in this place now, so dropping it here changes nothing.
function dropTarget(target, fields, already = () => false) {
  target.addEventListener('dragover', e => {
    if (!e.dataTransfer.types.includes('text/x-todo')) return;
    e.preventDefault();
    target.classList.add('drop');
  });
  target.addEventListener('dragleave', () => target.classList.remove('drop'));
  target.addEventListener('drop', e => {
    target.classList.remove('drop');
    const todo = state.todos.find(t => t.id === e.dataTransfer.getData('text/x-todo'));
    if (!todo) return;
    e.preventDefault();
    if (already(todo) && !(picked.has(todo.id) && picked.size > 1)) return;
    // Dragging one of several picked tasks moves them all.
    if (picked.has(todo.id) && picked.size > 1) {
      return changePicked(t => store.updateTodo(state, t.id, fields(t)),
        n => `${count(n, 'משימה אחת הועברה', 'משימות הועברו')} ${whereLabel(fields(todo))}`.trim());
    }
    changeTodo(todo, fields(todo), 'הועברה');
  });
}

// "למחר", "למתישהו", "לשיפוץ".
function whereLabel(fields) {
  if (fields.projectId) return `ל${projectName(fields.projectId)}`;
  if (!('when' in fields)) return '';
  return store.DATE.test(fields.when) ? toDay(fields.when) : `ל${whenLabel(fields.when)}`;
}

// A quick change from the menu, the keyboard or a drag, with an undo toast.
function changeTodo(todo, fields, message) {
  const before = Object.fromEntries(Object.keys(fields).map(k => [k, todo[k] ?? null]));
  store.updateTodo(state, todo.id, fields);
  saveAndRender();
  showToast(`${message} ${whereLabel(fields)}`.trim(), () => store.updateTodo(state, todo.id, before));
}

// ---------- several tasks at once ----------

// Tasks picked for one action: a long press on the phone starts picking, ⌘ or Shift-click on the desktop.
const picked = new Set();
const selecting = () => picked.size > 0;
const pickableRows = () => visibleRows().filter(r => !r.closest('[hidden]'));

function togglePick(id) {
  // ⌘-click adds to the task already selected with the keyboard or the pane.
  if (!picked.size && isDesk() && selectedId && selectedId !== id && pickableRows().some(r => r.dataset.id === selectedId)) {
    picked.add(selectedId);
  }
  if (picked.has(id)) picked.delete(id);
  else picked.add(id);
  pickAnchor = id;
  if (picked.size && isDesk()) closePane();
  syncPicked();
}

// Shift-click picks every visible task between the last picked one and this one.
let pickAnchor = null;
function pickRange(id) {
  const ids = pickableRows().map(r => r.dataset.id);
  const from = ids.indexOf(picked.has(pickAnchor) ? pickAnchor : selectedId);
  const to = ids.indexOf(id);
  if (from === -1 || to === -1) return togglePick(id);
  for (const x of ids.slice(Math.min(from, to), Math.max(from, to) + 1)) picked.add(x);
  if (isDesk()) closePane();
  syncPicked();
}

function pickAll() {
  for (const row of pickableRows()) picked.add(row.dataset.id);
  syncPicked();
}

function clearPicked() {
  if (!picked.size) return;
  picked.clear();
  syncPicked();
}

// Drops picks that are no longer on screen, then shows the rows and the bar as they are.
function syncPicked() {
  const shown = new Set(pickableRows().map(r => r.dataset.id));
  for (const id of picked) if (!shown.has(id)) picked.delete(id);
  for (const row of document.querySelectorAll('.todo-row')) {
    row.classList.toggle('picked', picked.has(row.dataset.id));
  }
  document.body.classList.toggle('selecting', selecting());
  const bar = document.getElementById('pick-bar');
  bar.hidden = !selecting();
  if (!selecting()) return;
  document.getElementById('pick-count').textContent = count(picked.size, 'משימה אחת נבחרה', 'נבחרו');
  document.getElementById('pick-all').hidden = shown.size === picked.size;
}

// Applies one change to every picked task, with one undo for all of them.
function changePicked(apply, message) {
  const todos = state.todos.filter(t => picked.has(t.id));
  if (!todos.length) return clearPicked();
  const before = structuredClone(state.todos);
  for (const todo of todos) apply(todo);
  picked.clear();
  saveAndRender();
  showToast(message(todos.length), () => { state.todos = before; });
}

// The value every picked task shares, so the picker can mark it; otherwise null.
function sharedValue(key) {
  const values = new Set(state.todos.filter(t => picked.has(t.id)).map(t => t[key] || null));
  return values.size === 1 ? [...values][0] : null;
}

const pickActions = {
  when: when => changePicked(t => store.updateTodo(state, t.id, { when }),
    n => `${count(n, 'משימה אחת הועברה', 'משימות הועברו')} ${whereLabel({ when })}`),
  pickWhen: () => pickWhen(sharedValue('when'), when => { closeSheet(); pickActions.when(when); }),
  project: () => pickProject(sharedValue('projectId'), projectId => {
    closeSheet();
    changePicked(t => store.updateTodo(state, t.id, { projectId }),
      n => projectId ? `${count(n, 'משימה אחת הועברה', 'משימות הועברו')} ${whereLabel({ projectId })}`
        : count(n, 'משימה אחת הוצאה מהפרויקט', 'משימות הוצאו מהפרויקט'));
  }),
  done: () => changePicked(t => store.setTodoDone(state, t.id, true), n => count(n, 'משימה אחת סומנה כבוצעה', 'משימות סומנו כבוצעו')),
  remove: () => changePicked(t => store.deleteTodo(state, t.id), n => count(n, 'משימה אחת נמחקה', 'משימות נמחקו')),
};

document.getElementById('pick-all').onclick = pickAll;
document.getElementById('pick-cancel').onclick = clearPicked;
document.getElementById('pick-when').onclick = pickActions.pickWhen;
document.getElementById('pick-project').onclick = pickActions.project;
document.getElementById('pick-done').onclick = pickActions.done;
document.getElementById('pick-delete').onclick = pickActions.remove;

// ---------- desktop: right-click menu ----------

function openContextMenu(todo, row, x, y) {
  selectedId = todo.id;
  markSelected();
  const menu = document.getElementById('ctx-menu');
  const choice = whenChoice(todo.when || 'anytime');
  const item = (symbol, label, key, onClick, { checked = false, danger = false, sub = false } = {}) => {
    const b = el('button', `ctx-item${danger ? ' danger' : ''}`);
    b.setAttribute('role', 'menuitem');
    b.append(icon(symbol), el('span', 'label', label));
    if (checked) b.append(el('span', 'ck', '✓'));
    else if (key) b.append(el('kbd', '', key));
    else if (sub) b.append(el('span', 'ar', '‹'));
    b.onclick = () => { closeContextMenu(); anchor = row; onClick(); };
    return b;
  };
  const a = todoActions(todo);
  menu.replaceChildren(
    item('sun', 'היום', 'T', a.today, { checked: choice === 'today' }),
    item('cal', 'מחר', 'M', a.tomorrow, { checked: choice === 'tomorrow' }),
    item('cal', 'תאריך…', 'D', a.date),
    item('box', 'מתישהו', '', a.someday, { checked: choice === 'someday' || choice === 'anytime' }),
    el('hr'),
    item('clock', 'שעה ותזכורת…', '', a.reminder),
    item('rep', 'חוזר…', '', a.repeat),
    item('folder', 'העברה לפרויקט', '', a.project, { sub: true }),
    el('hr'),
    item('trash', 'מחיקה', '⌫', a.remove, { danger: true }),
  );
  menu.hidden = false;
  const w = menu.offsetWidth, h = menu.offsetHeight;
  // In a right-to-left page the menu opens to the left of the pointer.
  menu.style.left = `${Math.max(8, Math.min(x - w, innerWidth - w - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - h - 8))}px`;
  menu.querySelector('button').focus({ preventScroll: true });
}

function closeContextMenu() {
  document.getElementById('ctx-menu').hidden = true;
}
document.addEventListener('pointerdown', e => { if (!e.target.closest?.('#ctx-menu')) closeContextMenu(); }, true);
addEventListener('blur', closeContextMenu);
addEventListener('resize', closeContextMenu);
document.addEventListener('scroll', closeContextMenu, { passive: true, capture: true });

// What the menu and the keyboard can do to one task.
function todoActions(todo) {
  return {
    today: () => changeTodo(todo, { when: today() }, 'הועברה'),
    tomorrow: () => changeTodo(todo, { when: store.addDays(today(), 1) }, 'הועברה'),
    someday: () => changeTodo(todo, { when: 'someday' }, 'הועברה'),
    date: () => pickWhen(todo.when, when => { closeSheet(); changeTodo(todo, { when }, 'הועברה'); }),
    reminder: () => pickReminder(todo.remindAt || null, remindAt => {
      store.updateTodo(state, todo.id, remindAt ? { remindAt, when: store.dateKey(new Date(remindAt)) } : { remindAt });
      saveAndRender();
      afterReminderChosen(remindAt, closeSheet);
    }),
    repeat: () => pickRepeat(todo.repeat || null, repeatBase(todo.when), rule => {
      store.updateTodo(state, todo.id, rule && !store.DATE.test(todo.when || '') ? { repeat: rule, when: repeat.firstDate(rule, today()) } : { repeat: rule });
      closeSheet();
      saveAndRender();
    }),
    project: () => pickProject(todo.projectId || null, projectId => { closeSheet(); changeTodo(todo, { projectId }, 'הועברה'); }),
    remove: () => { if (paneTodoId === todo.id) closePane(); deleteTodo(todo); },
  };
}

// ---------- desktop: keyboard ----------

const SHORTCUTS = [
  ['N', 'משימה חדשה, או הוספת מוצר בקניות'],
  ['↑ ↓', 'מעבר בין משימות'],
  ['Enter', 'פתיחת הפרטים'],
  ['רווח', 'סימון כבוצע'],
  ['T  M', 'להיום, למחר'],
  ['D', 'בחירת תאריך'],
  ['⌫', 'מחיקה'],
  ['⌘ / Shift + קליק', 'בחירת כמה משימות'],
  ['⌘A', 'בחירת כל המשימות שבמסך'],
  ['⌘Z', 'ביטול הפעולה האחרונה'],
  ['1–8', 'היום, מחר, השבוע, החודש, בהמשך, מתישהו, קניות, לוח'],
  ['Esc', 'סגירה'],
];

function openShortcuts() {
  anchor = null;
  openSheet(body => {
    const list = el('div', 'keys');
    for (const [key, label] of SHORTCUTS) list.append(el('kbd', '', key), el('span', '', label));
    body.append(el('div', 'sheet-title', 'קיצורי מקלדת'), list);
  });
}

const visibleRows = () => [...document.querySelectorAll('.screen:not([hidden]) .todo-row:not(.done)')];

function moveSelection(step) {
  const rows = visibleRows();
  if (!rows.length) return;
  const at = rows.findIndex(r => r.dataset.id === selectedId);
  const next = rows[at === -1 ? (step > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, at + step))];
  selectedId = next.dataset.id;
  markSelected();
  next.scrollIntoView({ block: 'nearest' });
  if (paneTodoId) openTodoEditor(state.todos.find(t => t.id === selectedId));
}

document.addEventListener('keydown', e => {
  if (!isDesk() || e.isComposing) return;
  const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
  const sheetOpen = document.getElementById('sheet').open;
  const menu = document.getElementById('ctx-menu');
  if (e.key === 'Escape') {
    if (!menu.hidden) { closeContextMenu(); return; }
    if (sheetOpen || typing) return;
    if (selecting()) { clearPicked(); return; }
    if (!document.getElementById('pane').hidden) { closePane(); return; }
    if (!document.getElementById('catalog').hidden) { closeCatalog(); return; }
    if (selectedId) { selectedId = null; markSelected(); }
    return;
  }
  if (!menu.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    const items = [...menu.querySelectorAll('button')];
    const at = items.indexOf(document.activeElement);
    items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    return;
  }
  if (typing || sheetOpen || !menu.hidden || !document.getElementById('composer').hidden) return;
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ' && !e.shiftKey) {
    const undo = document.getElementById('toast-undo');
    if (!document.getElementById('toast').hidden && !undo.hidden) { e.preventDefault(); undo.click(); }
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyA' && (screen === 'todos' || screen === 'projects')) {
    e.preventDefault();
    pickAll();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // Physical keys, so the shortcuts also work with the Hebrew layout.
  const selected = state?.todos.find(t => t.id === selectedId && visibleRows().some(r => r.dataset.id === t.id));
  const row = selected && document.querySelector(`.screen:not([hidden]) .todo-row[data-id="${selected.id}"]`);
  const act = fn => { e.preventDefault(); fn(); };
  const views = Object.keys(VIEWS);
  if (e.key === '?') return act(openShortcuts);
  if (/^Digit[1-8]$/.test(e.code)) {
    const n = Number(e.code.slice(5));
    return act(() => (n === 7 ? showScreen('list') : showTaskView(n === 8 ? 'board' : views[n - 1])));
  }
  if (e.code === 'KeyN' || (e.code === 'Slash' && screen === 'list')) {
    clearPicked();
    if (screen === 'list') return act(() => openCatalog(false));
    if (screen === 'todos' || (screen === 'projects' && currentProject)) {
      return act(() => document.querySelector('.pill:not([hidden])').click());
    }
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') return act(() => { clearPicked(); moveSelection(e.key === 'ArrowDown' ? 1 : -1); });
  // With several tasks picked the same keys act on all of them.
  if (selecting()) {
    anchor = document.getElementById('pick-when');
    if (e.code === 'KeyT') return act(() => pickActions.when(today()));
    if (e.code === 'KeyM') return act(() => pickActions.when(store.addDays(today(), 1)));
    if (e.code === 'KeyD') return act(pickActions.pickWhen);
    if (e.code === 'Space') return act(pickActions.done);
    if (e.key === 'Backspace' || e.key === 'Delete') return act(pickActions.remove);
    return;
  }
  if (!selected) return;
  const a = todoActions(selected);
  anchor = row;
  if (e.key === 'Enter') return act(() => openTodoEditor(selected));
  if (e.code === 'Space') {
    return act(() => { const check = row.querySelector('input[type=checkbox]'); check.click(); });
  }
  if (e.code === 'KeyT') return act(a.today);
  if (e.code === 'KeyM') return act(a.tomorrow);
  if (e.code === 'KeyD') return act(a.date);
  if (e.key === 'Backspace' || e.key === 'Delete') {
    return act(() => {
      const rows = visibleRows();
      const at = rows.indexOf(row);
      const next = rows[at + 1] || rows[at - 1];
      a.remove();
      selectedId = next?.dataset.id || null;
      markSelected();
    });
  }
});

wide.addEventListener('change', () => {
  closePane();
  closeContextMenu();
  if (!document.getElementById('sheet').open) document.getElementById('sheet').style.top = '';
  if (state) render();
  showScreen(screen);
});

// ---------- wiring ----------

document.getElementById('search').oninput = e => {
  searchTerm = e.target.value;
  renderCatalog();
};
// On the desktop Enter adds the first match, or offers the typed name as a new product.
document.getElementById('search').addEventListener('keydown', e => {
  if (e.key === 'Escape' && isDesk()) { closeCatalog(); return; }
  if (e.key !== 'Enter' || !isDesk() || editMode) return;
  const term = searchTerm.trim();
  if (!term) return;
  e.preventDefault();
  const match = state.items.filter(i => i.name.includes(term))
    .sort((a, b) => (b.name.startsWith(term) - a.name.startsWith(term)) || a.name.localeCompare(b.name, 'he'))[0];
  if (!match) return openAddItemSheet(term);
  if (!store.isOnList(state, match.id)) store.addToList(state, match.id);
  searchTerm = '';
  e.target.value = '';
  saveAndRender();
  showToast(`${match.name} נוסף לרשימה`);
});
document.getElementById('btn-catalog-done').onclick = closeCatalog;
document.getElementById('btn-add').onclick = () => openCatalog(false);
document.getElementById('btn-edit-catalog').onclick = () => openCatalog(true);

document.getElementById('tab-list').onclick = () => showScreen('list');
document.getElementById('tab-todos').onclick = () => showScreen('todos');
document.getElementById('tab-projects').onclick = () => { currentProject = null; renderProjects(); showScreen('projects'); };
document.getElementById('tab-settings').onclick = () => { renderSettings(); showScreen('settings'); };


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

showScreen('todos');
boot();
