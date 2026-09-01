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
  const passwordHash = options.passwordHash ?? process.env.AUTH_PASSWORD_HASH ?? '';
  const secret = options.secret ?? process.env.AUTH_SECRET ?? '';

  if (enabled && (!passwordHash || !secret)) {
    throw new Error(
      'Authentifizierung ist aktiv, aber AUTH_PASSWORD_HASH und/oder AUTH_SECRET fehlen. ' +
        'Lege ein Passwort mit "node scripts/set-password.js <passwort>" an und trage die ' +
        'Werte in backend/.env ein.'
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

  function isAuthenticated(req) {
    if (!enabled) return true;
    return !!verifyToken(req.cookies?.[COOKIE_NAME], secret);
  }

  function requireAuth(req, res, next) {
    if (isAuthenticated(req)) return next();
    return res.status(401).json({ error: 'Nicht angemeldet.' });
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
    if (!verifyPassword(password, passwordHash)) {
      throttle.fail(ip);
      return res.status(401).json({ error: 'Falsches Passwort.' });
    }
    throttle.reset(ip);
    const now = Date.now();
    const token = signToken({ iat: now, exp: now + COOKIE_MAX_AGE }, secret);
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
    if (!enabled) return next();
    const cookies = parseCookieHeader(socket.handshake.headers.cookie);
    if (verifyToken(cookies[COOKIE_NAME], secret)) return next();
    next(new Error('unauthorized'));
  }

  return { enabled, requireAuth, router, socketMiddleware };
}

module.exports = { createAuth, verifyPassword, signToken, verifyToken, COOKIE_NAME };
