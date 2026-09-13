import { CLOUD_CONFIG } from './cloud-config.js';
import { Cloud } from './cloud.js';
import { Repository, validated } from './persistence.js';
import { equal, mergeDocuments, syncDocument } from './sync.js';
import { SEED } from './seed.js';

export function initializeAccount(onState) {
  const cloud = new Cloud(CLOUD_CONFIG, localStorage);
  const status = document.getElementById('sync-status');
  const main = document.querySelector('main');
  const panel = document.getElementById('account-panel');
  const message = document.getElementById('account-message');
  let repo, working = false, rerun = false, timer;
  const setStatus = text => { status.textContent = text; };
  const owner = () => cloud.configured ? cloud.session?.user.id : null;

  function updateAccount() {
    const session = cloud.session;
    document.getElementById('account-email').textContent = session?.user.email || '';
    document.getElementById('account-login').hidden = !cloud.configured || Boolean(session);
    document.getElementById('account-connected').hidden = !session;
    document.getElementById('cloud-unconfigured').hidden = cloud.configured;
    document.getElementById('btn-account').textContent = session ? 'החשבון שלי' : 'סנכרון בין מכשירים';
  }

  function idleStatus() {
    if (!repo.owner) return setStatus('שמירה במכשיר בלבד');
    const envelope = repo.read();
    main.inert = !envelope.base;
    if (!navigator.onLine) setStatus('אין חיבור — השינויים ממתינים במכשיר');
    else setStatus(equal(envelope.base, envelope.state) ? 'נשמר בענן' : 'ממתין לסנכרון');
  }

  function boot() {
    clearTimeout(timer);
    repo = new Repository(localStorage, SEED, cloud.url, owner());
    main.inert = false;
    updateAccount();
    try { onState(repo.open()); idleStatus(); schedule(0); }
    catch (error) { main.inert = true; setStatus(error.message); }
  }

  function schedule(delay = 500) {
    clearTimeout(timer);
    timer = setTimeout(synchronize, delay);
  }

  async function synchronize() {
    if (!repo?.owner || !cloud.configured) return;
    if (!navigator.onLine) { idleStatus(); return; }
    if (working) { rerun = true; return; }
    working = true;
    const current = repo;
    const assertCurrent = () => {
      if (current !== repo || owner() !== current.owner) throw new Error('החשבון השתנה');
    };
    setStatus('מסנכרן…');
    try {
      await syncDocument({
        readLocal: () => { assertCurrent(); return current.read(); },
        writeLocal: envelope => { assertCurrent(); onState(current.write(envelope)); },
        readRemote: async () => {
          assertCurrent();
          const result = await cloud.readDocument(current.owner);
          if (result) result.document = validated(result.document, SEED);
          return result;
        },
        writeRemote: async (document, revision) => {
          assertCurrent();
          const result = await cloud.writeDocument(document, revision, current.owner);
          if (result) result.document = validated(result.document, SEED);
          return result;
        },
      });
      if (current === repo) idleStatus();
    } catch (error) {
      if (current === repo) setStatus(`לא סונכרן — ${error.message}`);
    } finally {
      working = false;
      if (rerun) { rerun = false; schedule(); }
    }
  }

  document.getElementById('btn-account').onclick = () => { updateAccount(); panel.showModal(); };
  document.getElementById('btn-account-close').onclick = () => panel.close();
  panel.onclick = event => { if (event.target === panel) panel.close(); };
  const runAction = async (button, action) => {
    button.disabled = true;
    message.textContent = '';
    try { await action(); }
    catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
  };
  const loginButtons = [document.getElementById('btn-send-code'), document.getElementById('btn-verify-link')];
  const linkInput = document.getElementById('login-link');
  let loginBusy = false;
  const runLoginAction = async (button, action) => {
    if (loginBusy) return;
    loginBusy = true;
    loginButtons.forEach(item => { item.disabled = true; });
    try { await runAction(button, action); }
    finally {
      loginBusy = false;
      loginButtons.forEach(item => { item.disabled = false; });
    }
  };
  panel.addEventListener('close', () => { linkInput.value = ''; });
  document.getElementById('send-code-form').onsubmit = event => {
    event.preventDefault();
    runLoginAction(document.getElementById('btn-send-code'), async () => {
      const email = document.getElementById('login-email').value.trim();
      try { await cloud.sendLink(email, `${location.origin}${location.pathname}`); }
      catch (error) {
        if (error.status === 429) throw new Error('הגעתם למגבלת שליחת המיילים. המתינו לפני בקשת קישור נוסף.');
        throw error;
      }
      message.textContent = `קישור התחברות נשלח אל ${email}. העתיקו אותו מהמייל בלי לפתוח אותו והדביקו בשדה הקישור כאן.`;
      linkInput.focus();
    });
  };
  document.getElementById('paste-link-form').onsubmit = event => {
    event.preventDefault();
    runLoginAction(document.getElementById('btn-verify-link'), async () => {
      const value = linkInput.value;
      linkInput.value = '';
      await cloud.consumeEmailLink(value);
      history.replaceState(null, '', `${location.pathname}${location.search}`);
      boot();
      panel.close();
    });
  };
  document.getElementById('btn-sign-out').onclick = event => runAction(event.target, async () => {
    const pending = !equal(repo.read().base, repo.read().state);
    if (pending && !confirm('יש שינויים שטרם נשמרו בענן. הם יישמרו במכשיר עד להתחברות הבאה לאותו חשבון. להתנתק?')) return;
    const request = cloud.signOut();
    boot();
    await request;
    panel.close();
  });
  document.getElementById('btn-sync-now').onclick = () => { schedule(0); panel.close(); };
  document.getElementById('btn-migrate-device').onclick = event => runAction(event.target, async () => {
    if (!repo.read().base) throw new Error('יש להמתין לטעינת הנתונים מהענן לפני הייבוא');
    if (!confirm('למזג את הרשימה והמשימות המקומיות הישנות לחשבון הזה?')) return;
    const legacy = new Repository(localStorage, SEED).read().state;
    const current = repo.read();
    onState(repo.write({ ...current, state: mergeDocuments(null, legacy, current.state) }));
    idleStatus(); schedule(0); panel.close();
  });

  window.addEventListener('online', () => schedule(0));
  window.addEventListener('offline', () => { try { idleStatus(); } catch (e) { setStatus(e.message); } });
  window.addEventListener('focus', () => schedule(0));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(0); });
  setInterval(() => { if (!document.hidden) schedule(0); }, 15000);
  window.addEventListener('storage', event => {
    if (event.key === cloud.sessionKey && owner() !== repo.owner) { boot(); return; }
    if (event.key === repo.key) {
      try { const latest = repo.read(); repo.view = structuredClone(latest.state); onState(latest.state); idleStatus(); }
      catch (error) { setStatus(error.message); }
    }
  });

  const callback = new URLSearchParams(location.hash.slice(1));
  if (['access_token', 'refresh_token', 'error', 'error_code'].some(key => callback.has(key))) {
    main.inert = true;
    setStatus('משלים התחברות…');
    cloud.consumeRedirect(location.href).then(consumed => {
      if (consumed) history.replaceState(null, '', `${location.pathname}${location.search}`);
      boot();
    }).catch(error => {
      boot();
      setStatus(`ההתחברות נכשלה — ${error.message}`);
      message.textContent = error.message;
      panel.showModal();
    });
  } else boot();
  return {
    save(state) {
      if (owner() !== repo.owner) { boot(); throw new Error('החשבון השתנה. נסו שוב.'); }
      try { const next = repo.save(state); idleStatus(); schedule(); return next; }
      catch (error) {
        setStatus('השינוי לא נשמר במכשיר. פנו מקום ונסו שוב.');
        onState(structuredClone(repo.view));
        throw error;
      }
    },
  };
}
