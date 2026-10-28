import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../store.js';

const seed = { categories: [{ name: 'כללי' }], items: [] };

test('old backups gain an empty todo list without losing grocery data', () => {
  const legacy = { version: 1, categories: [{ id: 'c', name: 'כללי', order: 0 }],
    items: [{ id: 'i', name: 'חלב', categoryId: 'c', lastQty: 3 }], list: [{ itemId: 'i', qty: 2 }] };
  const result = store.load(JSON.stringify(legacy), seed);
  assert.equal(result.corrupt, false);
  assert.deepEqual(result.state, { ...legacy, todos: [], projects: [] });
});

test('tasks can be added, edited, completed, reopened and deleted independently of groceries', () => {
  const state = store.createState(seed);
  const todo = store.addTodo(state, '  להזמין תור  ');
  assert.equal(todo.title, 'להזמין תור');
  assert.equal(todo.done, false);
  store.renameTodo(state, todo.id, ' להתקשר למרפאה ');
  store.setTodoDone(state, todo.id, true);
  const restored = store.load(store.serialize(state), seed);
  assert.equal(restored.corrupt, false);
  assert.deepEqual(restored.state.todos.map(({ doneAt, ...rest }) => rest),
    [{ id: todo.id, title: 'להתקשר למרפאה', done: true, when: 'anytime' }]);
  store.setTodoDone(state, todo.id, false);
  assert.equal(state.todos[0].done, false);
  store.deleteTodo(state, todo.id);
  assert.deepEqual(state.todos, []);
  assert.deepEqual(state.list, []);
});

test('blank tasks are rejected and invalid task backups are reported as corrupt', () => {
  const state = store.createState(seed);
  assert.equal(store.addTodo(state, '  '), null);
  const todo = store.addTodo(state, 'משימה');
  store.renameTodo(state, todo.id, ' ');
  assert.equal(todo.title, 'משימה');
  for (const todos of [null, {}, [null], [{ id: 'x', title: 'משימה', done: 'false' }]]) {
    assert.equal(store.load(JSON.stringify({ ...state, todos }), seed).corrupt, true);
  }
});

test('undo puts a deleted task and a removed grocery back in place', () => {
  const state = store.createState({ categories: [{ name: 'כללי' }], items: [{ name: 'חלב', cat: 0 }, { name: 'לחם', cat: 0 }] });
  const [a, b, c] = ['א', 'ב', 'ג'].map(t => store.addTodo(state, t));
  const index = state.todos.indexOf(b);
  store.deleteTodo(state, b.id);
  store.restoreTodo(state, b, index);
  assert.deepEqual(state.todos.map(t => t.id), [a.id, b.id, c.id]);
  store.restoreTodo(state, b, index);
  assert.equal(state.todos.length, 3);
  const [milk, bread] = state.items;
  store.addToList(state, milk.id);
  store.addToList(state, bread.id);
  store.setQty(state, milk.id, 3);
  const entry = { ...state.list[0] };
  store.removeFromList(state, milk.id);
  store.restoreListEntry(state, entry, 0);
  assert.deepEqual(state.list, [{ itemId: milk.id, qty: 3 }, { itemId: bread.id, qty: 1 }]);
  store.deleteItem(state, milk.id);
  store.restoreListEntry(state, entry, 0);
  assert.deepEqual(state.list.map(e => e.itemId), [bread.id]);
});

test('tasks without a time are "anytime", and old tasks gain it on load', () => {
  const legacy = { version: 1, categories: [{ id: 'c', name: 'כללי', order: 0 }], items: [], list: [],
    todos: [{ id: 't', title: 'ישנה', done: false }] };
  assert.equal(store.load(JSON.stringify(legacy), seed).state.todos[0].when, 'anytime');
  const state = store.createState(seed);
  assert.equal(store.addTodo(state, 'א').when, 'anytime');
  assert.equal(store.addTodo(state, 'ב', { when: '2026-10-24' }).when, '2026-10-24');
  for (const when of ['today', '24/10/2026', 5]) {
    assert.equal(store.load(JSON.stringify({ ...state, todos: [{ id: 'x', title: 'x', done: false, when }] }), seed).corrupt, true);
  }
});

