const crypto = require('crypto');
const express = require('express');

// Single-user authentication. One password guards the whole app; there is no
// user table. On success we hand out a signed, long-lived cookie so the same
// browser stays logged in (see COOKIE_MAX_AGE) — that cookie is the only
// thing the protected REST routes and the Socket.IO handshake will accept.
//
// The password is never stored in plaintext: only a scrypt hash lives in the
// AUTH_PASSWORD_HASH env var (generate it with scripts/set-password.js). The
// session cookie is an HMAC-signed token keyed by AUTH_SECRET, so it cannot be
// forged without knowing that server-side secret.

const COOKIE_NAME = 'scorespace_session';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000; // ~1 year — "remember me"
const DEFAULT_ACCOUNT_ID = '1';

// The accounts recognised from the environment. Account 1 is the original
// AUTH_PASSWORD_HASH; account 2 is the optional AUTH_PASSWORD_HASH_2. An account
// only exists once its hash is present, so an install with just one password
// keeps working unchanged, and adding the second password is exactly what turns
// the second account on.
function envAccounts() {
  const list = [];
  if (process.env.AUTH_PASSWORD_HASH) list.push({ id: '1', passwordHash: process.env.AUTH_PASSWORD_HASH });
  if (process.env.AUTH_PASSWORD_HASH_2) list.push({ id: '2', passwordHash: process.env.AUTH_PASSWORD_HASH_2 });
  return list;
}

// Back-compat: a single `passwordHash` option (used by the tests) maps to the
// primary account; an explicit `accounts` array wins; otherwise read the env.
function resolveAccounts(options) {
  if (Array.isArray(options.accounts)) return options.accounts;
  if (options.passwordHash !== undefined) {
    return [{ id: DEFAULT_ACCOUNT_ID, passwordHash: options.passwordHash }];
  }
  return envAccounts();
}

// --- password hashing (scrypt) -------------------------------------------

// Stored form: "scrypt$<saltHex>$<keyHex>". Verification is constant-time.
function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[1], 'hex');
    expected = Buffer.from(parts[2], 'hex');
  } catch {
    return false;
  }
  if (expected.length === 0) return false;
  let actual;
  try {
    actual = crypto.scryptSync(password, salt, expected.length);
  } catch {
    return false;
  }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// --- token signing (HMAC-SHA256) ------------------------------------------

function signToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token, secret) {
  if (typeof token !== 'string' || !secret) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
  return payload;
}

// --- cookie parsing (for the Socket.IO handshake) -------------------------

