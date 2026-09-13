// Supabase REST boundary. Public keys are safe to ship; authorization is enforced in SQL.
export class Cloud {
  constructor(config, storage, fetcher = globalThis.fetch.bind(globalThis)) {
    this.url = config.url.replace(/\/$/, '');
    this.key = config.publicKey;
    this.storage = storage;
    this.fetcher = fetcher;
    this.sessionKey = `groceries-auth:${this.url}`;
  }

  get configured() { return Boolean(this.url && this.key); }
  get session() {
    try {
      const value = JSON.parse(this.storage.getItem(this.sessionKey));
      return value?.user?.id && value.access_token && value.refresh_token ? value : null;
    } catch { return null; }
  }

  saveSession(value) {
    if (!value?.user?.id || !value.access_token || !value.refresh_token) throw new Error('ההתחברות לא הושלמה');
    value.expires_at ||= Math.floor(Date.now() / 1000) + value.expires_in;
    this.storage.setItem(this.sessionKey, JSON.stringify(value));
    return value;
  }

  async request(path, body, token) {
    if (!this.configured) throw new Error('הסנכרון בענן עדיין לא הוגדר');
    const headers = { apikey: this.key, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await this.fetcher(`${this.url}${path}`, {
      method: body === undefined ? 'GET' : 'POST', headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    let result;
    try { result = text ? JSON.parse(text) : null; } catch { throw new Error('תגובה לא תקינה מהשרת'); }
    if (!response.ok) {
      const error = new Error(result?.msg || result?.message || result?.error_description || 'הבקשה נכשלה. נסו שוב.');
      error.status = response.status;
      error.code = result?.error_code || result?.code;
      throw error;
    }
    return result;
  }

  async sendCode(email) { await this.request('/auth/v1/otp', { email, create_user: true }); }
  async sendLink(email, redirectTo) {
    await this.request(`/auth/v1/otp?${new URLSearchParams({ redirect_to: redirectTo })}`, {
      email, create_user: true,
    });
  }

  async consumeRedirect(url) {
    const params = new URL(url).hash.slice(1);
    const values = new URLSearchParams(params);
    if (values.has('error') || values.has('error_code')) {
      if (values.get('error_code') === 'otp_expired') {
        throw new Error('קישור ההתחברות אינו תקף או שפג תוקפו. יש לפתוח את הקישור מהמייל האחרון; קישור שכבר נוצל לא יעבוד שוב.');
      }
      throw new Error('שירות ההתחברות דחה את הקישור. ההתחברות לא הושלמה.');
    }
    const accessToken = values.get('access_token');
    const refreshToken = values.get('refresh_token');
    if (!values.has('access_token') && !values.has('refresh_token')) return false;
    if (!accessToken || !refreshToken) throw new Error('קישור ההתחברות אינו שלם. יש לפתוח את הקישור המלא מהמייל.');
    const user = await this.request('/auth/v1/user', undefined, accessToken);
    this.saveSession({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: Number(values.get('expires_in')) || 3600,
      expires_at: Number(values.get('expires_at')) || undefined,
      user,
    });
    return true;
  }

  async verify(email, token) {
    return this.saveSession(await this.request('/auth/v1/verify', { email, token, type: 'email' }));
  }

  async consumeEmailLink(value) {
    const invalid = () => new Error('יש להדביק את קישור ההתחברות המקורי מהמייל של האפליקציה, בלי לפתוח אותו.');
    let link;
    try { link = new URL(value.trim()); } catch { throw invalid(); }
    const endpoint = new URL(`${this.url}/auth/v1/verify`);
    const token = link.searchParams.get('token');
    const type = link.searchParams.get('type');
    // Never navigate to a pasted URL or send its credentials to another host.
    if (link.origin !== endpoint.origin || link.pathname !== endpoint.pathname ||
        link.username || link.password || link.hash ||
        link.searchParams.getAll('token').length !== 1 ||
        link.searchParams.getAll('type').length !== 1 ||
        !token || /\s/.test(token) || token.length > 2048 ||
        !['magiclink', 'signup'].includes(type)) throw invalid();
    let result;
    try {
      // GET /verify calls this field `token`; POST expects the same value as token_hash.
      result = await this.request('/auth/v1/verify', { token_hash: token, type });
    } catch (error) {
      if (error.code === 'otp_expired') {
        throw new Error('הקישור כבר נוצל או שפג תוקפו. בקשו קישור חדש והעתיקו אותו מהמייל בלי לפתוח אותו.');
      }
      if (error.status === 429) throw new Error('בוצעו יותר מדי ניסיונות התחברות. המתינו לפני ניסיון נוסף.');
      throw new Error('לא הצלחנו לאמת את הקישור. בדקו את החיבור לאינטרנט ונסו שוב.');
    }
    try { return this.saveSession(result); }
    catch {
      throw new Error('לא הצלחנו לשמור את ההתחברות במכשיר. ודאו שהדפדפן מאפשר שמירת נתונים ושיש מקום פנוי.');
    }
  }

  async token(owner) {
    const refresh = async () => {
      let session = this.session;
      if (!session || session.user.id !== owner) throw new Error('החשבון השתנה. התחברו מחדש.');
      if (session.expires_at < Date.now() / 1000 + 60) {
        const value = await this.request('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token });
        if (this.session?.user.id !== owner) throw new Error('החשבון השתנה. התחברו מחדש.');
        session = this.saveSession(value);
      }
      return session.access_token;
    };
    // Refresh tokens rotate. Serialize refresh across browser tabs when available.
    if (globalThis.navigator?.locks) return navigator.locks.request(this.sessionKey, refresh);
    this.refreshing ||= refresh().finally(() => { this.refreshing = null; });
    const token = await this.refreshing;
    if (this.session?.user.id !== owner) throw new Error('החשבון השתנה. התחברו מחדש.');
    return token;
  }

  async readDocument(owner) {
    const token = await this.token(owner);
    const rows = await this.request(`/rest/v1/grocery_documents?select=document,revision&user_id=eq.${encodeURIComponent(owner)}`, undefined, token);
    if (!Array.isArray(rows)) throw new Error('תגובה לא תקינה מהשרת');
    return rows[0] || null;
  }

  async writeDocument(document, revision, owner) {
    const token = await this.token(owner);
    const rows = await this.request('/rest/v1/rpc/save_grocery_document', {
      payload: document, expected_revision: revision,
    }, token);
    if (!Array.isArray(rows)) throw new Error('תגובה לא תקינה מהשרת');
    return rows[0] || null;
  }

  async signOut() {
    const session = this.session;
    this.storage.removeItem(this.sessionKey);
    if (session) {
      try { await this.request('/auth/v1/logout?scope=local', {}, session.access_token); }
      catch { /* Device is signed out even if the network is unavailable. */ }
    }
  }
}
