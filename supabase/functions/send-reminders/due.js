// due.js — which reminders to send now. Pure, so it is tested with node (tests/due.test.js).
export const STALE_MS = 6 * 60 * 60 * 1000;

// rows: [{user_id, document}] from grocery_documents. Returns one entry per reminder that is due:
// not done, at or before `now`, and not older than six hours (a long outage should not flood the phone).
export function dueReminders(rows, now) {
  const due = [];
  for (const { user_id, document } of rows) {
    const projects = new Map((document?.projects || []).map(p => [p.id, p.name]));
    for (const todo of document?.todos || []) {
      if (todo.done || !todo.remindAt) continue;
      const at = Date.parse(todo.remindAt);
      if (Number.isNaN(at) || at > now.getTime() || now.getTime() - at > STALE_MS) continue;
      const project = todo.projectId ? projects.get(todo.projectId) : null;
      due.push({
        user_id, todo_id: todo.id, remind_at: new Date(at).toISOString(),
        payload: { id: todo.id, title: todo.title, body: project ? `${project} · תזכורת` : 'תזכורת' },
      });
    }
  }
  return due;
}
