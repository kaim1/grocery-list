// Three-way merge: unchanged fields follow the server; local edits win ties.
export function equal(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && equal(a[k], b[k]));
}

export function mergeDocuments(base, local, remote) {
  const merged = { version: 1 };
  for (const collection of ['categories', 'items', 'list', 'todos']) {
    const key = collection === 'list' ? 'itemId' : 'id';
    const index = doc => new Map((doc?.[collection] || []).map(row => [row[key], row]));
    const b = index(base), l = index(local), r = index(remote);
    merged[collection] = [];
    for (const id of new Set([...r.keys(), ...l.keys()])) {
      const old = b.get(id), left = l.get(id), right = r.get(id);
      if (old && (!left || !right)) continue; // Do not resurrect deleted rows.
      if (!left || !right) { merged[collection].push(structuredClone(left || right)); continue; }
      const row = { ...right };
      for (const field of Object.keys(left)) {
        if (!equal(left[field], old?.[field])) row[field] = left[field];
      }
      merged[collection].push(row);
    }
  }
  const categories = new Set(merged.categories.map(c => c.id));
  merged.items = merged.items.filter(i => categories.has(i.categoryId));
  const items = new Set(merged.items.map(i => i.id));
  merged.list = merged.list.filter(e => items.has(e.itemId));
  return merged;
}

export async function syncDocument({ readLocal, writeLocal, readRemote, writeRemote }) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const remote = await readRemote();
    const local = structuredClone(readLocal());
    // First connection to an existing cloud account never overwrites it with device defaults.
    const next = remote
      ? (local.base ? mergeDocuments(local.base, local.state, remote.document) : remote.document)
      : local.state;
    const saved = remote && equal(next, remote.document)
      ? remote : await writeRemote(next, remote?.revision || 0);
    if (!saved) continue; // Another device won the revision race. Read and merge again.
    const latest = readLocal();
    writeLocal({ base: saved.document,
      state: mergeDocuments(local.state, latest.state, saved.document) });
    return;
  }
  throw new Error('הרשימה השתנתה במכשיר אחר. הסנכרון ינסה שוב.');
}
