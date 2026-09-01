import { useState } from 'react';
import { api } from '../api.js';
import { colors, fonts } from '../theme.js';

// The single password mask. On success it calls onLoggedIn so the AuthGate
// swaps in the app; the long-lived session cookie means this is normally only
// seen about once a year (or after an explicit logout).
export default function LoginScreen({ onLoggedIn }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Passwort"
          autoFocus
          autoComplete="current-password"
          aria-label="Passwort"
          style={{
            padding: '11px 12px',
            borderRadius: 8,
            border: `1px solid ${colors.borderStrong}`,
            fontSize: 14,
            fontFamily: fonts.sans,
            outlineColor: colors.teal,
          }}
        />
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
