import { useState } from 'react';
import { api } from '../api.js';
import { colors, fonts } from '../theme.js';

// Simple eye / eye-with-slash glyph. `off` = password currently visible, so
// the icon shows the "hide" (slashed) affordance.
function EyeIcon({ off }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
      {off && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

// The single password mask. On success it calls onLoggedIn so the AuthGate
// swaps in the app; the long-lived session cookie means this is normally only
// seen about once a year (or after an explicit logout).
export default function LoginScreen({ onLoggedIn }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError('');
    try {
      await api.login(password);
      setPassword('');
      onLoggedIn();
    } catch (err) {
      setError(err.message || 'Anmeldung fehlgeschlagen.');
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.sidebarBg,
        fontFamily: fonts.sans,
        padding: 20,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: '100%',
          maxWidth: 340,
          background: colors.cardBg,
          borderRadius: 14,
          padding: 28,
          boxShadow: '0 20px 60px rgba(0,0,0,.35)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div>
          <div style={{ font: `500 22px/1 ${fonts.serif}`, color: colors.ink }}>ScoreSpace</div>
          <div style={{ fontSize: 13, color: colors.mutedStrong, marginTop: 8 }}>
            Bitte Passwort eingeben, um fortzufahren.
          </div>
        </div>
        <div style={{ position: 'relative', display: 'flex' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Passwort"
            autoFocus
            autoComplete="current-password"
            aria-label="Passwort"
            style={{
              flex: 1,
              padding: '11px 42px 11px 12px',
              borderRadius: 8,
              border: `1px solid ${colors.borderStrong}`,
              fontSize: 14,
              fontFamily: fonts.sans,
              outlineColor: colors.teal,
            }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
            title={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
            style={{
              position: 'absolute',
              right: 6,
              top: 0,
              bottom: 0,
              width: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              color: colors.mutedStrong,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <EyeIcon off={showPassword} />
          </button>
        </div>
        {error && (
          <div
            role="alert"
            style={{
              fontSize: 12.5,
              color: colors.red,
              background: colors.redBg,
              border: `1px solid ${colors.redBorder}`,
              borderRadius: 8,
              padding: '8px 10px',
            }}
          >
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={busy || !password}
          style={{
            padding: '11px 12px',
            borderRadius: 8,
            border: 'none',
            background: busy || !password ? colors.muted : colors.teal,
            color: '#fff',
            fontSize: 14,
            fontWeight: 500,
            cursor: busy || !password ? 'default' : 'pointer',
          }}
        >
          {busy ? 'Anmelden…' : 'Anmelden'}
        </button>
      </form>
    </div>
  );
}
