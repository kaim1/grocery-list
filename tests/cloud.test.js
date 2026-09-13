import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cloud } from '../cloud.js';

function storage() {
  const values = new Map();
  return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
}
const session = { access_token: 'access', refresh_token: 'refresh', expires_at: 9999999999, user: { id: 'owner', email: 'a@example.com' } };
const config = { url: 'https://example.supabase.co', publicKey: 'sb_publishable_test' };

test('OTP verification persists a session and authenticated database requests carry its token', async () => {
  const cloud = new Cloud(config, storage(), async (url, options) => {
    if (url.endsWith('/verify')) {
      assert.deepEqual(JSON.parse(options.body), { email: 'a@example.com', token: '123456', type: 'email' });
      return Response.json(session);
    }
    assert.equal(options.headers.Authorization, 'Bearer access');
    assert.equal(options.headers.apikey, 'sb_publishable_test');
    assert.equal(options.cache, 'no-store');
    return Response.json([]);
  });
  await cloud.verify('a@example.com', '123456');
  assert.equal(cloud.session.user.id, 'owner');
  assert.equal(await cloud.readDocument('owner'), null);
});

test('revision conflicts return null and API errors are not treated as saved', async () => {
  let fail = false;
  const cloud = new Cloud(config, storage(), async url => {
    if (url.endsWith('/verify')) return Response.json(session);
    return fail ? Response.json({ message: 'denied' }, { status: 403 }) : Response.json([]);
  });
  await cloud.verify('a@example.com', '123456');
  assert.equal(await cloud.writeDocument({ version: 1 }, 2, 'owner'), null);
  fail = true;
  await assert.rejects(cloud.writeDocument({}, 2, 'owner'), /denied/);
});

test('expired sessions refresh before fetching and never issue requests for a different owner', async () => {
  let refreshes = 0;
  const cloud = new Cloud(config, storage(), async (url, options) => {
    if (url.endsWith('/verify')) return Response.json({ ...session, expires_at: 1 });
    if (url.includes('/token?')) {
      refreshes++;
      assert.deepEqual(JSON.parse(options.body), { refresh_token: 'refresh' });
      return Response.json({ ...session, access_token: 'renewed' });
    }
    assert.equal(options.headers.Authorization, 'Bearer renewed');
    return Response.json([]);
  });
  await cloud.verify('a@example.com', '123456');
  await cloud.readDocument('owner');
  assert.equal(refreshes, 1);
  await assert.rejects(cloud.readDocument('someone-else'), /החשבון השתנה/);
});

test('magic-link request includes the exact app URL so login returns to the initiating device', async () => {
  const cloud = new Cloud(config, storage(), async (url, options) => {
    const requestUrl = new URL(url);
    assert.equal(requestUrl.origin + requestUrl.pathname, 'https://example.supabase.co/auth/v1/otp');
    // Supabase Auth reads redirect_to from the query, not email_redirect_to in JSON.
    assert.equal(requestUrl.searchParams.get('redirect_to'), 'https://kaim1.github.io/grocery-list/');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), {
      email: 'a@example.com', create_user: true,
    });
    return Response.json({});
  });
  await cloud.sendLink('a@example.com', 'https://kaim1.github.io/grocery-list/');
});

test('magic-link redirect becomes a persisted session after fetching its user', async () => {
  const disk = storage();
  const cloud = new Cloud(config, disk, async (url, options) => {
    assert.equal(url, 'https://example.supabase.co/auth/v1/user');
    assert.equal(options.headers.Authorization, 'Bearer linked-access');
    return Response.json({ id: 'owner', email: 'a@example.com' });
  });
  const consumed = await cloud.consumeRedirect(
    'https://kaim1.github.io/grocery-list/#access_token=linked-access&refresh_token=linked-refresh&expires_in=3600&type=magiclink');
  assert.equal(consumed, true);
  assert.equal(cloud.session.user.id, 'owner');
  assert.equal(cloud.session.refresh_token, 'linked-refresh');
});

test('ordinary app URLs are not mistaken for authentication redirects', async () => {
  let requests = 0;
  const cloud = new Cloud(config, storage(), async () => { requests++; return Response.json({}); });
  assert.equal(await cloud.consumeRedirect('https://kaim1.github.io/grocery-list/#screen=todos'), false);
  assert.equal(requests, 0);
  assert.equal(cloud.session, null);
});

test('expired email links report an error without requests or changing an existing session', async () => {
  const disk = storage();
  const cloud = new Cloud(config, disk, async () => { throw new Error('Unexpected network request'); });
  cloud.saveSession(structuredClone(session));
  await assert.rejects(cloud.consumeRedirect(
    'https://kaim1.github.io/grocery-list/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'),
  /קישור ההתחברות אינו תקף או שפג תוקפו/);
  assert.equal(cloud.session.access_token, session.access_token);
});

