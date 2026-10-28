import { test } from 'node:test';
import assert from 'node:assert/strict';
import { equal, mergeDocuments, syncDocument } from '../sync.js';

test('JSON object key ordering from PostgreSQL does not mark synchronized data as pending', () => {
  assert.equal(equal({ a: 1, b: [{ x: 2, y: 3 }] }, { b: [{ y: 3, x: 2 }], a: 1 }), true);
  assert.equal(equal({ a: 1 }, { a: 2 }), false);
});

const doc = () => ({ version: 1, categories: [{ id: 'c', name: 'כללי', order: 0 }],
  items: [{ id: 'i', name: 'חלב', categoryId: 'c', lastQty: 1 }], list: [], todos: [] });

test('independent offline edits on two devices survive, including separate fields of one item', () => {
  const base = doc(), local = doc(), remote = doc();
  local.items[0].name = 'חלב שיבולת שועל';
  remote.items[0].lastQty = 3;
  local.todos.push({ id: 'a', title: 'מקומי', done: false });
  remote.todos.push({ id: 'b', title: 'מרוחק', done: true });
  const merged = mergeDocuments(base, local, remote);
  assert.deepEqual(merged.items, [{ id: 'i', name: 'חלב שיבולת שועל', categoryId: 'c', lastQty: 3 }]);
  assert.deepEqual(new Set(merged.todos.map(t => t.id)), new Set(['a', 'b']));
});

test('deletions win against stale edits and remove orphaned list entries', () => {
  const base = doc(), local = doc(), remote = doc();
  base.list = local.list = remote.list = [{ itemId: 'i', qty: 2 }];
  local.items[0].name = 'עריכה';
  remote.items = [];
  const merged = mergeDocuments(base, local, remote);
  assert.deepEqual(merged.items, []);
  assert.deepEqual(merged.list, []);
});

test('local field changes win a conflict but unchanged fields follow remote values', () => {
  const base = doc(), local = doc(), remote = doc();
  local.items[0].name = 'מקומי'; remote.items[0].name = 'מרוחק';
  remote.categories[0].name = 'חדש';
  const merged = mergeDocuments(base, local, remote);
  assert.equal(merged.items[0].name, 'מקומי');
  assert.equal(merged.categories[0].name, 'חדש');
});

test('revision collision retries against the latest remote snapshot', async () => {
  const initial = doc();
  const local = doc(); local.todos = [{ id: 'a', title: 'א', done: false }];
  let envelope = { base: initial, state: local };
  let remote = { revision: 1, document: doc() }, writes = 0;
  await syncDocument({ readLocal: () => envelope, writeLocal: value => { envelope = value; },
    readRemote: async () => structuredClone(remote),
    writeRemote: async (document, revision) => {
      assert.equal(revision, remote.revision);
      if (writes++ === 0) {
        remote = { revision: 2, document: { ...doc(), todos: [{ id: 'b', title: 'ב', done: false }] } };
        return null;
      }
      remote = { revision: revision + 1, document }; return remote;
    } });
  assert.equal(writes, 2);
  assert.deepEqual(new Set(remote.document.todos.map(t => t.id)), new Set(['a', 'b']));
  assert.deepEqual(envelope.state, envelope.base);
});

test('network failure retains pending changes and edits made during a save stay pending', async () => {
  let envelope = { base: doc(), state: { ...doc(), todos: [{ id: 'a', title: 'א', done: false }] } };
  const before = structuredClone(envelope);
  await assert.rejects(syncDocument({ readLocal: () => envelope, writeLocal: v => { envelope = v; },
    readRemote: async () => { throw new Error('offline'); } }));
  assert.deepEqual(envelope, before);
  await syncDocument({ readLocal: () => envelope, writeLocal: v => { envelope = v; },
    readRemote: async () => ({ revision: 1, document: doc() }),
    writeRemote: async document => {
      envelope.state.todos.push({ id: 'b', title: 'ב', done: false });
      return { revision: 2, document };
    } });
  assert.deepEqual(envelope.base.todos.map(t => t.id), ['a']);
  assert.deepEqual(envelope.state.todos.map(t => t.id), ['a', 'b']);
});

test('projects created on two devices are both kept', () => {
  const base = doc();
  const local = { ...doc(), projects: [{ id: 'p1', name: 'שיפוץ', order: 0, done: false }] };
  const remote = { ...doc(), projects: [{ id: 'p2', name: 'עבודה', order: 1, done: false }] };
  const merged = mergeDocuments(base, local, remote);
  assert.deepEqual(new Set(merged.projects.map(p => p.id)), new Set(['p1', 'p2']));
});

test('marking and unmarking an item as bought both reach the other device', () => {
  const base = doc(), local = doc(), remote = doc();
  base.list = [{ itemId: 'i', qty: 2, bought: true }];
  local.list = [{ itemId: 'i', qty: 2, bought: false }];
  remote.list = [{ itemId: 'i', qty: 2, bought: true }];
  assert.equal(mergeDocuments(base, local, remote).list[0].bought, false);
  base.list = [{ itemId: 'i', qty: 2 }];
  local.list = [{ itemId: 'i', qty: 2, bought: true }];
  remote.list = [{ itemId: 'i', qty: 3 }];
  assert.deepEqual(mergeDocuments(base, local, remote).list, [{ itemId: 'i', qty: 3, bought: true }]);
});
