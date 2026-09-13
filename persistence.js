import { load, serialize } from './store.js';
import { mergeDocuments } from './sync.js';

export function validated(document, seed) {
  const result = load(serialize(document), seed);
  if (document == null || result.corrupt) throw new Error('הנתונים אינם תקינים. העותק הקיים נשמר ולא הוחלף.');
  return result.state;
}

export class Repository {
  constructor(storage, seed, namespace, owner) {
    this.storage = storage;
    this.seed = seed;
    this.owner = owner;
    this.key = owner ? `groceries-cloud:${namespace}:${owner}` : 'groceries-v1';
    this.view = null;
  }

  read() {
    const raw = this.storage.getItem(this.key);
    if (!this.owner) {
      const result = load(raw, this.seed);
      if (result.corrupt) {
        this.storage.setItem('groceries-corrupt-backup', raw);
        throw new Error('הגיבוי המקומי אינו תקין. הוא נשמר לשחזור ולא נדרס.');
      }
      // Keep generated seed IDs stable until the first successful write.
      return { base: null, state: raw ? result.state : this.view || result.state };
    }
    if (!raw) {
      const guest = new Repository(this.storage, this.seed);
      return { base: null, state: this.view || guest.read().state };
    }
    let envelope;
    try { envelope = JSON.parse(raw); } catch { throw new Error('העותק המקומי אינו תקין. הנתונים נשמרו לשחזור.'); }
    return { base: envelope.base === null ? null : validated(envelope.base, this.seed),
      state: validated(envelope.state, this.seed) };
  }

  write(envelope) {
    this.storage.setItem(this.key, this.owner ? JSON.stringify(envelope) : serialize(envelope.state));
    this.view = structuredClone(envelope.state);
    return structuredClone(envelope.state);
  }

  open() { return this.write(this.read()); }

  save(state) {
    const latest = this.read();
    const merged = this.view ? mergeDocuments(this.view, state, latest.state) : state;
    return this.write({ ...latest, state: merged });
  }
}
