// Authentication: SSO via OpenID Connect (Microsoft Entra ID), break-glass local admin, DB-backed sessions.
import crypto from 'node:crypto';
import { config } from './config.js';
import { db, audit } from './db.js';
import { log } from './log.js';
import { parseCookies, setCookie, redirect, send, readForm, readJson, HttpError, clientIp } from './http.js';

const SID = 'emtv_sid';
const OIDC_COOKIE = 'emtv_oidc';
export const ROLE_LEVEL = { viewer: 1, editor: 2, admin: 3 };

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hmac = (s) => crypto.createHmac('sha256', config.sessionSecret).update(s).digest('base64url');

function signValue(obj) { const p = b64u(JSON.stringify(obj)); return `${p}.${hmac(p)}`; }
function unsignValue(v) {
  if (!v || !v.includes('.')) return null;
  const [p, s] = v.split('.');
  const exp = hmac(p);
  if (s.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(exp))) return null;
  try { return JSON.parse(Buffer.from(p, 'base64url').toString('utf8')); } catch { return null; }
}

// ---------------- Sessions ----------------
export async function createSession(res, req, userId) {
  const id = crypto.randomBytes(32).toString('base64url');
  const expires = Date.now() + config.sessionHours * 3600e3;
  await db.run('INSERT INTO sessions (id, user_id, expires, created_at, ip) VALUES (?, ?, ?, ?, ?)', sha256(id), userId, expires, Date.now(), clientIp(req));
  await db.run('UPDATE users SET last_login = ? WHERE id = ?', Date.now(), userId);
  setCookie(res, SID, id, { maxAge: config.sessionHours * 3600 });
}

export async function getUser(req) {
  if (req._user !== undefined) return req._user;
  req._user = null;
  const sid = parseCookies(req)[SID];
  if (!sid) return null;
  const hid = sha256(sid);
  const row = await db.get(`SELECT s.expires, u.id, u.email, u.name, u.role, u.provider, u.lang, u.active
                          FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`, hid);
  if (!row || row.expires < Date.now() || !row.active) return null;
  // Sliding expiration (refresh at most every 5 minutes)
  const target = Date.now() + config.sessionHours * 3600e3;
  if (target - row.expires > 5 * 60e3) await db.run('UPDATE sessions SET expires = ? WHERE id = ?', target, hid);
  req._user = { id: row.id, email: row.email, name: row.name, role: row.role, provider: row.provider, lang: row.lang };
  return req._user;
}

export async function destroySession(req, res) {
  const sid = parseCookies(req)[SID];
  if (sid) await db.run('DELETE FROM sessions WHERE id = ?', sha256(sid));
  setCookie(res, SID, '', { maxAge: 0 });
}

export function requireRole(role) {
  return async (req) => {
    const u = await getUser(req);
    if (!u) throw new HttpError(401, 'Not authenticated');
    if ((ROLE_LEVEL[u.role] || 0) < ROLE_LEVEL[role]) throw new HttpError(403, 'Forbidden');
    return u;
  };
}

// ---------------- User provisioning ----------------
async function resolveRole(email, existing, tokenRoles) {
  if (config.adminEmails.includes(email.toLowerCase())) return 'admin';
  const rc = config.oidc.roleClaims;
  if (Array.isArray(tokenRoles) && tokenRoles.length) {
    if (tokenRoles.includes(rc.admin)) return 'admin';
    if (tokenRoles.includes(rc.editor)) return 'editor';
    if (tokenRoles.includes(rc.viewer)) return 'viewer';
  }
  if (existing) return existing.role;
  if (!(await db.get("SELECT 1 x FROM users WHERE role = 'admin' AND provider <> 'local' LIMIT 1")) && !config.adminEmails.length) {
    // Very first SSO user becomes admin when no admin list was configured.
    return 'admin';
  }
  return config.newUserRole === 'deny' ? null : (ROLE_LEVEL[config.newUserRole] ? config.newUserRole : 'viewer');
}

