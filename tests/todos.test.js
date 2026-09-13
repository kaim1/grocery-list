import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../store.js';

const seed = { categories: [{ name: 'כללי' }], items: [] };

test('old backups gain an empty todo list without losing grocery data', () => {
  const legacy = { version: 1, categories: [{ id: 'c', name: 'כללי', order: 0 }],
    items: [{ id: 'i', name: 'חלב', categoryId: 'c', lastQty: 3 }], list: [{ itemId: 'i', qty: 2 }] };
  const result = store.load(JSON.stringify(legacy), seed);
  assert.equal(result.corrupt, false);
  assert.deepEqual(result.state, { ...legacy, todos: [] });
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
  assert.deepEqual(restored.state.todos, [{ id: todo.id, title: 'להתקשר למרפאה', done: true }]);
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