test('incomplete login links report an error instead of silently opening guest mode', async () => {
  const cloud = new Cloud(config, storage(), async () => { throw new Error('Unexpected network request'); });
  for (const fragment of ['access_token=only-access', 'refresh_token=only-refresh']) {
    await assert.rejects(cloud.consumeRedirect(`https://kaim1.github.io/grocery-list/#${fragment}`), /קישור ההתחברות אינו שלם/);
  }
  assert.equal(cloud.session, null);
});

test('first-time signup links are consumed like returning-user magic links', async () => {
  const cloud = new Cloud(config, storage(), async () => Response.json({ id: 'new-owner', email: 'new@example.com' }));
  const consumed = await cloud.consumeRedirect(
    'https://kaim1.github.io/grocery-list/#access_token=signup-access&refresh_token=signup-refresh&expires_in=3600&type=signup');
  assert.equal(consumed, true);
  assert.equal(cloud.session.user.id, 'new-owner');
});

test('pasted email links verify directly, persist across reloads, and authorize sync', async () => {
  for (const type of ['magiclink', 'signup']) {
    const disk = storage();
    const calls = [];
    const fetcher = async (url, options) => {
      calls.push(url);
      if (url.endsWith('/verify')) {
        assert.equal(options.method, 'POST');
        assert.deepEqual(JSON.parse(options.body), { token_hash: 'email-token-hash', type });
        return Response.json(session);
      }
      assert.equal(options.headers.Authorization, 'Bearer access');
      return Response.json([]);
    };
    const cloud = new Cloud(config, disk, fetcher);
    await cloud.consumeEmailLink(`  ${config.url}/auth/v1/verify?token=email-token-hash&type=${type}&redirect_to=https%3A%2F%2Fexample.org  `);
    const reloaded = new Cloud(config, disk, fetcher);
    assert.equal(reloaded.session.user.id, 'owner');
    await reloaded.readDocument('owner');
    assert.deepEqual(calls, [
      `${config.url}/auth/v1/verify`,
      `${config.url}/rest/v1/grocery_documents?select=document,revision&user_id=eq.owner`,
    ]);
  }
});

test('untrusted or malformed pasted links never make a request or alter saved data', async () => {
  const disk = storage();
  disk.setItem('groceries-v1', 'local-list-backup');
  const cloud = new Cloud(config, disk, async () => { throw new Error('Unexpected network request'); });
  cloud.saveSession(structuredClone(session));
  const base = `${config.url}/auth/v1/verify`;
  for (const value of [
    '', 'not a URL', 'javascript:alert(1)',
    'https://elsewhere.example/auth/v1/verify?token=secret&type=magiclink',
    'https://example.supabase.co.evil.example/auth/v1/verify?token=secret&type=magiclink',
    'http://example.supabase.co/auth/v1/verify?token=secret&type=magiclink',
    'https://user:password@example.supabase.co/auth/v1/verify?token=secret&type=magiclink',
    `${config.url}/wrong?token=secret&type=magiclink`,
    `${base}?type=magiclink`, `${base}?token=secret`,
    `${base}?token=secret&type=recovery`, `${base}?token=secret&type=invite`,
    `${base}?token=secret&type=email_change`, `${base}?token=secret&type=magiclink#fragment`,
    `${base}?token=secret&token=other&type=magiclink`,
    `${base}?token=secret&type=magiclink&type=signup`,
    `${base}?token=has%20spaces&type=magiclink`,
    'https://kaim1.github.io/grocery-list/#access_token=secret&refresh_token=secret',
  ]) await assert.rejects(cloud.consumeEmailLink(value), /קישור ההתחברות המקורי/);
  assert.equal(cloud.session.access_token, 'access');
  assert.equal(disk.getItem('groceries-v1'), 'local-list-backup');
});

test('expired pasted links and failed authentication do not replace the session or expose the link', async () => {
  for (const [result, status, expected] of [
    [{ error_code: 'otp_expired', msg: 'secret-token-hash' }, 403, /הקישור כבר נוצל/],
    [{ message: 'secret-token-hash' }, 429, /יותר מדי ניסיונות/],
    [{ message: 'secret-token-hash' }, 500, /לא הצלחנו לאמת/],
  ]) {
    const cloud = new Cloud(config, storage(), async () => Response.json(result, { status }));
    cloud.saveSession(structuredClone(session));
    await assert.rejects(cloud.consumeEmailLink(`${config.url}/auth/v1/verify?token=secret-token-hash&type=magiclink`), error => {
      assert.match(error.message, expected);
      assert.ok(!error.message.includes('secret-token-hash'));
      return true;
    });
    assert.equal(cloud.session.user.id, 'owner');
  }
});

test('pasted link reports failure if the verified session cannot be saved on the device', async () => {
  const disk = storage();
  disk.setItem = () => { throw new Error('Storage unavailable'); };
  const cloud = new Cloud(config, disk, async () => Response.json(session));
  await assert.rejects(cloud.consumeEmailLink(`${config.url}/auth/v1/verify?token=hash&type=magiclink`), /לא הצלחנו לשמור את ההתחברות במכשיר/);
  assert.equal(cloud.session, null);
});