function parseCookieHeader(header) {
  const out = {};
  if (typeof header !== 'string') return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

// --- brute-force throttle -------------------------------------------------

// scrypt is already deliberately slow, but a per-IP counter stops someone
// hammering the login endpoint. After MAX failures within WINDOW the IP is
// blocked until the window rolls over; a correct password resets the counter.
function createLoginThrottle({ windowMs = 15 * 60 * 1000, max = 10 } = {}) {
  const failures = new Map(); // ip -> { count, firstAt }
  return {
    blocked(ip) {
      const rec = failures.get(ip);
      if (!rec) return false;
      if (Date.now() - rec.firstAt > windowMs) {
        failures.delete(ip);
        return false;
      }
      return rec.count >= max;
    },
    fail(ip) {
      const rec = failures.get(ip);
      if (!rec || Date.now() - rec.firstAt > windowMs) {
        failures.set(ip, { count: 1, firstAt: Date.now() });
      } else {
        rec.count += 1;
      }
    },
    reset(ip) {
      failures.delete(ip);
    },
  };
}

// --- factory --------------------------------------------------------------

// enabled defaults to true. Tests pass { enabled: false } to run the API
// unguarded; production (index.js) uses the default and therefore requires
// the env vars to be present, so the server can never come up unprotected by
// accident — it fails closed.
function createAuth(options = {}) {
  const enabled = options.enabled !== false;
  const accounts = resolveAccounts(options);
  const accountIds = accounts.map((a) => a.id);
  const secret = options.secret ?? process.env.AUTH_SECRET ?? '';

  // Fail closed: with auth on we need at least one account, every configured
  // account must carry a hash, and the signing secret must be present — so the
  // server can never come up half-configured or unprotected by accident.
  if (enabled && (accounts.length === 0 || accounts.some((a) => !a.passwordHash) || !secret)) {
    throw new Error(
      'Authentifizierung ist aktiv, aber es fehlt mindestens ein Passwort-Hash ' +
        '(AUTH_PASSWORD_HASH) oder AUTH_SECRET. Lege ein Passwort mit ' +
        '"node scripts/set-password.js <passwort>" an und trage die Werte in backend/.env ein.'
    );
  }

  const throttle = createLoginThrottle();

  function cookieOptions(req) {
    return {
      httpOnly: true, // not readable from JS — mitigates XSS token theft
      secure: !!(req && req.secure), // HTTPS-only in prod; off on plain-http localhost
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    };
  }

  // Resolves the session to a valid account id, or null if there is none. A
  // token whose account is unknown (e.g. a second account that was later
  // removed) is treated as invalid, forcing a clean re-login. With auth
  // disabled (tests) everything runs as the primary account.
  function sessionAccount(req) {
    if (!enabled) return DEFAULT_ACCOUNT_ID;
    const payload = verifyToken(req.cookies?.[COOKIE_NAME], secret);
    if (!payload) return null;
    const id = payload.account || DEFAULT_ACCOUNT_ID; // legacy tokens predate the account field
    return accountIds.includes(id) ? id : null;
  }

  function isAuthenticated(req) {
    return sessionAccount(req) !== null;
  }

  function requireAuth(req, res, next) {
    const account = sessionAccount(req);
    if (account === null) return res.status(401).json({ error: 'Nicht angemeldet.' });
    req.account = account; // consumed by the account-context middleware in server.js
    return next();
  }

  const router = express.Router();

  // Lightweight probe used by the frontend on load to decide whether to show
  // the login mask or the app. Never leaks anything beyond a boolean.
  router.get('/session', (req, res) => {
    res.json({ authenticated: isAuthenticated(req) });
  });

  router.post('/login', (req, res) => {
    if (!enabled) return res.json({ authenticated: true });
    const ip = req.ip || 'unknown';
    if (throttle.blocked(ip)) {
      return res.status(429).json({ error: 'Zu viele Fehlversuche. Bitte später erneut versuchen.' });
    }
    const password = req.body?.password;
    // Check every account and never short-circuit, so the response time doesn't
    // reveal which (or whether any) password matched. The matching account's id
    // is what determines which database this session will see.
    let matched = null;
    for (const acc of accounts) {
      if (verifyPassword(password, acc.passwordHash)) matched = acc;
    }
    if (!matched) {
      throttle.fail(ip);
      return res.status(401).json({ error: 'Falsches Passwort.' });
    }
    throttle.reset(ip);
    const now = Date.now();
    const token = signToken({ account: matched.id, iat: now, exp: now + COOKIE_MAX_AGE }, secret);
    res.cookie(COOKIE_NAME, token, cookieOptions(req));
    res.json({ authenticated: true });
  });

  router.post('/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: !!req.secure,
      sameSite: 'lax',
      path: '/',
    });
    res.json({ authenticated: false });
  });

  // Socket.IO handshake guard. Reads the same cookie off the upgrade request;
  // without a valid token the connection is refused before any data flows.
  function socketMiddleware(socket, next) {
    if (!enabled) {
      socket.data.accountId = DEFAULT_ACCOUNT_ID;
      return next();
    }
    const cookies = parseCookieHeader(socket.handshake.headers.cookie);
    const payload = verifyToken(cookies[COOKIE_NAME], secret);
    if (!payload) return next(new Error('unauthorized'));
    const id = payload.account || DEFAULT_ACCOUNT_ID;
    if (!accountIds.includes(id)) return next(new Error('unauthorized'));
    socket.data.accountId = id; // used to join this connection to its account's sync room
    return next();
  }

  return { enabled, requireAuth, router, socketMiddleware, accountIds };
}

module.exports = { createAuth, verifyPassword, signToken, verifyToken, envAccounts, COOKIE_NAME };
