// send-reminders — called every minute by pg_cron (see ../../reminders.sql). Deploy with --no-verify-jwt.
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (see ../../REMINDERS-SETUP.md).
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { dueReminders } from './due.js';

webpush.setVapidDetails(
  'https://kaim1.github.io/grocery-list/',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async () => {
  const now = new Date();
  // Reads every document: the app has a handful of users, and a reminder can be set long in advance.
  const { data: rows, error } = await db.from('grocery_documents').select('user_id, document');
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0;
  for (const reminder of dueReminders(rows ?? [], now)) {
    // Claim it first; a second run that loses the race gets no row back and skips it.
    const { data: claimed, error: claimError } = await db.from('sent_reminders')
      .upsert({ user_id: reminder.user_id, todo_id: reminder.todo_id, remind_at: reminder.remind_at },
        { onConflict: 'user_id,todo_id,remind_at', ignoreDuplicates: true })
      .select();
    if (claimError || !claimed?.length) continue;

    const { data: devices } = await db.from('push_subscriptions')
      .select('endpoint, p256dh, auth').eq('user_id', reminder.user_id);
    for (const device of devices ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          JSON.stringify(reminder.payload), { TTL: 60 * 60, urgency: 'high' });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.from('push_subscriptions').delete().eq('endpoint', device.endpoint);
        }
      }
    }
  }
  return Response.json({ sent });
});
