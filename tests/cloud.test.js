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

test('first-time signup links are consumed like returning-user magic links', async () => {
  const cloud = new Cloud(config, storage(), async () => Response.json({ id: 'new-owner', email: 'new@example.com' }));
  const consumed = await cloud.consumeRedirect(
    'https://kaim1.github.io/grocery-list/#access_token=signup-access&refresh_token=signup-refresh&expires_in=3600&type=signup');
  assert.equal(consumed, true);
  assert.equal(cloud.session.user.id, 'new-owner');
});
