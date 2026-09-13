# Cloud storage and tasks implementation plan

**Goal:** Persist groceries and tasks in an authenticated cloud database and synchronize device changes.

**Architecture:** Static ES modules, Supabase REST auth/data API, owner-only document with revision checks, and a local offline working copy. Pure three-way merging is separate from transport and UI.

**Spec:** `docs/superpowers/specs/2026-09-13-cloud-todos-design.md`

## Tasks

- [x] Extend `store.js` with todo operations and old-backup migration. Verify `node --test tests/todos.test.js` fails before implementing and passes afterward.
- [x] Add Hebrew tasks UI to `index.html`, `app.js`, `style.css`; preserve grocery behavior.
- [x] Add `sync.js` with field-level three-way merge and revision retry. Test independent additions, edits, deletion, offline failures and edits during in-flight saves.
- [x] Add `cloud.js`, `cloud-config.js`, `supabase/schema.sql` for email magic links, owner isolation and atomic document updates.
- [x] Wire account controls and status into `app.js`; preserve legacy device data and isolate account caches.
- [x] Update `sw.js` and document the Supabase setup and remaining live verification.
- [ ] Run the complete Node suite, syntax checks and browser smoke tests.
