import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Repository } from '../persistence.js';
import * as store from '../store.js';

const seed = { categories: [{ name: 'כללי' }], items: [] };
function storage() {
  const values = new Map();
  return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
}

test('multiple browser tabs merge saved changes instead of overwriting each other', () => {
  const disk = storage();
  const a = new Repository(disk, seed), b = new Repository(disk, seed);
  const sa = a.open(), sb = b.open();
  store.addTodo(sa, 'א'); store.addTodo(sb, 'ב');
  a.save(sa); b.save(sb);
  assert.deepEqual(new Set(a.read().state.todos.map(t => t.title)), new Set(['א', 'ב']));
});

test('account working copies and unsynced changes survive reload and are isolated from other accounts', () => {
  const disk = storage();
  const guest = new Repository(disk, seed);
  const local = guest.open(); store.addTodo(local, 'מקומי'); guest.save(local);
  const a = new Repository(disk, seed, 'project', 'alice');
  const sa = a.open(); store.addTodo(sa, 'אליס'); a.save(sa);
  const b = new Repository(disk, seed, 'project', 'bob');
  assert.deepEqual(b.open().todos.map(t => t.title), ['מקומי']);
  const reloaded = new Repository(disk, seed, 'project', 'alice');
  assert.deepEqual(reloaded.open().todos.map(t => t.title), ['מקומי', 'אליס']);
  assert.equal(reloaded.read().base, null);
  assert.deepEqual(guest.read().state.todos.map(t => t.title), ['מקומי']);
});

test('malformed stored documents are preserved rather than overwritten', () => {
  const disk = storage();
  disk.setItem('groceries-v1', '{bad');
  assert.throws(() => new Repository(disk, seed).open());
  assert.equal(disk.getItem('groceries-v1'), '{bad');
  assert.equal(disk.getItem('groceries-corrupt-backup'), '{bad');
});
