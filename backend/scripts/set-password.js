#!/usr/bin/env node
// Sets an app password by writing backend/.env directly. Usage:
//
//   node scripts/set-password.js "mein-langes-passwort"              # account 1
//   node scripts/set-password.js --account 2 "zweites-passwort"      # account 2
//
// - Account 1's hash is AUTH_PASSWORD_HASH; account 2's is AUTH_PASSWORD_HASH_2.
//   Each account has its own completely independent database. The plaintext is
//   never stored — only a scrypt hash.
// - AUTH_SECRET signs the session cookie. An existing AUTH_SECRET in .env is
//   preserved, so changing a password does NOT log out already-logged-in
//   browsers. A fresh secret is generated only if none exists yet.
// - Each account must have a DIFFERENT password (a shared password would make
//   the login ambiguous); this script refuses to set a duplicate.
//
// After running it, restart the backend:  pm2 restart meinkursheft-backend --update-env

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { verifyPassword } = require('../src/auth');

// --- parse args: an optional "--account <id>" plus the password ------------
const argv = process.argv.slice(2);
let accountId = '1';
const positionals = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--account') {
    accountId = argv[++i];
  } else {
    positionals.push(argv[i]);
  }
}
const password = positionals[0];

if (accountId !== '1' && accountId !== '2') {
  console.error('FEHLER: --account muss 1 oder 2 sein.');
  process.exit(1);
}
if (!password) {
  console.error('Usage: node scripts/set-password.js [--account 1|2] <password>');
  process.exit(1);
}
if (password.length < 12) {
  console.error(
    'Warnung: Das Passwort ist die einzige Schranke der App. Bitte mindestens 12 Zeichen (besser 16+) verwenden.'
  );
}

const envKey = accountId === '1' ? 'AUTH_PASSWORD_HASH' : `AUTH_PASSWORD_HASH_${accountId}`;
const envPath = path.join(__dirname, '..', '.env');

// Read existing .env into an ordered map so we preserve any other settings.
const existing = new Map();
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) existing.set(m[1], m[2]);
  }
}

// Refuse a password that already belongs to another account — otherwise the two
// accounts couldn't be told apart at login.
for (const [k, v] of existing) {
  if (k !== envKey && /^AUTH_PASSWORD_HASH(_\d+)?$/.test(k) && verifyPassword(password, v)) {
    console.error(
      `FEHLER: Dieses Passwort ist bereits einem anderen Account (${k}) zugewiesen. ` +
        'Bitte für jeden Account ein anderes Passwort verwenden.'
    );
    process.exit(1);
  }
}

const salt = crypto.randomBytes(16);
const key = crypto.scryptSync(password, salt, 64);
existing.set(envKey, `scrypt$${salt.toString('hex')}$${key.toString('hex')}`);

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
const prefix = `${envKey}=`;
const writtenLine = fs
  .readFileSync(envPath, 'utf8')
  .split('\n')
  .find((l) => l.startsWith(prefix));
const written = writtenLine ? writtenLine.slice(prefix.length) : '';
if (!verifyPassword(password, written)) {
  console.error('FEHLER: .env geschrieben, aber die Verifikation schlug fehl. Bitte erneut versuchen.');
  process.exit(1);
}

console.log(`✓ Passwort für Account ${accountId} gesetzt und verifiziert in ${envPath}`);
if (secretIsNew) console.log('  (neues AUTH_SECRET erzeugt — es gab noch keins, bestehende Sitzungen sind nicht betroffen)');
console.log('  Jetzt Backend neu starten:  pm2 restart meinkursheft-backend --update-env');