test('tasks group into today (with overdue), tomorrow, this week, this month, later and someday', () => {
  const t = (id, when) => ({ id, title: id, done: false, when });
  // 2026-10-23 is a Friday, so the week ends tomorrow; 2026-10-27 is a Tuesday.
  const ids = groups => Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.map(x => x.id)]));
  const todos = [
    t('late', '2026-10-21'), t('now', '2026-10-23'), t('tom', '2026-10-24'), t('far', '2026-11-02'),
    t('soon', '2026-10-26'), t('any', 'anytime'), t('some', 'someday'), { id: 'old', title: 'old', done: false },
  ];
  assert.deepEqual(ids(store.groupTodos(todos, '2026-10-23')), {
    today: ['late', 'now'], tomorrow: ['tom'], week: [], month: ['soon'], later: ['far'], someday: ['any', 'some', 'old'],
  });
  assert.deepEqual(ids(store.groupTodos([t('thu', '2026-10-29'), t('sat', '2026-10-31'), t('nov', '2026-11-01')], '2026-10-27')), {
    today: [], tomorrow: [], week: ['thu', 'sat'], month: [], later: ['nov'], someday: [],
  });
  assert.equal(store.weekEnd('2026-10-25'), '2026-10-31');
  assert.equal(store.monthEnd('2026-02-10'), '2026-02-28');
  assert.equal(store.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(store.addDays('2026-03-01', -1), '2026-02-28');
});

test('tasks in a group sort by date, then time, with untimed tasks last on their day', () => {
  const t = (id, when, remindAt) => ({ id, title: id, done: false, when, ...(remindAt && { remindAt }) });
  const todos = [
    t('plain', '2026-10-23'), t('late', '2026-10-23', '2026-10-23T15:00:00.000Z'), t('early', '2026-10-23', '2026-10-23T07:00:00.000Z'),
    t('overdue', '2026-10-21'), t('overdueTimed', '2026-10-22', '2026-10-22T09:00:00.000Z'),
    t('tomPlain', '2026-10-24'), t('tomTimed', '2026-10-24', '2026-10-24T08:00:00.000Z'),
  ];
  const groups = store.groupTodos(todos, '2026-10-23');
  assert.deepEqual(groups.today.map(x => x.id), ['overdue', 'overdueTimed', 'early', 'late', 'plain']);
  assert.deepEqual(groups.tomorrow.map(x => x.id), ['tomTimed', 'tomPlain']);
});

test('updating a task keeps its title when the new one is blank', () => {
  const state = store.createState(seed);
  const todo = store.addTodo(state, 'משימה');
  store.updateTodo(state, todo.id, { title: '  ', when: 'someday' });
  assert.equal(todo.title, 'משימה');
  assert.equal(todo.when, 'someday');
  store.updateTodo(state, todo.id, { title: ' חדשה ' });
  assert.equal(todo.title, 'חדשה');
  store.setTodoDone(state, todo.id, true);
  assert.equal(typeof todo.doneAt, 'string');
  store.setTodoDone(state, todo.id, false);
  assert.equal(todo.doneAt, null);
});

test('projects are created, renamed, completed and deleted with or without their tasks', () => {
  const state = store.createState(seed);
  assert.equal(store.addProject(state, '  '), null);
  const home = store.addProject(state, ' שיפוץ ');
  const work = store.addProject(state, 'עבודה');
  assert.deepEqual(store.sortedProjects(state).map(p => p.name), ['שיפוץ', 'עבודה']);
  store.updateProject(state, home.id, { name: ' ', done: true });
  assert.equal(home.name, 'שיפוץ');
  assert.equal(home.done, true);
  const a = store.addTodo(state, 'אריחים', { projectId: home.id });
  const b = store.addTodo(state, 'צבע', { projectId: home.id });
  const c = store.addTodo(state, 'מצגת', { projectId: work.id });
  store.deleteProject(state, home.id, { withTasks: false });
  assert.deepEqual([a.projectId, b.projectId], [null, null]);
  store.deleteProject(state, work.id, { withTasks: true });
  assert.deepEqual(state.todos.map(t => t.id), [a.id, b.id]);
  assert.equal(c.projectId, work.id);
  const restored = store.load(store.serialize(state), seed);
  assert.equal(restored.corrupt, false);
  assert.deepEqual(restored.state.projects, []);
  assert.equal(store.load(JSON.stringify({ ...state, projects: [{ id: 'p', name: 3, order: 0 }] }), seed).corrupt, true);
});

test('notes are saved, cleared when emptied, and carried to the next repeat', () => {
  const state = store.createState(seed);
  const todo = store.addTodo(state, 'להתקשר לנגר', { when: '2026-10-25', repeat: { mode: 'fixed', every: 1, unit: 'week', days: [0] } });
  store.updateTodo(state, todo.id, { notes: 'יוסי, 052-7314420' });
  assert.equal(todo.notes, 'יוסי, 052-7314420');
  const next = store.setTodoDone(state, todo.id, true, '2026-10-25');
  assert.equal(next.notes, 'יוסי, 052-7314420');
  store.updateTodo(state, todo.id, { notes: '  ' });
  assert.equal('notes' in todo, false);
  const reloaded = store.load(JSON.stringify(state), seed);
  assert.equal(reloaded.corrupt, false);
  assert.equal(reloaded.state.todos.find(t => t.id === next.id).notes, 'יוסי, 052-7314420');
  assert.equal(store.load(JSON.stringify({ ...state, todos: [{ ...todo, notes: 5 }] }), seed).corrupt, true);
});
