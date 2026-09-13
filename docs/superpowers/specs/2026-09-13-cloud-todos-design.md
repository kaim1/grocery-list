# Persistent groceries and tasks

The existing static Hebrew PWA gains a tasks tab and authenticated cloud storage backed by the configured Supabase project.

- Keep the existing HTML/CSS/ES modules and offline application shell.
- Store tasks as `{ id, title, done }`; accept old backups without tasks.
- Use passwordless email magic-link authentication, PostgreSQL and owner-only row level security.
- Keep a per-account local working copy and last acknowledged cloud snapshot for offline editing. The cloud database is the durable copy after synchronization succeeds.
- Fetch on login, reconnection, focus and every 15 seconds while visible. Compare-and-swap revisions prevent whole-document overwrites. Three-way merge retains independent row/field edits; local edits win competing edits to the same field, deletion wins over editing a deleted row.
- Existing cloud data takes precedence on first connection. An explicit import action merges this device's old local data. New accounts upload existing device data automatically only when no cloud document exists.
- Display pending, synchronized, offline and error states truthfully. Preserve unsent changes on failures, reload and logout. Separate account working copies to prevent uploading another account's data.
- Do not cache authentication or database requests in the service worker.

Validation: existing store tests, tasks migration tests, merge and persistence tests, transport tests, browser interaction smoke test. Live authentication, RLS and cross-device verification require a configured cloud project.