async function upsertUser({ email, name, provider, tokenRoles }) {
  const existing = await db.get('SELECT * FROM users WHERE email = ?', email);
  if (existing && !existing.active) return { error: 'disabled' };
  const role = await resolveRole(email, existing, tokenRoles);
  if (!role) return { error: 'not_allowed' };
  if (existing) {
    await db.run('UPDATE users SET name = ?, role = ?, provider = ? WHERE id = ?', name || existing.name, role, provider, existing.id);
    return { id: existing.id, role };
  }
  const id = await db.insert('INSERT INTO users (email, name, role, provider, created_at) VALUES (?, ?, ?, ?, ?)', [email, name || email, role, provider, Date.now()]);
  return { id, role };
}

// ---------------- OIDC ----------------
let discovery = null, discoveryAt = 0;
let jwks = null, jwksAt = 0;

async function getDiscovery() {
  if (discovery && Date.now() - discoveryAt < 24 * 3600e3) return discovery;
  const r = await fetch(`${config.oidc.issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`OIDC discovery failed: ${r.status}`);
  discovery = await r.json(); discoveryAt = Date.now();
  return discovery;
}

async function getKey(kid, force = false) {
  const d = await getDiscovery();
  if (!jwks || force || Date.now() - jwksAt > 3600e3) {
    const r = await fetch(d.jwks_uri, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`JWKS fetch failed: ${r.status}`);
    jwks = await r.json(); jwksAt = Date.now();
  }
  const jwk = jwks.keys.find(k => k.kid === kid);
  if (!jwk && !force) return getKey(kid, true);
  if (!jwk) throw new Error('Signing key not found');
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

async function verifyIdToken(idToken, nonce) {
  const [h, p, s] = idToken.split('.');
  if (!h || !p || !s) throw new Error('Malformed id_token');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  const algs = { RS256: 'sha256', RS384: 'sha384', RS512: 'sha512' };
  if (!algs[header.alg]) throw new Error(`Unsupported alg ${header.alg}`);
  const key = await getKey(header.kid);
  const ok = crypto.verify(algs[header.alg], Buffer.from(`${h}.${p}`), key, Buffer.from(s, 'base64url'));
  if (!ok) throw new Error('Invalid id_token signature');
  const d = await getDiscovery();
  const expectedIss = d.issuer.replace('{tenantid}', claims.tid || '');
  if (claims.iss !== expectedIss) throw new Error(`Unexpected issuer ${claims.iss}`);
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(config.oidc.clientId)) throw new Error('Unexpected audience');
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp && claims.exp < now - 120) throw new Error('id_token expired');
  if (claims.nbf && claims.nbf > now + 120) throw new Error('id_token not yet valid');
  if (claims.nonce !== nonce) throw new Error('Nonce mismatch');
  return claims;
}

const redirectUri = () => `${config.baseUrl}/auth/callback`;
// Only same-site paths. Browsers treat "/\\host" like "//host", so backslashes and control characters are rejected too.
const safeNext = (n) => (typeof n === 'string' && /^\/(?![/\\])/.test(n) && !/[\\\u0000-\u001f]/.test(n) ? n : '/admin/');

export async function oidcLogin(req, res, url) {
  if (!config.oidcEnabled) return redirect(res, '/login?error=sso_disabled');
  const d = await getDiscovery();
  const state = b64u(crypto.randomBytes(24));
  const nonce = b64u(crypto.randomBytes(24));
  const verifier = b64u(crypto.randomBytes(48));
  const challenge = b64u(crypto.createHash('sha256').update(verifier).digest());
  setCookie(res, OIDC_COOKIE, signValue({ state, nonce, verifier, next: safeNext(url.searchParams.get('next')), t: Date.now() }), { maxAge: 600, path: '/auth' });
  const q = new URLSearchParams({
    client_id: config.oidc.clientId, response_type: 'code', redirect_uri: redirectUri(), response_mode: 'query',
    scope: config.oidc.scopes, state, nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account',
  });
  redirect(res, `${d.authorization_endpoint}?${q}`);
}

export async function oidcCallback(req, res, url) {
  const ctx = unsignValue(parseCookies(req)[OIDC_COOKIE]);
  setCookie(res, OIDC_COOKIE, '', { maxAge: 0, path: '/auth' });
  if (url.searchParams.get('error')) {
    log.warn('[oidc] provider error', url.searchParams.get('error'), url.searchParams.get('error_description'));
    return redirect(res, '/login?error=sso_failed');
  }
  if (!ctx || Date.now() - ctx.t > 600e3 || ctx.state !== url.searchParams.get('state')) return redirect(res, '/login?error=state');
  try {
    const d = await getDiscovery();
    const body = new URLSearchParams({
      grant_type: 'authorization_code', code: url.searchParams.get('code') || '', redirect_uri: redirectUri(),
      client_id: config.oidc.clientId, code_verifier: ctx.verifier,
    });
    if (config.oidc.clientSecret) body.set('client_secret', config.oidc.clientSecret);
    const r = await fetch(d.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(15000) });
    const tok = await r.json().catch(() => ({}));
    if (!r.ok || !tok.id_token) throw new Error(`Token exchange failed: ${r.status} ${tok.error || ''} ${tok.error_description || ''}`);
    const claims = await verifyIdToken(tok.id_token, ctx.nonce);
    const email = String(claims.email || claims.preferred_username || claims.upn || '').toLowerCase();
    if (!email) throw new Error('No email claim');
    if (config.allowedDomains.length && !config.allowedDomains.includes(email.split('@')[1])) {
      await audit(email, 'login.denied', 'domain');
      return redirect(res, '/login?error=domain');
    }
    const u = await upsertUser({ email, name: claims.name, provider: 'oidc', tokenRoles: claims.roles });
    if (u.error) { await audit(email, 'login.denied', u.error); return redirect(res, `/login?error=${u.error}`); }
    await createSession(res, req, u.id);
    await audit(email, 'login', { provider: 'oidc', role: u.role });
    redirect(res, ctx.next);
  } catch (e) {
    log.error('[oidc] callback error', e.message);
    redirect(res, '/login?error=sso_failed');
  }
}

// ---------------- Local break-glass admin ----------------
const attempts = new Map();
export async function localLogin(req, res) {
  if (!config.localEnabled) throw new HttpError(404, 'Local login disabled');
  const ip = clientIp(req);
  const a = attempts.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 15 * 60e3) { a.n = 0; a.t = Date.now(); }
  const isJson = (req.headers['content-type'] || '').includes('json');
  if (a.n >= 8) return isJson ? send(res, 429, { error: 'rate' }) : redirect(res, '/login?error=rate');
  const body = isJson ? await readJson(req) : await readForm(req);
  const eq = (x, y) => crypto.timingSafeEqual(crypto.createHash('sha256').update(String(x)).digest(), crypto.createHash('sha256').update(String(y)).digest());
  const okUser = eq(body.username || '', config.localAdmin.user);
  const okPass = eq(body.password || '', config.localAdmin.password);
  if (!(okUser && okPass)) {
    a.n++; attempts.set(ip, a);
    await audit(`local:${body.username || ''}`, 'login.failed', { ip });
    return isJson ? send(res, 401, { error: 'invalid' }) : redirect(res, '/login?error=invalid');
  }
  attempts.delete(ip);
  const email = `local:${config.localAdmin.user}`;
  let row = await db.get('SELECT id, active FROM users WHERE email = ?', email);
  if (!row) {
    const id = await db.insert("INSERT INTO users (email, name, role, provider, created_at) VALUES (?, ?, 'admin', 'local', ?)", [email, 'Local admin', Date.now()]);
    row = { id, active: 1 };
  }
  if (!row.active) return redirect(res, '/login?error=disabled');
  await db.run("UPDATE users SET role = 'admin' WHERE id = ?", row.id);
  await createSession(res, req, row.id);
  await audit(email, 'login', { provider: 'local', ip });
  return isJson ? send(res, 200, { ok: true }) : redirect(res, safeNext(body.next));
}

// ---------------- Login page ----------------
const ERRORS = {
  sso_failed: ['ההתחברות דרך SSO נכשלה. נסו שוב.', 'SSO sign-in failed. Please try again.'],
  sso_disabled: ['SSO עדיין לא הוגדר במערכת.', 'SSO is not configured yet.'],
  state: ['פג תוקף בקשת ההתחברות. נסו שוב.', 'The sign-in request expired. Please try again.'],
  domain: ['החשבון אינו שייך לארגון מורשה.', 'This account is not from an allowed organization.'],
  not_allowed: ['אין לך הרשאה למערכת. פנו למנהל המערכת.', 'You do not have access. Contact the administrator.'],
  disabled: ['המשתמש הושבת.', 'This user is disabled.'],
  invalid: ['שם משתמש או סיסמה שגויים.', 'Invalid username or password.'],
  rate: ['יותר מדי ניסיונות. נסו שוב בעוד 15 דקות.', 'Too many attempts. Try again in 15 minutes.'],
};
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function loginPage(req, res, url) {
  if (await getUser(req)) return redirect(res, safeNext(url.searchParams.get('next')));
  const err = ERRORS[url.searchParams.get('error')];
  const next = esc(safeNext(url.searchParams.get('next')));
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EM Lumen — כניסה</title><link rel="icon" href="/admin/img/icon.svg"><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:"Segoe UI",Arial,sans-serif;background:linear-gradient(135deg,#0b2545,#13315c 55%,#0a6ebd);color:#1b2433}
.card{background:#fff;border-radius:18px;padding:40px 36px;width:min(420px,92vw);box-shadow:0 30px 60px rgba(0,0,0,.25);text-align:center}
.logo{width:64px;height:64px;margin:0 auto 12px}h1{margin:0 0 4px;font-size:24px}p.sub{margin:0 0 28px;color:#5b6576}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:13px 16px;border-radius:10px;border:0;font-size:16px;cursor:pointer;text-decoration:none;font-weight:600}
.sso{background:#0a6ebd;color:#fff}.sso:hover{background:#085a9a}.err{background:#fde8e8;color:#9b1c1c;padding:10px 12px;border-radius:8px;margin-bottom:18px;font-size:14px}
details{margin-top:22px;text-align:start}summary{cursor:pointer;color:#5b6576;font-size:14px}input{width:100%;padding:11px 12px;margin-top:10px;border:1px solid #cfd6e0;border-radius:8px;font-size:15px}
.loc{background:#eef2f7;color:#1b2433;margin-top:12px}.en{direction:ltr;color:#8a93a3;font-size:13px;margin-top:6px}
.notice{margin-top:26px;font-size:12px;color:#8a93a3;line-height:1.5}</style></head><body><div class="card">
<img class="logo" src="/admin/img/icon.svg" alt=""><h1>EM Lumen</h1><p class="sub">מערכת ניהול מסכי תצוגה<span class="en"><br>Digital signage management</span></p>
${err ? `<div class="err">${esc(err[0])}<div class="en">${esc(err[1])}</div></div>` : ''}
${config.oidcEnabled ? `<a class="btn sso" href="/auth/login?next=${encodeURIComponent(safeNext(url.searchParams.get('next')))}"><svg width="20" height="20" viewBox="0 0 23 23"><path fill="#f35325" d="M1 1h10v10H1z"/><path fill="#81bc06" d="M12 1h10v10H12z"/><path fill="#05a6f0" d="M1 12h10v10H1z"/><path fill="#ffba08" d="M12 12h10v10H12z"/></svg> כניסה עם ${esc(config.oidc.displayName)}</a>` : `<div class="err">SSO לא הוגדר עדיין (OIDC_ISSUER / OIDC_CLIENT_ID)<div class="en">SSO is not configured yet</div></div>`}
${config.localEnabled ? `<details ${!config.oidcEnabled || url.searchParams.get('error') === 'invalid' ? 'open' : ''}><summary>כניסת מנהל מקומי (חירום) · Local admin</summary>
<form method="post" action="/auth/local"><input type="hidden" name="next" value="${next}"><input name="username" autocomplete="username" placeholder="שם משתמש / Username" required>
<input name="password" type="password" autocomplete="current-password" placeholder="סיסמה / Password" required><button class="btn loc" type="submit">כניסה · Sign in</button></form></details>` : ''}
<div class="notice">השימוש במערכת מתועד ונתון לביקורת בהתאם למדיניות החברה.<br>Usage is logged and subject to audit per company policy.</div>
</div></body></html>`;
  send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8' });
}
