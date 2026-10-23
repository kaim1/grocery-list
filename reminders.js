// reminders.js — reminder times and Web Push subscription. Push delivery itself runs in Supabase.
import { CLOUD_CONFIG } from './cloud-config.js';
import { dateKey } from './store.js';

export const DEFAULT_TIMES = { morning: '09:00', evening: '18:00' };
const TIMES_KEY = 'reminder-times';
const ASKED_KEY = 'reminders-asked';
const SAVED_KEY = 'push-saved';

export function readTimes(storage = globalThis.localStorage) {
  try { return { ...DEFAULT_TIMES, ...JSON.parse(storage.getItem(TIMES_KEY) || '{}') }; }
  catch { return { ...DEFAULT_TIMES }; }
}

export function writeTimes(times, storage = globalThis.localStorage) {
  storage.setItem(TIMES_KEY, JSON.stringify(times));
}

export function at(key, time) {
  const [y, m, d] = key.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, min);
}

export function hhmm(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// The four one-tap choices, computed from `now` and the user's morning/evening times.
export function presets(now, times) {
  const today = dateKey(now);
  const plusDays = n => dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));
  const inAnHour = new Date(now.getTime() + 60 * 60000);
  inAnHour.setMinutes(Math.ceil(inAnHour.getMinutes() / 5) * 5, 0, 0);
  let evening = at(today, times.evening);
  if (evening <= now) evening = at(plusDays(1), times.evening);
  const daysToSunday = (7 - now.getDay()) % 7 || 7;
  return [
    { id: 'hour', label: 'בעוד שעה', icon: 'clock', date: inAnHour },
    { id: 'evening', label: 'הערב', icon: 'moon', date: evening },
    { id: 'morning', label: 'מחר בבוקר', icon: 'sun', date: at(plusDays(1), times.morning) },
    { id: 'week', label: 'בשבוע הבא', icon: 'cal', date: at(plusDays(daysToSunday), times.morning) },
  ];
}

// Where push stands on this device: 'install' (iPhone outside the home screen), 'unsupported',
// or the browser's permission: 'default', 'granted', 'denied'.
export function pushStatus() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return ios && !standalone ? 'install' : 'unsupported';
  }
  return Notification.permission;
}

export const askedBefore = () => localStorage.getItem(ASKED_KEY) === '1';
export const markAsked = () => localStorage.setItem(ASKED_KEY, '1');
export const subscriptionSaved = () => localStorage.getItem(SAVED_KEY) === '1';

function keyBytes(base64url) {
  const raw = atob(base64url.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

// Subscribe this device and register it with the account. Throws with a Hebrew message on failure.
export async function enablePush(account) {
  if (pushStatus() === 'default' && await Notification.requestPermission() !== 'granted') {
    throw new Error('ההתראות לא אושרו. אפשר להפעיל אותן בהגדרות האייפון.');
  }
  return syncSubscription(account);
}

export async function syncSubscription(account) {
  if (pushStatus() !== 'granted') return false;
  const owner = account.owner();
  if (!owner) throw new Error('כדי לקבל תזכורות צריך להתחבר לחשבון בהגדרות.');
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription() ||
    await registration.pushManager.subscribe({
      userVisibleOnly: true, applicationServerKey: keyBytes(CLOUD_CONFIG.vapidPublicKey),
    });
  try { await account.cloud.savePushSubscription(subscription, owner); }
  catch (error) {
    localStorage.removeItem(SAVED_KEY);
    if (error.status === 404) throw new Error('שרת התזכורות עדיין לא הוגדר. ראו את הוראות ההגדרה.');
    throw error;
  }
  localStorage.setItem(SAVED_KEY, '1');
  return true;
}
