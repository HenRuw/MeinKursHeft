#!/usr/bin/env node
// Sets the single app password by writing backend/.env directly. Usage:
//
//   node scripts/set-password.js "mein-langes-passwort"
//
// - AUTH_PASSWORD_HASH is the scrypt hash of the password (the plaintext is
//   never stored).
// - AUTH_SECRET signs the session cookie. An existing AUTH_SECRET in .env is
//   preserved, so changing the password does NOT log out already-logged-in
//   browsers. A fresh secret is generated only if none exists yet.
//
// After running it, restart the backend:  pm2 restart scorespace-backend

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { verifyPassword } = require('../src/auth');

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/set-password.js <password>');
  process.exit(1);
}
if (password.length < 12) {
  console.error(
    'Warnung: Das Passwort ist die einzige Schranke der App. Bitte mindestens 12 Zeichen (besser 16+) verwenden.'
  );
}

const envPath = path.join(__dirname, '..', '.env');

// Read existing .env into an ordered map so we preserve any other settings.
const existing = new Map();
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) existing.set(m[1], m[2]);
  }
}

const salt = crypto.randomBytes(16);
const key = crypto.scryptSync(password, salt, 64);
existing.set('AUTH_PASSWORD_HASH', `scrypt$${salt.toString('hex')}$${key.toString('hex')}`);

let secretIsNew = false;
if (!existing.get('AUTH_SECRET')) {
  existing.set('AUTH_SECRET', crypto.randomBytes(32).toString('hex'));
  secretIsNew = true;
}

const body = [...existing.entries()].map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
fs.writeFileSync(envPath, body, { mode: 0o600 });
fs.chmodSync(envPath, 0o600); // owner-only, in case the file already existed

// Read the file back and confirm the stored hash really matches the password
// we were given, so a silent failure can't leave a stale/old password behind.
const written = fs
  .readFileSync(envPath, 'utf8')
  .split('\n')
  .find((l) => l.startsWith('AUTH_PASSWORD_HASH='))
  .slice('AUTH_PASSWORD_HASH='.length);
if (!verifyPassword(password, written)) {
  console.error('FEHLER: .env geschrieben, aber die Verifikation schlug fehl. Bitte erneut versuchen.');
  process.exit(1);
}

console.log(`✓ Passwort gesetzt und verifiziert in ${envPath}`);
if (secretIsNew) console.log('  (neues AUTH_SECRET erzeugt — es gab noch keins, bestehende Sitzungen sind nicht betroffen)');
console.log('  Jetzt Backend neu starten:  pm2 restart scorespace-backend --update-env');
